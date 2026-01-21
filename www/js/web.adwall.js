const SHARED_KEY = "place_your_key_here"
const LOCAL_URL = "http://localhost:4173"
const MINIMUM_VALIDATION_TIME = 20000 // 20 seconds
const MAX_KEYS_RATE = 1
const RATE_LIMIT_STORAGE_KEY = 'adwall_key_timestamps'
const START_TIME_KEY = 'adwall_start_time'
const SID_STORAGE_KEY = 'adwall_sid'
const RATE_WINDOW_MS = 20 * 1000 // 20s

/* ---------------- utils ---------------- */

function safeParam(value, max = 128) {
  if (!value) return null
  if (value.length > max) return null
  if (!/^[a-zA-Z0-9-_]+$/.test(value)) return null
  return value
}

function hasStorage() {
  try {
    localStorage.setItem('__t', '1')
    localStorage.removeItem('__t')
    return true
  } catch {
    return false
  }
}

/* ---------------- rate limit ---------------- */

/**
 * Max 1 key a cada 20 segundos
 */
function checkRateLimit() {
  const now = Date.now()
  const windowAgo = now - RATE_WINDOW_MS

  try {
    const stored = localStorage.getItem(RATE_LIMIT_STORAGE_KEY)
    const timestamps = stored ? JSON.parse(stored) : []

    const recent = timestamps.filter(ts => ts > windowAgo)

    if (recent.length >= MAX_KEYS_RATE) {
      const nextRetryTime = Math.max(...recent) + RATE_WINDOW_MS
      return { allowed: false, nextRetryTime }
    }

    return { allowed: true, nextRetryTime: null }
  } catch {
    return { allowed: true, nextRetryTime: null }
  }
}

function recordKeyValidation() {
  try {
    const now = Date.now()
    const windowAgo = now - RATE_WINDOW_MS

    const stored = localStorage.getItem(RATE_LIMIT_STORAGE_KEY)
    const timestamps = stored ? JSON.parse(stored) : []

    const recent = timestamps.filter(ts => ts > windowAgo)
    recent.push(now)

    localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(recent))
  } catch {}
}

/* ---------------- UI ---------------- */

function showError(message) {
  document.body.innerHTML = `
    <div style="padding:40px;text-align:center;font-family:Arial,sans-serif;">
      <h1>Access Blocked</h1>
      <p style="color:#d32f2f;font-size:16px;margin:20px 0;">${message}</p>
      <p style="color:#666;font-size:14px;">Please try again later.</p>
    </div>
  `
}

/* ---------------- bootstrap ---------------- */

if (!hasStorage()) {
  showError('Storage disabled. Cannot continue.')
  throw new Error('No storage')
}

if (navigator.webdriver) {
  showError('Automation detected.')
  throw new Error('Bot detected')
}

const params = new URLSearchParams(window.location.search)
const token = safeParam(params.get('token'), 256)
const sessionId = safeParam(params.get('sid'), 128)

let sid = localStorage.getItem(SID_STORAGE_KEY)

if (sessionId) {
  sid = sessionId
  localStorage.setItem(SID_STORAGE_KEY, sid)
}

function redirectWithSid(url) {
  try {
    const u = new URL(url, location.origin)
    if (sid) u.searchParams.set('sid', sid)
    location.href = u.toString()
  } catch {
    location.href = url
  }
}

/* ---------------- token flow ---------------- */

if (token) {
  const rateCheck = checkRateLimit()

  if (!rateCheck.allowed) {
    const retryDate = new Date(rateCheck.nextRetryTime)
    showError(`Ratelimited. Try again at ${retryDate.toLocaleTimeString('en-US')}`)
    setTimeout(() => redirectWithSid(location.origin), 3000)
  } else {
    redirectWithSid(`${LOCAL_URL}/validate?token=${token}`)
  }

} else if (!sid) {
  redirectWithSid(`${LOCAL_URL}/init?redirect=${encodeURIComponent(location.href)}`)

} else {
  /* ---------------- adwall ---------------- */

  let minTime = parseInt(params.get('t') || 15000, 10)
  minTime = Math.max(minTime, MINIMUM_VALIDATION_TIME)

  let startTime = sessionStorage.getItem(START_TIME_KEY)
  if (!startTime) {
    startTime = Date.now()
    sessionStorage.setItem(START_TIME_KEY, startTime)
  } else {
    startTime = parseInt(startTime, 10)
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      showError('Tab switching detected.')
      setTimeout(() => location.reload(), 3000)
    }
  })

  const btn = document.createElement('button')
  btn.style.cssText =
    'padding:10px 20px;font-size:14px;background:#1976d2;color:white;border:none;border-radius:4px'
  btn.disabled = true

  document.body.innerHTML =
    '<div style="padding:40px;text-align:center;font-family:Arial,sans-serif;"><h1>Adwall</h1><p>Complete to continue</p></div>'
  document.body.appendChild(btn)

  let used = false

  const tick = () => {
    const elapsed = Date.now() - startTime
    const remaining = Math.max(0, minTime - elapsed)

    btn.textContent = remaining > 0
      ? `Wait ${Math.ceil(remaining / 1000)}s`
      : 'Continue'

    btn.disabled = remaining > 0

    if (remaining > 0) {
      btn.style.backgroundColor = '#ccc'
      btn.style.cursor = 'not-allowed'
      requestAnimationFrame(tick)
    } else {
      btn.style.backgroundColor = '#1976d2'
      btn.style.cursor = 'pointer'
    }
  }

  tick()

  btn.onclick = () => {
    if (used) return
    used = true
    btn.disabled = true
    recordKeyValidation()
    redirectWithSid(`${LOCAL_URL}/link`)
  }
}
