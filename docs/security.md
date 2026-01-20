# Security

How Adwall protects keys and validates authenticity.

## Key Storage

### Encryption

Keys are stored locally using **AES-256-GCM**:

- **Algorithm:** AES (Advanced Encryption Standard) with 256-bit key
- **Mode:** GCM (Galois/Counter Mode) - includes authentication
- **IV:** Random 12-byte initialization vector per encryption
- **Tag:** 16-byte authentication tag to detect tampering

### Machine Binding

The encryption key is derived from machine-specific data:

```
SHA-256(hostname + platform + arch + username)
```

This ensures:
- Key stored on machine A won't decrypt on machine B
- Copying `key.json` between machines fails
- Compromised key is only valid on that specific machine

### Storage Location

By default: `key.json` in current directory

**Recommendations:**
- Add to `.gitignore` (never commit to git)
- Store in temp/app data directories for production
- Consider user-specific directories on multi-user systems

## Token Validation

### work.ink API

When validating, Adwall calls: `https://work.ink/_api/v2/token/isValid/{token}`

### Validation Steps

1. **Token Exists** - Check if token is recognized by work.ink
2. **Not Expired** - Verify token hasn't exceeded 30-second window
3. **IP Match** - Log IP address (not enforced, allows proxies)

### Validation Logic

```
1. Is token valid according to work.ink?
   NO -> Reject ("Invalid token")
   
2. Has token expired (past expiresAfter timestamp)?
   YES -> Reject ("Token expired")
   
3. Does IP address match token?
   Mismatch -> Log it (allow, might be proxy/VPN)
   
4. All checks pass
   -> Accept and store key
```

## Expiration

### Default Behavior

- Keys expire after **30 days** by default
- Configurable via `maxAge` parameter
- Once expired, user must re-validate

### Expiration Check

When app calls `adwall()`:

```
If key exists:
  1. Read encrypted key.json
  2. Decrypt with machine key
  3. Check: (now - createdAt) > maxAge?
     YES -> Key expired, need revalidation
     NO -> Key valid, app continues
```

## Attack Prevention

### Copy Prevention
- Key is machine-bound
- Can't be copied to another computer
- Requires re-validation on new machine

### Tampering Detection
- AES-256-GCM includes authentication
- Any modification to key.json fails decryption
- Prevents altered expiration dates

### Replay Prevention
- work.ink tokens are single-use
- Token timestamp embedded and verified
- Can't reuse old tokens

### Session Isolation
- Each validation session has unique ID
- Validates token matches session
- Prevents token reuse across sessions

## Network Security

### HTTPS Only
- work.ink API calls use HTTPS (no plaintext)
- Token transmitted over encrypted connection

### Local Server
- Server only listens on localhost
- Not exposed to network by default
- User Agent detection to serve browser-friendly responses

### CORS Headers
- Only allows requests from adwall domain
- Prevents unauthorized cross-origin access

## Key Rotation

To force re-validation:

1. Delete `key.json`
2. Or set `maxAge` to 0 (instant expiration)
3. Or change app `key` (all users must revalidate)

## Recommendations

1. **Keep `key` secret** - Don't commit to git or share publicly
2. **Use HTTPS** - Serve adwall page over HTTPS only
3. **Unique keys** - Use different key for different apps
4. **Regular expiration** - Don't use extremely long maxAge
5. **Monitor logs** - Check for validation errors/mismatches
6. **Update regularly** - Keep Adwall library up to date

## Known Limitations

### IP Validation

IP mismatch is logged but doesn't reject because:
- Users behind VPN/proxy may have different IP
- Stricter checking breaks legitimate users
- For critical apps, implement additional verification

### Token Window

work.ink tokens have ~30 second window:
- Can't validate stale tokens
- Requires fast browser redirect after task
- Not suitable for offline validation

### No Revocation

Adwall doesn't support revoking individual keys:
- Only option: change app `key` (affects all users)
- For fine-grained control, implement custom backend

## Comparison with Alternatives

| Feature | Adwall | Custom Backend | API Key |
|---------|--------|----------------|---------|
| Machine Binding | Yes | No | No |
| Local Storage | Yes | No | No |
| No Backend Needed | Yes | No | Yes |
| Portable Keys | No | Yes | Yes |
| Tamper Detection | Yes | Yes | Depends |
| Expiration Support | Yes | Yes | Yes |

## Reporting Security Issues

If you find a security vulnerability:
1. Don't create a public issue
2. Email details to project maintainer
3. Allow time for patch before disclosure
