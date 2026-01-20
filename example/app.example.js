const adwall = require("../client/adwall")

;(async () => {
  const { valid, url } = await adwall({
    key: "place_your_key_here",
    adwall: "https://zaorinu-test.github.io/adwall",
    adlink: "https://work.ink/2fpz/cream-key",
    time: 15000,
    port: 4173
  })

  if (url) console.log(url)
  if (valid) console.log("Key validated")
})()
