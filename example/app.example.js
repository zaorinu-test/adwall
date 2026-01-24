// Adwall Snippet (latest)
const adwall = require("../client/adwall")

;(async () => {
  const gate = adwall({
    adwall: "https://zaorinu-test.github.io/adwall",
    adlink: "https://work.ink/2fpz/cream-key",
    port: 4173
  })

  if (!gate.validated) {
    console.log("Open to validate:", gate.url)
  }
  await gate.ready
  console.log("Adwall validated, welcome to Cream!")
})()

// Code logic after validation
