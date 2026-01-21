// web/adwall.js
document.addEventListener("DOMContentLoaded", () => {
  const LOCAL_URL = "http://localhost:4173"
  const MIN_TIME = 20000
  const RATE_MS = 3000
  const START_KEY = "adwall_start"
  const LAST_CLICK = "adwall_last_click"

  function show(msg) { document.body.textContent = msg }

  try { localStorage.setItem("_t","1"); localStorage.removeItem("_t") }
  catch { show("Storage disabled"); throw new Error("LocalStorage not available") }

  const q = new URLSearchParams(location.search)
  const token = q.get("token")

  if (token) { location.href = `${LOCAL_URL}/validate?token=${token}`; return }

  let start = sessionStorage.getItem(START_KEY)
  if (!start) { start = Date.now(); sessionStorage.setItem(START_KEY, start) }

  const loop = setInterval(() => {
    const left = MIN_TIME - (Date.now() - start)
    if (left > 0) { show(`Wait ${Math.ceil(left / 1000)}s`); return }

    clearInterval(loop)

    const last = sessionStorage.getItem(LAST_CLICK)
    if (last && Date.now() - last < RATE_MS) { show("Please wait..."); return }
    sessionStorage.setItem(LAST_CLICK, Date.now())

    const btn = document.createElement("a")
    btn.href = "#"
    btn.textContent = "Continue"
    btn.style.display = "inline-block"
    btn.style.padding = "10px 20px"
    btn.style.background = "#4CAF50"
    btn.style.color = "#fff"
    btn.style.borderRadius = "5px"
    btn.style.textDecoration = "none"
    btn.onclick = e => { e.preventDefault(); location.href = `${LOCAL_URL}/init` }

    document.body.textContent = ""
    document.body.appendChild(btn)
  }, 1000)
})
