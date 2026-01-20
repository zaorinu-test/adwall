/**
 * Adwall client example
 * 
 * This file demonstrates how to integrate the adwall validation
 * into a Node.js application.
 * 
 * The adwall module:
 * - Checks for an existing valid key stored locally
 * - If no key is found, starts a temporary local HTTP server
 * - Returns a URL that the user must visit to complete validation
 * - Enforces minimum delay to ensure user interaction
 * - Resolves with the validation result once the flow completes
 * 
 * Features:
 * - Machine-specific key encryption
 * - Automatic key expiration (default 30 days)
 * - Minimum delay to prevent instant redirects (default 15 seconds)
 * 
 * Notes:
 * - The adwall URL must point to the static adwall page
 * - The shared key must match the key used on the adwall page
 * - No browser is opened automatically by the app
 * - The site must call /init and respect minDelay before redirecting
 */

const adwall = require("../client/adwall")

;(async () => {
  try {
    /**
     * Start the adwall validation flow.
     * 
     * Configuration:
     * - adwallUrl: URL of the public adwall page
     * - adlink: URL to redirect after successful validation (ex: https://work.ink/offer)
     * - sharedKey: Shared secret for validation code generation
     * - port: Local validation server port
     * - minDelay: Minimum time user must see adwall (prevents auto-redirect)
     * 
     * Returned values:
     * - valid: boolean indicating whether the key is valid
     * - url: string containing the adwall URL the user must visit
     *        (null if a valid key already exists)
     */
    const { valid, url } = await adwall({
      adwallUrl: "https://zaorinu-test.github.io/adwall",  // Public adwall page URL
      adlink: "https://work.ink/2fpz/cream-key",           // Target URL after validation
      sharedKey: "place_your_key_here",                   // Shared secret key
      port: 4173,                                          // Local validation server port
      minDelay: 15000                                      // Minimum 15 seconds before redirect
    })

    /**
     * If a URL is returned, the user must open it in a browser
     * to complete the adwall validation.
     * 
     * The URL contains encoded session parameters in the 'c' query parameter.
     * This avoids direct localhost calls from the remote page (CORS issues).
     * 
     * Anti-bypass measures enforce:
     * 1. Request must come from the adwall page (referrer validation)
     * 2. Session expires after 5 minutes (prevents replay attacks)
     * 3. Minimum 15 second delay before redirect (ensures user interaction)
     * 4. Session parameters encoded in URL (prevents tampering)
     * 
     * The adwall page will:
     * 1. Decode session parameters from URL (no localhost calls)
     * 2. Display the adwall page
     * 3. Wait at least minDelay milliseconds with countdown
     * 4. Generate validation code using sessionId and sharedKey
     * 5. Redirect to callbackUrl with validation code
     * 6. App validates referrer, session expiration, and delay
     * 7. On success, user is redirected to adlink (target URL)
     */
    if (url) {
      console.log("\n🔐 Adwall validation required")
      console.log("Please visit: " + url)
      console.log("\n⏱️  Waiting for validation... (minimum 15 seconds)")
      console.log("📋 Session parameters encoded in URL (no direct localhost calls)")
      console.log("🔒 Referrer validation enabled - prevents bypass\n")
    }

    /**
     * If validation succeeds, continue with the application logic.
     */
    if (valid) {
      console.log("✅ Access granted, key is valid")
      console.log("\nYour application logic starts here...\n")
      return
    }

    /**
     * If validation fails or is aborted, the app can exit
     * or restrict functionality here.
     */
    console.log("❌ Validation failed or was aborted")
  } catch (error) {
    console.error("\n❌ Error:", error.message)
    process.exit(1)
  }
})()
