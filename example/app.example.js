const adwall = require("../client/adwall")

;(async () => {
  const { valid, url } = await adwall({
    adwallUrl: "https://zaorinu-test.github.io/adwall",
    adlink: "https://work.ink/2fpz/cream-key",
    sharedKey: "place_your_key_here",
    port: 4173,
    minDelay: 15000
  })

  if (url) console.log(url)
  if (valid) console.log("Key validated")
})()
