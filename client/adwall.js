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

/*
  Main adwall function.

  Returns a promise resolving to:
  - valid: boolean indicating whether access is granted
  - url: adwall URL the user must visit (null if already valid)
*/
module.exports = function adwall({
  adwallUrl,
  sharedKey,
  port = 4173, // Default port to run the local server
  keyFile = "key.json",
  maxAge = 1000 * 60 * 60 * 24 * 30 // Key validity duration
}) {
  return new Promise(resolve => {
    /*
      If a valid key already exists, skip the adwall entirely.
    */
    if (hasValidKey(keyFile, maxAge)) {
      resolve({ valid: true, url: null })
      return
    }

    /*
      Generate a unique session identifier and the expected
      validation code derived from the shared secret.
    */
    const sessionId = crypto.randomUUID()
    const expected = sha256(sessionId + sharedKey)

    /*
      Temporary local server used to receive the final
      validation redirect from the adwall page.
    */
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`)

      /*
        Final redirect from the adwall page.

        The "v" parameter must match the expected validation code.
      */
      if (url.pathname === "/") {
        const v = url.searchParams.get("v")
        const valid = v === expected

        /*
          On success, store the encrypted key locally.
        */
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

      res.statusCode = 404
      res.end()
    })

    /*
      Start the local server and return the adwall URL
      the user must open in a browser.
    */
    server.listen(port, () => {
      const openUrl = `${adwallUrl}?s=${sessionId}`
      resolve({ valid: false, url: openUrl })
    })
  })
}
