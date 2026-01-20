# Usage Guide

How to integrate and use Adwall in your app.

**[Usage Guide](./usage.md)** ‧ **[API Reference](./api.md)** ‧ **[Security](./security.md)** ‧ **[Troubleshooting](./troubleshooting.md)**

## Installation

You can use adwall by download a release of your choice [here](https://github.com/zaorinu-test/releases), 
> [!WARNING]
> There is not a npm package for adwall, any package distributed outside github may be compromised

## Basic Example

```javascript
const adwall = require("adwall")

async function validateApp() {
  const { valid, url } = await adwall({
    key: "your-secret-key-123",
    adwall: "https://yourdomain.com/adwall",
    adlink: "https://work.ink/offer-id",
    time: 15000
  })

  if (valid) {
    console.log("✅ Key is valid, app can continue!")
    startApp()
    return
  }

  console.log(`📱 Please visit to validate: ${url}`)
  // App waits for validation...
  // Once user completes task, key is stored automatically
}

validateApp()
```

## Configuration

### Required Options

- **key** (string) - Shared secret key. Same for all machines running the app.
- **adwall** (string) - URL to the adwall page where user completes task
- **adlink** (string) - work.ink task URL that user is redirected to
- **time** (number) - Minimum milliseconds user must stay on adwall page

### Optional Options

- **port** (number, default: 4173) - Local server port
- **keyFile** (string, default: "key.json") - Where to store encrypted key
- **maxAge** (number, default: 2592000000) - Key expiration time in ms (30 days)

## Complete Example

```javascript
const adwall = require("adwall")

async function main() {
  try {
    const result = await adwall({
      // Required
      key: "app-secret-key-keep-safe",
      adwall: "https://example.com/adwall",
      adlink: "https://work.ink/2fpz/offer",
      time: 15000,
      
      // Optional
      port: 4173,
      keyFile: "./app-key.json",
      maxAge: 1000 * 60 * 60 * 24 * 30  // 30 days
    })

    if (result.valid) {
      console.log("Key is valid!")
      return
    }

    console.log("Please visit:", result.url)
    
  } catch (error) {
    console.error("Adwall error:", error)
  }
}

main()
```

## Return Value

The promise resolves to:

```javascript
{
  valid: true,    // Key already valid, app can continue
  url: null
}

// OR

{
  valid: false,   // Need to validate
  url: "https://..." // URL user must visit
}
```

## Validation Flow

1. Call `adwall()` with config
2. Function checks if valid key exists locally
3. If valid, returns `{ valid: true }`
4. If not, starts local server and returns adwall URL
5. User visits URL, completes task
6. Local server validates token
7. Key stored, server closes
8. Next call to `adwall()` finds valid key

## Key Storage

- Stored in `keyFile` (default: `key.json`)
- Automatically encrypted with machine-specific key
- Not portable between machines (by design)
- Add `key.json` to `.gitignore`

## Advanced: Multiple Keys

If you have multiple apps/keys:

```javascript
const adwall = require("adwall")

// App 1
const app1 = await adwall({
  key: "app1-secret",
  adwall: "...",
  adlink: "...",
  time: 15000,
  keyFile: "./keys/app1-key.json"
})

// App 2
const app2 = await adwall({
  key: "app2-secret",
  adwall: "...",
  adlink: "...",
  time: 15000,
  keyFile: "./keys/app2-key.json"
})
```

## Integration Points

### On App Start

```javascript
async function initApp() {
  const { valid } = await adwall({ /* config */ })
  
  if (!valid) {
    // User must validate before continuing
    // App can wait or show loading screen
  }
}
```

### On App Load

```javascript
// Check if key exists without needing browser
const fs = require("fs")
const keyExists = fs.existsSync("./key.json")

if (keyExists) {
  // Key might be valid, try validation
  startApp()
} else {
  // Definitely need to validate
  showValidationPrompt()
}
```

### Scheduled Revalidation

```javascript
// Run validation daily/weekly
setInterval(async () => {
  const { valid } = await adwall({ /* config */ })
  if (!valid) {
    console.log("Key expired, need revalidation")
  }
}, 24 * 60 * 60 * 1000) // Daily
```

## Troubleshooting

For common issues, see [Troubleshooting Guide](./troubleshooting.md).
