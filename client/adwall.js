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

      // /link - Redirect to adlink
      if (url.pathname === "/link") {
        const sid = url.searchParams.get("sid")
        if (!sessions.has(sid)) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: "Invalid session" }))
          return
        }
        res.statusCode = 302
        res.setHeader("Location", adlink)
        res.end()
        return
      }

      // /validate - Verify validation code
      if (url.pathname === "/validate") {
        const sid = url.searchParams.get("sid")
        const v = url.searchParams.get("v")
        const referrer = req.headers.referer || ""

        const session = sessions.get(sid)
        if (!session) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: "Invalid session" }))
          return
        }

        // Check referrer (must come from adlink)
        const referrerHost = referrer ? new URL(referrer).origin : ""
        const adlinkHost = new URL(adlink).origin
        if (referrerHost !== adlinkHost) {
          res.statusCode = 403
          res.end(JSON.stringify({
            error: "Invalid referrer",
            message: "Please complete the adwall and try again"
          }))
          return
        }

        // Check elapsed time
        const elapsed = Date.now() - session.startTime
        if (elapsed < session.minTime) {
          res.statusCode = 428
          res.end(JSON.stringify({
            error: "Too fast",
            message: "Please try again"
          }))
          return
        }

        // Validate code
        if (v !== session.expected) {
          res.statusCode = 401
          res.end(JSON.stringify({
            error: "Invalid code",
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

        session.validated = true
        res.end(JSON.stringify({ valid: true }))
        server.close()
        resolve({ valid: true, url: null })
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
