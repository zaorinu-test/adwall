# Adwall - Key Validation for Apps

Verify that users complete an adwall task before allowing an app to run, with encrypted local key storage and machine binding.

## Overview

An app needs users to complete a task (view an ad, complete work) before it can run. The adwall system validates this without requiring complex integration:

1. **App starts** → Check for valid key
2. **If no key** → Start local server, open adwall URL in browser
3. **User completes task** → work.ink generates a token
4. **Browser redirects** → Token sent to local server
5. **Server validates** → Token confirmed, key stored (encrypted & machine-bound)
6. **App continues** → Key is valid, ready to use

## How It Works

### Flow Diagram

```
App                    Browser                  work.ink           App Server
 |                        |                         |                  |
 |--check key.json-------->|                         |                  |
 |                        |                         |                  |
 |<--key valid------------| (continue)              |                  |
 |                        |                         |                  |
 |-- OR --                |                         |                  |
 |                        |                         |                  |
 |--start server-------->|                         |                  |
 |                        |                         |                  |
 |--open URL in browser->|                         |                  |
 |                        |--/init-------->ask for sid & time--------->|
 |                        |<--sid&time-----<--/init-----------{sid,t}--|
 |                        |                         |                  |
 |                        |--wait & continue------>|                  |
 |                        |--/link-------->ask for redirect----------->|
 |                        |<--redirect-----<--/link--work.ink redirect-|
 |                        |                         |                  |
 |                        |--complete task-------->|                  |
 |                        |<--redirect+token-------<--work.ink---------|
 |                        |--/validate?token--->ask to validate------->|
 |                        |<--key valid-----<--/validate--{valid,days}-|
 |                        |                         |                  |
 |<--key ready-----------|                         |                  |
 |
```

### Key Features

✅ **Machine-Bound Keys** - Encrypted with machine-specific data, won't work if copied elsewhere
✅ **Expiration** - Keys expire after configurable time (default: 30 days)
✅ **No Network** - Local server, no need to call your own backend
✅ **Simple Integration** - Just 1 async function to call
✅ **work.ink Compatible** - Integrates with work.ink for task validation

## Usage

### Installation

```bash
npm install adwall
```

Or require the file directly:

```javascript
const adwall = require("./client/adwall.js")
```

### Example

```javascript
const adwall = require("adwall")

async function main() {
  const { valid, url } = await adwall({
    key: "your-secret-key-123",
    adwall: "https://yourdomain.com/adwall",
    adlink: "https://work.ink/offer-id",
    time: 15000, // Min 15 seconds on adwall page
    port: 4173, // Local server port
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
  })

  if (valid) {
    console.log("✅ Key already valid, app can continue")
    return
  }

  console.log(`📱 Please visit: ${url}`)
  // User visits URL, completes task, key gets validated
  // Your app continues running automatically
}

main()
```

## API Reference

### `adwall(config)`

Returns: `Promise<{ valid: boolean, url?: string }>`

#### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `key` | string | **required** | Shared secret key (same for all machines) |
| `adwall` | string | **required** | URL to adwall page (where user goes) |
| `adlink` | string | **required** | work.ink task URL (redirected to) |
| `time` | number | **required** | Min milliseconds on adwall page |
| `port` | number | 4173 | Local server port |
| `keyFile` | string | "key.json" | Where to store encrypted key |
| `maxAge` | number | 2592000000 | Key expiration time (30 days) |

#### Response

```javascript
{ valid: true, url: null }  // Key already valid
{ valid: false, url: "https://yourdomain.com/adwall" }  // Need to validate
```

## Local Endpoints

When the app is running, these endpoints are available on `localhost:PORT`:

### `GET /init`
Initializes session, returns sessionId and timer duration.

**Query Params:**
- `redirect` (optional) - Where to redirect after init

**Response:** 302 redirect with `?sid={id}&t={milliseconds}`

### `GET /link?sid=<sessionId>`
Redirects to work.ink with callback URL.

**Response:** 302 redirect to work.ink

### `GET /validate?token=<token>`
Final validation endpoint - validates token and stores key.

**Browser Response:** Plain text
```
Your key is valid, return to the app
Expires in: 30 days
```

**API Response:** JSON
```json
{
  "valid": true,
  "expiresIn": 2592000000
}
```

## Security

### Key Storage

- Keys stored in `key.json` (ignored in `.gitignore`)
- Encrypted with **AES-256-GCM**
- Encryption key derived from: hostname + OS + arch + username
- If copied to another machine: decryption fails (machine-bound)

### Validation

- work.ink token verified via official API
- Token expiration checked (30-second window)
- IP address logged (but not hard-rejected for proxy compatibility)
- All validations logged to console with `[DEBUG]` prefix

## Troubleshooting

### "Token expired" or "Invalid token"

Usually means work.ink token is stale. Tokens last ~30 seconds, so:
- Ensure browser redirects quickly from work.ink
- Check internet connection during flow
- Try the process again

### "IP mismatch" (logged, doesn't fail)

Just a debug note if user is behind VPN/proxy. Won't block validation.

### Key won't decrypt on another machine

Expected! Keys are machine-bound for security. Run the adwall flow on each machine.

### Server won't start

Check if port 4173 is already in use:
```bash
lsof -i :4173  # See what's using it
```

Or specify a different port in config.

## File Structure

```
adwall/
├── client/
│   ├── adwall.js          # Main library (Node.js)
│   ├── adwall.min.js      # Minified version
│   └── package.json       # Dependencies
├── www/
│   └── index.html         # Adwall page (shown to user)
├── example/
│   └── app.example.js     # Usage example
└── .github/
    └── workflows/
        └── release.yaml   # Auto-release workflow
```

## Development

### Running Example

```bash
cd example
node app.example.js
```

Opens `http://localhost:4173/init` with generated URL.

### Minifying

```bash
npm run minify
```

Generates `adwall.min.js` for production use.

## License

MIT - See LICENSE filejs
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