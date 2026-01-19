/*
  Adwall client example

  This file demonstrates how to integrate the adwall validation
  into a Node.js application.

  The adwall module:
  - Checks for an existing valid key stored locally
  - If no key is found, starts a temporary local HTTP server
  - Returns a URL that the user must visit to complete validation
  - Resolves with the validation result once the flow completes

  Notes:
  - The adwall URL must point to the static adwall page
  - The shared key must match the key used on the adwall page
  - No browser is opened automatically by the app
*/

const adwall = require("../client/adwall")

;(async () => {
  /*
    Start the adwall validation flow.

    Returned values:
    - valid: boolean indicating whether the key is valid
    - url: string containing the adwall URL the user must visit
           (null if a valid key already exists)
  */
  const { valid, url } = await adwall({
    adwallUrl: "https://zaorinu-test.github.io/adwall", // Public adwall page URL
    sharedKey: "place_your_key_here",                  // Shared secret key
    port: 4173                                        // Local validation server port
  })

  /*
    If a URL is returned, the user must open it in a browser
    to complete the adwall validation.
  */
  if (url) {
    console.log(url)
  }

  /*
    If validation succeeds, continue with the application logic.
  */
  if (valid) {
    console.log("Access granted, key is valid")
    // Return used here, but you can replace with a logic for your app
    return
  }

  /*
    If validation fails or is aborted, the app can exit
    or restrict functionality here.
  */
})()
