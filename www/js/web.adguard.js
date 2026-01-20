const SHARED_KEY = "place_your_key_here"
const LOCAL_URL = "http://localhost:4173"
const MINIMUM_VALIDATION_TIME = 20000 // 20 seconds - security minimum
const MAX_KEYS_PER_HOUR = 1
const RATE_LIMIT_STORAGE_KEY = 'adwall_key_timestamps'

/**
 * Checks if user has exceeded rate limit (max 1 key per hour)
 * @returns {Object} {allowed: boolean, nextRetryTime: number|null}
 */
function checkRateLimit() {
  const now = Date.now()
  const oneHourAgo = now - (60 * 60 * 1000)
  
  try {
    const stored = localStorage.getItem(RATE_LIMIT_STORAGE_KEY)
    const timestamps = stored ? JSON.parse(stored) : []
    
    // Filter out timestamps older than 1 hour
    const recentTimestamps = timestamps.filter(ts => ts > oneHourAgo)
    
    // Check if limit exceeded
    if (recentTimestamps.length >= MAX_KEYS_PER_HOUR) {
      const nextRetryTime = Math.max(...recentTimestamps) + (60 * 60 * 1000)
      return { allowed: false, nextRetryTime }
    }
    
    return { allowed: true, nextRetryTime: null }
  } catch (e) {
    console.error('Rate limit check error:', e)
    return { allowed: true, nextRetryTime: null }
  }
}

/**
 * Records successful key validation in rate limit storage
 */
function recordKeyValidation() {
  try {
    const now = Date.now()
    const oneHourAgo = now - (60 * 60 * 1000)
    
    const stored = localStorage.getItem(RATE_LIMIT_STORAGE_KEY)
    const timestamps = stored ? JSON.parse(stored) : []
    
    // Keep only timestamps from the last hour
    const recentTimestamps = timestamps.filter(ts => ts > oneHourAgo)
    recentTimestamps.push(now)
    
    localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(recentTimestamps))
  } catch (e) {
    console.error('Error recording validation:', e)
  }
}

/**
 * Shows error message to user
 */
function showError(message) {
  document.body.innerHTML = `
    <div style="padding:40px;text-align:center;font-family:Arial,sans-serif;">
      <h1>Access Blocked</h1>
      <p style="color:#d32f2f;font-size:16px;margin:20px 0;">${message}</p>
      <p style="color:#666;font-size:14px;">Please try again later.</p>
    </div>
  `
}

// Get token or sessionId from URL
const params = new URLSearchParams(window.location.search)
const token = params.get('token')
const sessionId = params.get('sid')

// If we have token, redirect to localhost validation directly
if (token) {
  // First check rate limit before validation
  const rateCheck = checkRateLimit()
  if (!rateCheck.allowed) {
    const retryDate = new Date(rateCheck.nextRetryTime)
    const timeStr = retryDate.toLocaleTimeString('en-US')
    showError(`Ratelimited. Try again at ${timeStr}`)
    setTimeout(() => {
      window.location.href = window.location.origin
    }, 5000)
  } else {
    window.location.href = `${LOCAL_URL}/validate?token=${token}`
  }
} else if (!sessionId) {
  // No sessionId, redirect to /init
  window.location.href = `${LOCAL_URL}/init?redirect=${encodeURIComponent(window.location.href)}`
} else {
  // We have sessionId, show adwall
  let minTime = params.get('t') || 15000
  minTime = Math.max(parseInt(minTime), MINIMUM_VALIDATION_TIME)

  const startTime = Date.now()
  const btn = document.createElement('button')
  btn.style.cssText = 'padding:10px 20px;font-size:14px;cursor:pointer;background:#1976d2;color:white;border:none;border-radius:4px'
  btn.disabled = true

  document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:Arial,sans-serif;"><h1>Adwall</h1><p>Complete to continue</p></div>'
  document.body.appendChild(btn)

  const tick = () => {
    const elapsed = Date.now() - startTime
    const remaining = Math.max(0, minTime - elapsed)
    btn.textContent = remaining > 0 ? `Wait ${Math.ceil(remaining / 1000)}s` : 'Continue'
    btn.disabled = remaining > 0
    
    if (remaining > 0) {
      btn.style.backgroundColor = '#ccc'
      btn.style.color = '#666'
      btn.style.cursor = 'not-allowed'
      requestAnimationFrame(tick)
    } else {
      btn.style.backgroundColor = '#1976d2'
      btn.style.color = 'white'
      btn.style.cursor = 'pointer'
    }
  }

  tick()

  btn.onclick = () => {
    // Record this key validation attempt
    recordKeyValidation()
    window.location.href = `${LOCAL_URL}/link?sid=${sessionId}`
  }
}