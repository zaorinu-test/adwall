const adwall = require("../client/adwall")

;(async () => {
  const waitAd = adwall({
    adwall: "https://zaorinu-test.github.io/adwall",
    adlink: "https://work.ink/2fpz/cream-key",
    port: 4173
  })

  if (waitAd.url) {
    console.log("Open this URL to validate:", waitAd.url)
    await waitAd.promise
  }
})()
