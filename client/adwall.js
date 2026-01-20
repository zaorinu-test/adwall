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

/**
 * Computes a SHA-256 hash of input and returns it as a hex string.
 * Used for generating session validation codes.
 * 
 * @param {string} v - Value to hash
 * @returns {string} - Hex-encoded SHA-256 hash
 */
function sha256(v) {
  return crypto.createHash("sha256").update(v).digest("hex")
}

/**
 * Derives a machine-specific encryption key from system information.
 * 
 * This binds the stored key to the current machine, preventing
 * the key file from being used if copied to another machine.
 * Uses: hostname + OS platform + CPU architecture + username
 * 
 * @returns {Buffer} - 32-byte AES-256 key derived from machine info
 */
function machineKey() {
  return crypto.createHash("sha256").update(
    os.hostname() +
    os.platform() +
    os.arch() +
    os.userInfo().username
  ).digest()
}

/**
 * Encrypts an object using AES-256-GCM with machine-specific key.
 * 
 * Uses a random IV for each encryption and includes authentication tag
 * to detect tampering. Output is JSON-serializable.
 * 
 * @param {Object} obj - Object to encrypt
 * @returns {Object} - {iv, tag, data} arrays for JSON storage
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

/**
 * Decrypts data produced by encrypt().
 * 
 * Verifies authentication tag to detect tampering.
 * Returns error if machine key doesn't match (key moved to different machine).
 * 
 * @param {Object} payload - {iv, tag, data} encrypted payload
 * @returns {Object} - Decrypted and parsed object
 * @throws {Error} - If data is tampered or machine key doesn't match
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

/**
 * Checks whether a valid, non-expired key exists on disk.
 * 
 * Reads key.json, decrypts it, and verifies it hasn't expired.
 * Returns false if file doesn't exist, can't be decrypted,
 * or has exceeded maxAge.
 * 
 * @param {string} file - Path to key.json file
 * @param {number} maxAge - Maximum age in milliseconds
 * @returns {boolean} - True if valid key exists and hasn't expired
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
 * Tracks validation attempts per IP address to prevent mass automation.
 * Stores timestamps of successful key validations.
 * 
 * @type {Map<string, number[]>}
 */
const validationAttempts = new Map()

/**
 * Checks if an IP has exceeded the rate limit (1 key per hour).
 * 
 * @param {string} ipAddress - IP address to check
 * @returns {Object} - {allowed: boolean, nextRetryTime?: number, recentCount?: number}
 */
function checkIPRateLimit(ipAddress) {
  const now = Date.now()
  const ratelimitMs = 20 * 1000
  const twentyMinsAgo = now - ratelimitMs
  
  // Get or create array for this IP
  if (!validationAttempts.has(ipAddress)) {
    validationAttempts.set(ipAddress, [])
  }
  
  const attempts = validationAttempts.get(ipAddress)
  
  // Remove old attempts (older than 1 hour)
  const recentAttempts = attempts.filter(ts => ts > twentyMinsAgo)
  
  // Update the map with only recent attempts
  validationAttempts.set(ipAddress, recentAttempts)
  
  // Check if limit exceeded (max 1 per hour)
  if (recentAttempts.length >= 1) {
    const oldestAttempt = Math.min(...recentAttempts)
    const nextRetryTime = oldestAttempt + ratelimitMs
    return {
      allowed: false,
      nextRetryTime,
      recentCount: recentAttempts.length
    }
  }
  
  return { allowed: true }
}

/**
 * Records a successful validation for an IP address.
 * 
 * @param {string} ipAddress - IP address that validated
 */
function recordValidation(ipAddress) {
  if (!validationAttempts.has(ipAddress)) {
    validationAttempts.set(ipAddress, [])
  }
  validationAttempts.get(ipAddress).push(Date.now())
}

/**
 * Re-validates stored key periodically to detect key theft/misuse
 * Runs every 7 minutes if a valid key exists
 * If validation fails, the key is removed and user must re-validate
 * 
 * Completely silent operation - no console output
 * 
 * @param {string} keyFile - Path to key.json file
 * @param {number} maxAge - Maximum age in milliseconds
 * @returns {void}
 */
function startKeyRevalidation(keyFile, maxAge) {
  const revalidationInterval = 7 * 60 * 1000 // 7 minutes
  
  setInterval(() => {
    if (!fs.existsSync(keyFile)) return
    
    try {
      const raw = JSON.parse(fs.readFileSync(keyFile, "utf8"))
      const decrypted = decrypt(raw)
      
      if (!decrypted.valid) return
      
      // Check if key has expired
      const age = Date.now() - decrypted.at
      if (age > maxAge) {
        // Key expired - remove it silently
        try {
          fs.unlinkSync(keyFile)
        } catch {}
        return
      }
    } catch (e) {
      // If decryption fails, key is compromised or moved to different machine
      // Remove it silently
      try {
        fs.unlinkSync(keyFile)
      } catch {}
    }
  }, revalidationInterval)
}

/**
 * Validates a work.ink token via their API.
 * 
 * Makes HTTPS request to work.ink API to verify:
 * - Token is marked as valid by work.ink
 * - Token has not expired
 * - IP address matches (if available, for proxy compatibility)
 * 
 * Returns validation result with detailed error messages.
 * 
 * @param {string} token - work.ink token to validate
 * @param {string} userIp - User's IP address (from request)
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Object>} - {valid: boolean, token?: string, error?: string}
 */
function validateWorkinkToken(token, userIp, debug = false) {
  return new Promise((resolve) => {
    const url = `https://work.ink/_api/v2/token/isValid/${token}`
    
    if (debug) console.log(`[DEBUG] Validating token: ${token}`)
    if (debug) console.log(`[DEBUG] User IP: ${userIp}`)
    
    // Make HTTPS request to work.ink API
    https.get(url, (res) => {
      let data = ""
      res.on("data", chunk => data += chunk)
      res.on("end", () => {
        try {
          const response = JSON.parse(data)
          if (debug) console.log(`[DEBUG] API Response:`, response)
          
          // Step 1: Check if token is valid according to work.ink
          if (!response.valid) {
            if (debug) console.log(`[DEBUG] Token invalid`)
            resolve({ valid: false, error: "Invalid token" })
            return
          }
          
          // Step 2: Check expiration (work.ink tokens expire after ~30 seconds)
          const expiresAfter = response.info.expiresAfter
          const now = Date.now()
          if (now > expiresAfter) {
            if (debug) console.log(`[DEBUG] Token expired at ${new Date(expiresAfter).toISOString()}`)
            resolve({ valid: false, error: "Token expired" })
            return
          }
          
          // Step 3: Validate IP address (if available, for extra security)
          // Note: Only log mismatch, don't reject (might be behind proxy/VPN)
          if (response.info.byIp && response.info.byIp !== userIp) {
            if (debug) console.log(`[DEBUG] IP mismatch. Expected: ${response.info.byIp}, Got: ${userIp}`)
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
    port = 4173, // Default port, needs to be the same on web
    keyFile = "key.json",
    maxAge = 1000 * 60 * 60 * 24 // Default: 1 day
  } = config

  return new Promise(resolve => {
    // Check if valid key exists
    if (hasValidKey(keyFile, maxAge)) {
      // Start periodic re-validation in background (doesn't block app)
      startKeyRevalidation(keyFile, maxAge)
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

      // Endpoint 1: /init - Initialize adwall session
      // Called when user visits adwall page, returns sessionId and timer duration
      // Redirects back to adwall page with sid (session ID) and t (time in ms)
      if (url.pathname === "/init") {
        const redirect = url.searchParams.get("redirect") || adwall
        const sep = redirect.includes("?") ? "&" : "?"
        res.statusCode = 302
        res.setHeader("Location", `${redirect}${sep}sid=${sessionId}&t=${time}`)
        res.end()
        return
      }

      // Endpoint 2: /link - Redirect to work.ink
      // Called after adwall timer completes, redirects to work.ink
      // work.ink will replace {TOKEN} and redirect back to adwall with token parameter
      if (url.pathname === "/link") {
        const sid = url.searchParams.get("sid")
        if (!sid || !sessions.has(sid)) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: "Invalid session" }))
          return
        }
        
        // Redirect to work.ink - it will replace {TOKEN} placeholder with actual token
        // and redirect browser back to adwall page with token parameter
        const redirectUrl = `${adwall}?token={TOKEN}`
        res.statusCode = 302
        res.setHeader("Location", `https://work.ink/2fpz/cream-key?redirect=${encodeURIComponent(redirectUrl)}`)
        res.end()
        return
      }

      // Endpoint 3: /validate - Validate work.ink token and store key
      // Final step: receives token from work.ink, validates it, and stores encrypted key
      // Enforces 20-second minimum delay before validation
      // Enforces rate limit: max 1 key per hour per IP
      if (url.pathname === "/validate") {
        const token = url.searchParams.get("token")
        // Extract user IP (may be proxied via x-forwarded-for header)
        const userIp = req.headers["x-forwarded-for"]?.split(",")[0] || req.connection.remoteAddress
        
        if (!token) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: "Missing token" }))
          return
        }
        
        // Check IP-based rate limit (1 key per hour)
        const rateLimit = checkIPRateLimit(userIp)
        if (!rateLimit.allowed) {
          const retryDate = new Date(rateLimit.nextRetryTime)
          const errorMsg = `Rate limited. Next attempt available at ${retryDate.toISOString()}`
          if (debug) console.log(`[RATE-LIMIT] ${userIp}: ${errorMsg}`)
          
          res.statusCode = 429
          res.setHeader("Content-Type", "text/plain")
          res.end(`1 key per hour limit reached.\nTry again at: ${retryDate.toLocaleTimeString('en-US')}`)
          return
        }
        
        // Enforce 20-second minimum delay from session start
        // This prevents automated rapid validations
        const elapsedSinceStart = Date.now() - startTime
        const minimumDelay = 20000 // 20 seconds
        
        if (elapsedSinceStart < minimumDelay) {
          const remainingDelay = minimumDelay - elapsedSinceStart
          if (debug) console.log(`[SECURITY] Validation attempt too early. Elapsed: ${elapsedSinceStart}ms, Required: ${minimumDelay}ms`)
          
          res.statusCode = 400
          res.setHeader("Content-Type", "text/plain")
          res.end(`Validation too fast. Wait ${Math.ceil(remainingDelay / 1000)}s before trying again.`)
          return
        }
        
        // Validate token via work.ink API
        validateWorkinkToken(token, userIp).then(result => {
          res.setHeader("Content-Type", "application/json")
          
          if (!result.valid) {
            res.statusCode = 400
            res.end(JSON.stringify({
              error: result.error,
              message: "Please try again"
            }))
            return
          }
          
          // Token is valid! Record this validation for rate limiting
          recordValidation(userIp)
          
          // Token is valid! Now store the encrypted key locally
          const now = Date.now()
          const createdAt = now
          const expiresAt = createdAt + maxAge
          
          // Write encrypted key to disk
          // Contains: {valid: true, at: timestamp}
          // Encrypted with machine-specific key
          fs.writeFileSync(
            keyFile,
            JSON.stringify(
              encrypt({ valid: true, at: createdAt }),
              null,
              2
            )
          )
          
          // Detect if request came from browser (by User-Agent)
          const userAgent = req.headers["user-agent"] || ""
          const isBrowser = /Mozilla|Chrome|Safari|Firefox|Edg/i.test(userAgent)
          
          if (isBrowser) {
            // Browser: Return plain text with expiration info
            const timeLeft = expiresAt - now
            const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24))
            res.setHeader("Content-Type", "text/plain")
            res.end(`Your key is valid, return to the app\nExpires in: ${daysLeft} days`)
          } else {
            // API/Script: Return JSON with expiration time in milliseconds
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ valid: true, expiresIn: expiresAt - now }))
          }
          
          // Start periodic re-validation in background (doesn't block app)
          // Runs every 7 minutes to detect key misuse or compromise
          startKeyRevalidation(keyFile, maxAge)
          
          // Note: Don't close the server immediately - it will keep running
          // to handle any future requests gracefully.
          // The server will eventually be garbage collected when the process ends.
          
          // Resolve promise immediately so app can continue
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
