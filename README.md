# Adwall Key Validation

Minimal, serverless adwall validation between a local Node.js app and a public web page.

The goal is to confirm that a user has visited an adwall page before allowing the app to continue, without copy-paste, without forcing the app to open a browser, and with validation bound to the local machine.

## Overview

The app and the website share a secret key.  
The app generates a temporary session and waits for a validation callback from the website.  
The website computes a validation code and redirects back to the local app.  
Once validated, the app stores an encrypted key and skips the adwall on future runs.

The public URL the user visits is always the same.

## Validation Flow

1. The app starts and checks for an existing valid key.
2. If no key is found, a temporary localhost server is started.
3. The app prints the adwall URL for the user to visit.
4. The user opens the adwall page in a browser.
5. The adwall page contacts the local app and receives a session identifier.
6. The adwall page computes a validation code using the shared key.
7. The browser is redirected back to the local app with the validation code.
8. The app validates the code, stores the encrypted key, and shuts down the server.

## Key Storage

- Keys are stored locally in `key.json`.
- The file contents are encrypted using AES-256-GCM.
- The encryption key is derived from machine-specific data.
- A stored key is invalid on a different machine.

## Expiration

- Stored keys have a configurable maximum age.
- Once expired, the adwall flow is required again.

## adwall.js

`adwall.js` exports a function that can be reused across multiple apps.

The function:
- Checks for an existing valid key
- Starts the validation server if needed
- Returns a promise resolving to `true` or `false`
- Prints the URL the user must visit

## Example Usage

```js
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