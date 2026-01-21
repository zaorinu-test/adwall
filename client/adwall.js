// client/adwall.js
const http = require("http")
const https = require("https")
const crypto = require("crypto")
const fs = require("fs")
const os = require("os")
const { URL } = require("url")

const sha = v => crypto.createHash("sha256").update(v).digest()
const sharedKey = () =>
  sha(os.hostname() + os.platform() + os.arch() + os.userInfo().username)

function encrypt(obj) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv("aes-256-gcm", sharedKey(), iv)
  const data = Buffer.concat([c.update(JSON.stringify(obj)), c.final()])
  return { iv: iv.toString("hex"), tag: c.getAuthTag().toString("hex"), data: data.toString("hex") }
}

function decrypt(p) {
  const d = crypto.createDecipheriv("aes-256-gcm", sharedKey(), Buffer.from(p.iv, "hex"))
  d.setAuthTag(Buffer.from(p.tag, "hex"))
  return JSON.parse(Buffer.concat([d.update(Buffer.from(p.data, "hex")), d.final()]).toString())
}

function sign(data) {
  return crypto.createHmac("sha256", sharedKey()).update(data).digest("hex")
}

function fetchWorkink(token) {
  return new Promise(res => {
    https.get(`https://work.ink/_api/v2/token/isValid/${token}`, r => {
      let d = ""
      r.on("data", c => d += c)
      r.on("end", () => {
        try { res(JSON.parse(d)) } catch { res(null) }
      })
    }).on("error", () => res(null))
  })
}

module.exports = function adwall({ adwall, adlink, keyFile = "key.json", port = 4173 }) {
  // --- Promise que resolve quando a key é validada ---
  let resolveValidated
  const validatedPromise = new Promise(resolve => { resolveValidated = resolve })

  // --- checa se já tem key válida ---
  if (fs.existsSync(keyFile)) {
    try {
      const raw = fs.readFileSync(keyFile, "utf8")
      const data = decrypt(JSON.parse(raw))
      return {
        url: null,
        promise: (async () => {
          const info = await fetchWorkink(data.token)
          if (info && info.valid) return { valid: true, token: data.token }
        })()
      }
    } catch {}
  }

  let initAt = null

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`)

    if (url.pathname === "/init") {
      initAt = Date.now()
      res.writeHead(302, { Location: adlink })
      return res.end()
    }

    if (url.pathname === "/validate") {
      const token = url.searchParams.get("token")
      if (!initAt || Date.now() - initAt < 10_000 || !token) {
        res.writeHead(302, { Location: "/error" })
        return res.end()
      }

      const info = await fetchWorkink(token)
      if (!info || info.valid !== true) {
        res.writeHead(302, { Location: "/error" })
        return res.end()
      }

      const encrypted = encrypt({
        valid: true,
        token,
        expiresAt: info.info?.expiresAfter || null,
        at: Date.now()
      })
      fs.writeFileSync(keyFile, JSON.stringify({ ...encrypted, sig: sign(encrypted.data) }))

      res.writeHead(302, { Location: "/success" })
      res.end()

      resolveValidated({ valid: true, token })
      return
    }

    if (url.pathname === "/success") {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`
        <p>Thank you for supporting CreamHQ, now you can continue on the app!</p>
        <script>
          setTimeout(() => { window.close() }, 10000)
        </script>
      `)
      
      const interval = setTimeout(() => server.close(), 12_000)
      interval.unref()
      
      return
    }

    if (url.pathname === "/error") {
      res.writeHead(200, { "Content-Type": "text/html" })
      return res.end(`
        <p>Support us! Authenticate without bypassing any step ❤</p>
        <script>
          setTimeout(() => { location.href = "${adlink}" }, 5000)
        </script>
      `)
    }

    res.writeHead(404)
    res.end("Not found")
  })

  server.listen(port)

  return { url: adwall, promise: validatedPromise }
}
