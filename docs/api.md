# API Reference

Complete reference for all adwall endpoints and configuration.

**[Usage Guide](./usage.md)** ‧ **[API Reference](./api.md)** ‧ **[Security](./security.md)** ‧ **[Troubleshooting](./troubleshooting.md)**

## Main Function: `adwall(config)`

Validates app key via adwall flow.

**Returns:** `Promise<{ valid: boolean, url?: string }>`

### Config Parameter

```javascript
{
  key: string,                    // Required
  adwall: string,                 // Required
  adlink: string,                 // Required
  time: number,                   // Required (ms)
  port?: number,                  // Optional, default: 4173
  keyFile?: string,               // Optional, default: "key.json"
  maxAge?: number                 // Optional, default: 2592000000 (30 days)
}
```

### Return Values

**Valid Key Exists:**
```javascript
{
  valid: true,
  url: null
}
```

**Need Validation:**
```javascript
{
  valid: false,
  url: "https://yourdomain.com/adwall"
}
```

## Configuration Options

### Required

| Option | Type | Description |
|--------|------|-------------|
| `key` | string | Shared secret key. Keep same across all machines. |
| `adwall` | string | URL of adwall page (hosted on your domain) |
| `adlink` | string | work.ink task URL (where user completes work) |
| `time` | number | Minimum milliseconds user stays on adwall (e.g., 15000 = 15s) |

### Optional

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | 4173 | Local server port for validation endpoints |
| `keyFile` | string | "key.json" | File path where encrypted key is stored |
| `maxAge` | number | 2592000000 | Key expiration time in milliseconds (30 days) |

## Local Server Endpoints

When adwall runs, a local HTTP server listens on `localhost:PORT` with these endpoints:

### `GET /init`

Initializes a validation session.

**Query Parameters:**
- `redirect` (optional) - URL to redirect to after getting session ID

**Response:**
- Status: 302 (Redirect)
- Location: `{adwall}?sid={sessionId}&t={time}`

**Example:**
```
GET /init
GET /init?redirect=https://example.com/custom
```

### `GET /link?sid=<sessionId>`

Redirects to work.ink for task completion.

**Query Parameters:**
- `sid` (required) - Session ID from /init

**Response:**
- Status: 302 (Redirect)
- Location: `https://work.ink/...?redirect={adwall}?token={TOKEN}`

**Example:**
```
GET /link?sid=550e8400-e29b-41d4-a716-446655440000
```

### `GET /validate?token=<token>`

Validates work.ink token and stores key.

**Query Parameters:**
- `token` (required) - Token from work.ink

**Response if Browser:**
- Status: 200
- Content-Type: text/plain
- Body:
```
Your key is valid, return to the app
Expires in: 30 days
```

**Response if API:**
- Status: 200
- Content-Type: application/json
- Body:
```json
{
  "valid": true,
  "expiresIn": 2592000000
}
```

**Example:**
```
GET /validate?token=abc123def456
```

## Error Responses

### Missing Token

```
GET /validate

Response:
{
  "error": "Missing token",
  "message": "Please try again"
}
```

### Invalid Token

```
Response:
{
  "error": "Invalid token",
  "message": "Please try again"
}
```

### Token Expired

```
Response:
{
  "error": "Token expired",
  "message": "Please try again"
}
```

### Invalid Session

```
GET /link?sid=invalid

Response:
{
  "error": "Invalid session"
}
```

### Not Found

```
GET /unknown

Response:
{
  "error": "Not found"
}
```

## Headers

### Request Headers Used

| Header | Purpose |
|--------|---------|
| `x-forwarded-for` | Extract user IP (for logging) |
| `user-agent` | Detect if request is from browser vs API |

### Response Headers Set

| Header | Value |
|--------|-------|
| `Access-Control-Allow-Origin` | Adwall domain (CORS) |
| `Access-Control-Allow-Methods` | GET, POST |
| `Content-Type` | application/json or text/plain |

## Key Storage Format

The stored `key.json` file contains encrypted data:

```json
{
  "iv": [12, 34, 56, ...],
  "tag": [78, 90, 12, ...],
  "data": [34, 56, 78, ...]
}
```

**Format Details:**
- `iv` - Initialization vector (12 bytes)
- `tag` - Authentication tag for AES-256-GCM (16 bytes)
- `data` - Encrypted payload

Decryption requires the machine-specific key derived from:
- Hostname
- OS platform
- CPU architecture
- Username

## Examples

### Basic Usage

```javascript
const { valid, url } = await adwall({
  key: "secret",
  adwall: "https://example.com/adwall",
  adlink: "https://work.ink/offer",
  time: 15000
})
```

### Custom Port and File

```javascript
const { valid, url } = await adwall({
  key: "secret",
  adwall: "https://example.com/adwall",
  adlink: "https://work.ink/offer",
  time: 15000,
  port: 5000,
  keyFile: "./app-validation.json"
})
```

### Custom Expiration (7 days)

```javascript
const { valid, url } = await adwall({
  key: "secret",
  adwall: "https://example.com/adwall",
  adlink: "https://work.ink/offer",
  time: 15000,
  maxAge: 1000 * 60 * 60 * 24 * 7
})
```
