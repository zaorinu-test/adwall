/* 
   Made by Luis Antonio <zaorinu@gmail.com>
   You can use this script in any project, this is a example script used to contact an relay of the adwall service
   Also, you can obfuscate this script to avoid any attempt to reverse-engineering on your adwall
*/

const http = require("http")
const crypto = require("crypto")
const fs = require("fs")
const os = require("os")
const { URL } = require("url")
const https = require("https")

/*
  Computes a SHA-256 hash and returns it as a hex string.
  Used to derive the expected validation code.
*/
function sha256(v) {
  return crypto.createHash("sha256").update(v).digest("hex")
}

/*
  Derives a machine-specific key used for local encryption.

  This binds the stored key to the current machine, making
  the encrypted file unusable if copied elsewhere.
*/
function machineKey() {
  return crypto.createHash("sha256").update(
    os.hostname() +
    os.platform() +
    os.arch() +
    os.userInfo().username
  ).digest()
}

/*
  Encrypts an object using AES-256-GCM.

  The output is a JSON-safe structure containing:
  - iv: initialization vector
  - tag: authentication tag
  - data: encrypted payload
*/
function encrypt(obj) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", machineKey(), iv)

  const data = Buffer.concat([
    cipher.update(JSON.stringify(obj)),
    cipher.final()
  ])

  return {
    iv: [...iv],
    tag: [...cipher.getAuthTag()],
    data: [...data]
  }
}

/*
  Decrypts data produced by encrypt().

  Throws if the data was tampered with or if the machine key
  does not match the original one.
*/
function decrypt(payload) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    machineKey(),
    Buffer.from(payload.iv)
  )

  decipher.setAuthTag(Buffer.from(payload.tag))

  const data = Buffer.concat([
    decipher.update(Buffer.from(payload.data)),
    decipher.final()
  ])

  return JSON.parse(data.toString())
}

/*
  Checks whether a valid, non-expired key exists on disk.
*/
function hasValidKey(file, maxAge) {
  if (!fs.existsSync(file)) return false

  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"))
    const d = decrypt(raw)

    if (!d.valid) return false
    if (Date.now() - d.at > maxAge) return false

    return true
  } catch {
    return false
  }
}

/**
 * Validate token via work.ink API
 */
function validateWorkinkToken(token, userIp, debug = false) {
  return new Promise((resolve) => {
    const url = `https://work.ink/_api/v2/token/isValid/${token}`
    
    if (debug) console.log(`[DEBUG] Validating token: ${token}`)
    if (debug) console.log(`[DEBUG] User IP: ${userIp}`)
    
    https.get(url, (res) => {
      let data = ""
      res.on("data", chunk => data += chunk)
      res.on("end", () => {
        try {
          const response = JSON.parse(data)
          if (debug) console.log(`[DEBUG] API Response:`, response)
          
          // Check if token is valid
          if (!response.valid) {
            if (debug) console.log(`[DEBUG] Token invalid`)
            resolve({ valid: false, error: "Invalid token" })
            return
          }
          
          // Check expiration (default 30 seconds)
          const expiresAfter = response.info.expiresAfter
          const now = Date.now()
          if (now > expiresAfter) {
            if (debug) console.log(`[DEBUG] Token expired at ${new Date(expiresAfter).toISOString()}`)
            resolve({ valid: false, error: "Token expired" })
            return
          }
          
          // Validate IP address (if available)
          if (response.info.byIp && response.info.byIp !== userIp) {
            if (debug) console.log(`[DEBUG] IP mismatch. Expected: ${response.info.byIp}, Got: ${userIp}`)
            // Note: Don't reject on IP mismatch for now (might be behind proxy)
            // resolve({ valid: false, error: "IP mismatch" })
            // return
          }
          
          if (debug) console.log(`[DEBUG] Token valid! Expires in ${expiresAfter - now}ms`)
          resolve({ valid: true, token: response.info.token })
        } catch (e) {
          if (debug) console.log(`[DEBUG] Parse error:`, e.message)
          resolve({ valid: false, error: "Validation error" })
        }
      })
    }).on("error", (e) => {
      if (debug) console.log(`[DEBUG] API error:`, e.message)
      resolve({ valid: false, error: "API error" })
    })
  })
}

/**
 * Adwall validation function
 * 
 * Flow:
 * 1. App generates sessionId and opens simple URL
 * 2. User opens URL -> Pages calls /init to get params
 * 3. User completes adwall -> Pages redirects to /link
 * 4. App redirects to adlink (external target)
 * 5. Adlink redirects to pages/validate
 * 6. Pages calls /validate to complete flow
 * 7. App validates and stores key (or asks to retry)
 * 
 * @param {Object} config
 * @param {string} config.key - Shared secret key
 * @param {string} config.adwall - Adwall page URL
 * @param {string} config.adlink - Target URL after adwall
 * @param {number} config.time - Minimum time on adwall (ms)
 * @param {number} config.port - Local server port (default: 4173)
 * @param {string} config.keyFile - Key storage file (default: key.json)
 * @param {number} config.maxAge - Key validity (default: 30 days)
 * 
 * @example
 * const { valid, url } = await adwall({
 *   key: "secret123",
 *   adwall: "https://example.com/adwall",
 *   adlink: "https://work.ink/offer",
 *   time: 15000
 * })
 * // Returns simple URL: https://example.com/adwall
 */
module.exports = function adwall(config = {}) {
  // Validate required arguments
  if (!config.key) {
    throw new Error("Missing: key")
  }
  if (!config.adwall) {
    throw new Error("Missing: adwall")
  }
  if (!config.adlink) {
    throw new Error("Missing: adlink")
  }
  if (!config.time) {
    throw new Error("Missing: time")
  }

  const {
    key,
    adwall,
    adlink,
    time,
    port = 4173,
    keyFile = "key.json",
    maxAge = 1000 * 60 * 60 * 24 * 30
  } = config

  return new Promise(resolve => {
    // Check if valid key exists
    if (hasValidKey(keyFile, maxAge)) {
      resolve({ valid: true, url: null })
      return
    }

    // Generate session
    const sessionId = crypto.randomUUID()
    const expected = sha256(sessionId + key)
    const startTime = Date.now()
    const adwallHost = new URL(adwall).origin

    // Store active sessions
    const sessions = new Map()
    sessions.set(sessionId, {
      expected,
      startTime,
      minTime: time,
      validated: false
    })

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`)

      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", adwallHost)
      res.setHeader("Access-Control-Allow-Methods", "GET, POST")
      res.setHeader("Content-Type", "application/json")

      // /init - Redirect back to adwall page with sessionId
      if (url.pathname === "/init") {
        const redirect = url.searchParams.get("redirect") || adwall
        const sep = redirect.includes("?") ? "&" : "?"
        res.statusCode = 302
        res.setHeader("Location", `${redirect}${sep}sid=${sessionId}&t=${time}`)
        res.end()
        return
      }

      // /link - Redirect to work.ink
      if (url.pathname === "/link") {
        const sid = url.searchParams.get("sid")
        if (!sid || !sessions.has(sid)) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: "Invalid session" }))
          return
        }
        
        // Redirect to work.ink - work.ink will replace {TOKEN} with actual token
        // and redirect back to adwall page with the token
        const redirectUrl = `${adwall}?token={TOKEN}`
        res.statusCode = 302
        res.setHeader("Location", `https://work.ink/2fpz/cream-key?redirect=${encodeURIComponent(redirectUrl)}`)
        res.end()
        return
      }

      // /validate - Validate work.ink token
      if (url.pathname === "/validate") {
        const token = url.searchParams.get("token")
        const userIp = req.headers["x-forwarded-for"]?.split(",")[0] || req.connection.remoteAddress
        
        if (!token) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: "Missing token" }))
          return
        }
        
        // Validate token via work.ink API (with debugging)
        validateWorkinkToken(token, userIp, true).then(result => {
          res.setHeader("Content-Type", "application/json")
          
          if (!result.valid) {
            res.statusCode = 400
            res.end(JSON.stringify({
              error: result.error,
              message: "Please try again"
            }))
            return
          }
          
          // Success - store key
          fs.writeFileSync(
            keyFile,
            JSON.stringify(
              encrypt({ valid: true, at: Date.now() }),
              null,
              2
            )
          )
          
          console.log("[SUCCESS] Key validated and stored")
          res.end(JSON.stringify({ valid: true }))
          server.close()
          resolve({ valid: true, url: null })
        })
        return
      }

      res.statusCode = 404
      res.end(JSON.stringify({ error: "Not found" }))
    })

    server.listen(port, () => {
      resolve({ valid: false, url: adwall })
    })
  })
}
