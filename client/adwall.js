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
 * Main adwall validation function.
 * 
 * Workflow:
 * 1. Check if valid key already exists locally
 * 2. If yes: resolve immediately with valid=true
 * 3. If no: start local HTTP server and return adwall URL
 * 4. User visits URL, site calls /init to get sessionId and adlink
 * 5. Site validates referrer to prevent bypass attempts
 * 6. Site generates validation code and redirects to adlink
 * 7. Server validates code, referrer, and sessionId
 * 8. Stores encrypted key locally
 * 
 * Anti-bypass measures:
 * - Referrer validation to ensure requests come from adwall page
 * - SessionId expiration to prevent replay attacks
 * - Machine-specific encryption for stored keys
 * 
 * @param {Object} config - Configuration object
 * @param {string} config.adwallUrl - REQUIRED: Public adwall page URL
 * @param {string} config.adlink - REQUIRED: Target URL after successful validation (ex: https://work.ink/offer)
 * @param {string} config.sharedKey - REQUIRED: Shared secret between app and site
 * @param {number} config.port - Local server port (default: 4173)
 * @param {string} config.keyFile - Path to store encrypted key (default: key.json)
 * @param {number} config.maxAge - Key validity in ms (default: 30 days)
 * @param {number} config.minDelay - Minimum delay before redirect in ms (default: 15000 = 15s)
 * @param {number} config.sessionTimeout - Session expiration in ms (default: 5 minutes)
 * 
 * @returns {Promise<{valid: boolean, url: string|null}>}
 * @throws {Error} If required arguments (adwallUrl, adlink, sharedKey) are missing
 * 
 * @example
 * const { valid, url } = await adwall({
 *   adwallUrl: "https://example.com/adwall",
 *   adlink: "https://work.ink/offer-xyz",
 *   sharedKey: "your-secret-key",
 *   minDelay: 10000
 * })
 */
module.exports = function adwall(config = {}) {
  // Validate required arguments
  if (!config.adwallUrl) {
    throw new Error(
      "Missing required argument: adwallUrl\n" +
      "Usage: adwall({ adwallUrl: 'https://...', adlink: 'https://...', sharedKey: 'secret' })"
    )
  }

  if (!config.adlink) {
    throw new Error(
      "Missing required argument: adlink (target URL after validation)\n" +
      "Usage: adwall({ adwallUrl: 'https://...', adlink: 'https://...', sharedKey: 'secret' })"
    )
  }

  if (!config.sharedKey) {
    throw new Error(
      "Missing required argument: sharedKey\n" +
      "Usage: adwall({ adwallUrl: 'https://...', adlink: 'https://...', sharedKey: 'secret' })"
    )
  }

  // Destructure with defaults
  const {
    adwallUrl,
    adlink,
    sharedKey,
    port = 4173,
    keyFile = "key.json",
    maxAge = 1000 * 60 * 60 * 24 * 30,
    minDelay = 15000,  // Default 15 seconds
    sessionTimeout = 1000 * 60 * 5  // Default 5 minutes
  } = config

  return new Promise(resolve => {
    // Fast path: existing valid key found, no need for validation
    if (hasValidKey(keyFile, maxAge)) {
      resolve({ valid: true, url: null })
      return
    }

    // Generate session identifier and expected validation code
    const sessionId = crypto.randomUUID()
    const expected = sha256(sessionId + sharedKey)
    const startTime = Date.now()
    const adwallUrlObj = new URL(adwallUrl)
    const expectedReferrer = adwallUrlObj.origin  // Anti-bypass: validate referrer domain

    // Create local HTTP server for validation flow
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`)

      // Endpoint 1: /init
      // The adwall page calls this to get:
      // - sessionId: unique identifier for this session
      // - callbackUrl: where to redirect after validation
      // - adlink: target URL to open after successful validation
      // - minDelay: minimum delay before redirect is allowed (ms)
      // - sessionTimeout: when this session expires
      if (url.pathname === "/init") {
        res.setHeader("Content-Type", "application/json")
        res.end(JSON.stringify({
          sessionId,
          callbackUrl: `http://${req.headers.host}/`,
          adlink,
          minDelay,
          sessionTimeout,
          expiresAt: Date.now() + sessionTimeout
        }))
        return
      }

      // Endpoint 2: /
      // Final redirect from adwall page with validation code
      // The site generates the validation code based on sessionId and sharedKey
      if (url.pathname === "/") {
        // Anti-bypass measure 1: Check referrer domain
        const referrer = req.headers.referer || req.headers.referrer || ""
        const referrerUrl = referrer ? new URL(referrer).origin : null
        const referrerValid = referrerUrl === expectedReferrer

        // Anti-bypass measure 2: Check session expiration
        const elapsed = Date.now() - startTime
        const sessionExpired = elapsed > sessionTimeout

        // Anti-bypass measure 3: Enforce minimum delay
        const valid = url.searchParams.get("v") === expected

        if (!referrerValid) {
          res.setHeader("Content-Type", "application/json")
          res.statusCode = 403  // Forbidden
          res.end(JSON.stringify({
            error: "invalid_referrer",
            message: "Request must come from the adwall page",
            expected: expectedReferrer,
            received: referrerUrl
          }))
          server.close()
          resolve({ valid: false, url: null })
          return
        }

        if (sessionExpired) {
          res.setHeader("Content-Type", "application/json")
          res.statusCode = 408  // Request Timeout
          res.end(JSON.stringify({
            error: "session_expired",
            message: "Session has expired, please try again",
            expirationTime: sessionTimeout
          }))
          server.close()
          resolve({ valid: false, url: null })
          return
        }

        if (elapsed < minDelay) {
          res.setHeader("Content-Type", "application/json")
          res.statusCode = 429  // Too Soon
          res.end(JSON.stringify({
            error: "minimum_delay_not_met",
            message: `Wait ${minDelay - elapsed}ms before redirecting`,
            remainingDelay: minDelay - elapsed
          }))
          return
        }

        // On successful validation, encrypt and store key locally
        if (valid) {
          fs.writeFileSync(
            keyFile,
            JSON.stringify(
              encrypt({ valid: true, at: Date.now() }),
              null,
              2
            )
          )
        }

        res.setHeader("Content-Type", "application/json")
        res.end(JSON.stringify({ valid }))

        server.close()
        resolve({ valid, url: null })
        return
      }

      // Handle unknown endpoints
      res.statusCode = 404
      res.end()
    })

    // Start server and return adwall URL (without query params)
    // The adwall page will call /init to get sessionId and callbackUrl
    server.listen(port, () => {
      resolve({ valid: false, url: adwallUrl })
    })
  })
}
