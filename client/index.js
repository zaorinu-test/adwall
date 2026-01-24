import adwall from "./modules/adwall.js"

export async function init() {
  const gate = adwall({
    adwall: "https://zaorinu-test.github.io/adwall",
    adlink: "https://work.ink/2fpz/cream-key",
    port: 4173
  })

  if (!gate.validated) {
    console.log("Open to validate:", gate.url)
  }

  await gate.ready
}
