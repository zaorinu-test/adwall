# Adwall Documentation

Complete guide for integrating and using the Adwall key validation system.

## Quick Links

- [Usage Guide](./usage.md) - How to integrate adwall in your app
- [API Reference](./api.md) - Detailed endpoint and config documentation
- [Security](./security.md) - How keys are stored and protected
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

## Overview

Adwall validates that users complete a task (e.g., view an ad, complete work) before allowing an app to run. It handles:

- Local key validation and storage
- Machine-bound encryption (key won't work if copied)
- Expiration management
- work.ink integration
- Automatic browser flow

## How It Works

1. App checks for valid key on disk
2. If no key, start local server and open browser
3. User completes task on adwall page via work.ink
4. work.ink generates token and redirects back
5. Token validated by local server
6. Encrypted key stored locally (machine-specific)
7. App continues, next run skips adwall

## Installation

```bash
npm install adwall
```

Or use directly:

```javascript
const adwall = require("./client/adwall.js")
```

## Basic Usage

```javascript
const adwall = require("adwall")

async function main() {
  const { valid, url } = await adwall({
    key: "your-secret-key",
    adwall: "https://yourdomain.com/adwall",
    adlink: "https://work.ink/offer-id",
    time: 15000
  })

  if (valid) {
    console.log("Key is valid, app ready!")
    return
  }

  console.log(`Visit: ${url}`)
}

main()
```

## File Structure

```
adwall/
├── client/
│   ├── adwall.js      # Main library
│   └── package.json   # Dependencies
├── www/
│   └── index.html     # Adwall page
├── example/
│   └── app.example.js # Usage example
└── docs/              # This documentation
```

## Key Features

- ✅ Machine-bound encryption
- ✅ Configurable expiration
- ✅ No backend needed (local server)
- ✅ work.ink compatible
- ✅ Simple async/await API

For detailed information, see the [usage guide](./usage.md).
