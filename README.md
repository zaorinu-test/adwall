# Adwall - Key Validation for Apps

Verify that users complete an adwall task before allowing an app to run, with encrypted local key storage and machine binding.

## Overview

An app needs users to complete a task (view an ad, complete work) before it can run. The adwall system validates this without requiring complex integration.

**Key benefits:**
- Local validation, no backend needed
- Machine-bound keys (won't work if copied)
- Configurable expiration
- work.ink integration
- Simple async/await API

## Quick Start

Install:
```bash
npm install adwall
```

Use:
```javascript
const adwall = require("adwall")

const { valid, url } = await adwall({
  key: "your-secret-key",
  adwall: "https://yourdomain.com/adwall",
  adlink: "https://work.ink/offer-id",
  time: 15000
})

if (valid) {
  console.log("Key is valid, app ready!")
} else {
  console.log(`Please visit: ${url}`)
}
```

## How It Works

1. App calls `adwall()` to validate
2. If no valid key exists:
   - Local server starts on port 4173
   - Browser opens to adwall page
   - User completes task via work.ink
   - Token redirected back to local server
   - Token validated, key encrypted and stored
3. If valid key exists:
   - App continues immediately
4. Next run finds existing key, skips adwall

## Documentation

Full documentation is in the `/docs` folder:

- **[Usage Guide](./docs/usage.md)** - How to integrate adwall
- **[API Reference](./docs/api.md)** - Endpoints and configuration
- **[Security](./docs/security.md)** - How keys are protected
- **[Troubleshooting](./docs/troubleshooting.md)** - Common issues

## Features

✅ Machine-bound encryption - Key won't work if copied to another computer
✅ Expiration support - Keys expire after configurable time
✅ Local validation - No backend required
✅ work.ink compatible - Integrates with work.ink tasks
✅ Tamper detection - AES-256-GCM prevents modifications
✅ Simple API - Just one async function to call

## Configuration

```javascript
await adwall({
  // Required
  key: "your-secret",                        // Shared key
  adwall: "https://yourdomain.com/adwall",   // Adwall page
  adlink: "https://work.ink/offer",          // work.ink task
  time: 15000,                               // Min time on page (ms)
  
  // Optional
  port: 4173,                                // Local server port
  keyFile: "key.json",                       // Storage file
  maxAge: 1000 * 60 * 60 * 24 * 30          // 30 days
})
```

## Response

Returns:
```javascript
{ valid: true, url: null }          // Key is valid
{ valid: false, url: "https://..." }  // Need validation
```

## File Structure

```
adwall/
├── client/
│   ├── adwall.js      # Main library
│   ├── adwall.min.js  # Minified
│   └── package.json
├── www/
│   └── index.html     # Adwall page
├── example/
│   └── app.example.js # Usage example
└── docs/              # Documentation
```

## Development

Run example:
```bash
cd example
node app.example.js
```

Minify:
```bash
npm run minify
```

## License

MIT - See LICENSE file

---

**[Full Documentation](./docs/README.md)** | **[API Reference](./docs/api.md)** | **[Troubleshooting](./docs/troubleshooting.md)**js
const adwall = require("./client/adwall")

adwall({
  adwallUrl: "https://your-adwall-page",
  sharedKey: "your_shared_key"
}).then(valid => {
  if (!valid) process.exit(1)
  console.log("Adwall validated")
})
````

## Website Script

The adwall page runs a small JavaScript snippet that:

* Detects first contact from the app
* Requests a session identifier
* Computes a SHA-256 validation code
* Redirects back to the local app

No server logic is required on the website side.

## Notes

* This is not DRM.
* This does not prevent reverse engineering.
* It is designed to be simple, portable, and dependency-free.
* Best used as a friction mechanism, not a hard security boundary.