# Adwall - Key Validation for Apps

Verify that users complete an adwall task before allowing an app to run, with encrypted local key storage and machine binding.

**[Usage Guide](./docs/usage.md)** ‧ **[API Reference](./docs/api.md)** ‧ **[Security](./docs/security.md)** ‧ **[Troubleshooting](./docs/troubleshooting.md)**

An app needs users to complete a task (view an ad, complete work) before it can run. The adwall system validates this without requiring complex integration.

## Using adwall

You can use adwall by download a release of your choice [here](https://github.com/zaorinu-test/releases), 
> [!WARNING]
> There is not a npm package for adwall, any package distributed outside github may be compromised

### Code Snippets for Adwall

```javascript
const adwall = require("path-to-adwall")

const { valid, url } = await adwall({

  key: "your-secret-key", // Key you want to use (needs to be shared between the app and website)

  adwall: "https://yourdomain.com/adwall", // Landing page used on first step of adwall

  adlink: "https://work.ink/offer-id", // Your monetized link from work.ink

  time: 15000 // Minimal ammount of time the user needs to spend on advertisement link
})

if (valid) { // "valid" is a boolean value returned to the app when user passes the adwall

console.log("Key is valid, app ready!")
// Any logic can be implemented here

} else {

// User don't have a key, return adwall link
console.log(`Please visit: ${url}`)

}
```

## Configuration

```javascript
await adwall({
  // Required
  key: "your-secret",                        // Shared key
  adwall: "https://yourdomain.com/adwall",   // Adwall page
  adlink: "https://work.ink/offer",          // work.ink task
  time: 15000,                               // Min time on page (ms)
  
  // Optional
  port: 4173,                                // Local server port, needs to be the same on www and app
  keyFile: "key.json",                       // Storage file, change to any desired file
  maxAge: 1000 * 60 * 60 * 24 * 30          // Max age of key stored on system
})
```

## Response

Returns:
```javascript
{ valid: true, url: null }          // Key is valid
{ valid: false, url: "https://..." }  // Need validation
```

No server logic is required on the website side, but you can adapt the script to make it better to your use
* This does not prevent reverse engineering.
* It is designed to be simple, portable, and dependency-free.
* Best used as a friction mechanism, not a hard security boundary.
