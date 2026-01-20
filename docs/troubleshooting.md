# Troubleshooting

Common issues and how to fix them.

## Token Issues

### "Token expired"

**Cause:** work.ink token is older than 30 seconds

**Solutions:**
- Ensure browser redirects quickly from work.ink
- Check internet connection during flow
- Try the validation process again
- Reduce timer on adwall page (less time before redirecting)

### "Invalid token"

**Cause:** Token not recognized or already used

**Solutions:**
- Don't refresh browser during validation
- Use token only once
- Try completing the task again
- Check work.ink link is correct

### "IP mismatch" (in logs)

**Cause:** Request IP different from token creation IP

**This is normal** if:
- User is behind VPN
- User is behind proxy
- User is on mobile network

**Note:** IP mismatch is logged but doesn't block validation (allows for proxies/VPNs).

## Server Issues

### Port Already in Use

**Error:** `EADDRINUSE: address already in use :::4173`

**Cause:** Another process is using port 4173

**Solution 1 - Find and kill process:**
```bash
# On macOS/Linux
lsof -i :4173

# Kill the process
kill -9 <PID>
```

**Solution 2 - Use different port:**
```javascript
await adwall({
  // ... other config
  port: 5000  // Use different port
})
```

### Server Won't Start

**Error:** Various bind/listen errors

**Possible causes:**
1. Permission denied on port
2. Firewall blocking
3. Previous process still running

**Try:**
1. Restart your computer
2. Use higher port number (>1024)
3. Run with elevated permissions (not recommended)

### Server Crashes

**Error:** Unexpected crashes during validation

**Collect debug info:**
```bash
# Run with NODE_DEBUG
NODE_DEBUG=http,https node app.example.js
```

**Check:**
1. Node.js version compatibility
2. Disk space for key.json
3. Network connectivity during validation

## Key Storage Issues

### "Can't decrypt key" or decryption errors

**Cause:** Key file is corrupted or on different machine

**Solutions:**
1. On same machine: delete key.json and revalidate
2. On different machine: normal behavior (machine-bound)
3. Check permissions on key.json (should be readable)

### Key.json not created

**Cause:** Validation completed but file not created

**Check:**
1. Write permissions in current directory
2. Disk space available
3. No process locks on directory
4. Validation actually succeeded (check for "Your key is valid" message)

**Try:**
```bash
# Manually create with write test
touch test-write.txt
rm test-write.txt
```

### Key expires immediately

**Cause:** `maxAge` set too low

**Solution:**
```javascript
await adwall({
  // ... config
  maxAge: 1000 * 60 * 60 * 24 * 30  // 30 days
})
```

## Browser/URL Issues

### "Page won't load" from given URL

**Cause:** Adwall page URL is incorrect or unreachable

**Check:**
1. URL is correct and accessible
2. HTTPS is used (not HTTP)
3. Page exists and is public
4. No firewall blocking

### Browser doesn't redirect back

**Cause:** work.ink redirect loop or configuration

**Check:**
1. work.ink link is correct
2. Adwall page configured correctly
3. Browser allows redirects (check console for errors)
4. work.ink account is active

**Debug:**
1. Open browser DevTools (F12)
2. Go to Network tab
3. Try validation again
4. Check redirect chain

### "Localhost refused to connect"

**Cause:** Local server not running or wrong port

**Check:**
1. Server actually started (check console output)
2. Port number matches config
3. Firewall not blocking localhost
4. Browser security settings

## Configuration Issues

### "Missing: key" / "Missing: adwall" errors

**Cause:** Required config parameter not provided

**Solution:**
```javascript
const { valid, url } = await adwall({
  key: "your-secret-key",        // REQUIRED
  adwall: "https://...",          // REQUIRED
  adlink: "https://work.ink/...", // REQUIRED
  time: 15000                     // REQUIRED
})
```

### Wrong validation result

**Cause:** Config mismatches between calls

**Remember:**
- Same `key` must be used every time
- Different keys = different validation
- Different machines = different keys (expected)

**Check:**
1. Are you using same config?
2. Did key.json get deleted?
3. Is key.json corrupted?

## work.ink Issues

### work.ink page won't load

**Cause:** work.ink service issue

**Check:**
1. work.ink is operational (check their status page)
2. Your offer/link ID is correct
3. Account is active

### work.ink won't generate token

**Cause:** Task completion issue

**Check:**
1. Actually completed the work.ink task
2. work.ink page fully loaded
3. No JavaScript errors (check console)
4. Account is in good standing

## Debug Mode

To enable console debugging:

```javascript
// Inside adwall.js, temporarily enable debug:
validateWorkinkToken(token, userIp, true)  // true = debug mode
```

This logs:
- Token value
- User IP
- API response from work.ink
- Each validation step
- Any errors

**Note:** Remove before production.

## Still Having Issues?

1. **Check the logs:**
   - Look at console output
   - Check browser DevTools Network tab
   - Check browser console for errors

2. **Verify setup:**
   - Is adwall.js installed correctly?
   - Is config complete and correct?
   - Are URLs using HTTPS?

3. **Test manually:**
   ```bash
   node example/app.example.js
   ```
   Visit the printed URL and complete flow manually

4. **Check file permissions:**
   ```bash
   ls -la key.json     # Should be readable
   ls -la .            # Directory should be writable
   ```

5. **Network debugging:**
   ```bash
   curl -v https://work.ink/api/...
   ```
   Verify work.ink is reachable
