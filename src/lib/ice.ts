type IceCache = { servers: RTCIceServer[]; expiresAt: number }

let cache: IceCache | null = null
const defaultTtlSeconds = 86400
const refreshRatio = 0.8

export function getSignalingWebSocketUrl() {
  return import.meta.env.VITE_SIGNALING_URL || (import.meta.env.DEV ? 'ws://127.0.0.1:8787' : '')
}

export function getSignalingHttpUrl() {
  const configured = getSignalingWebSocketUrl()
  if (!configured) return null
  try {
    const url = new URL(configured)
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:' && url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.protocol = url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : url.protocol
    url.pathname = `${url.pathname.replace(/\/$/, '')}/api/ice-servers`
    return url.toString()
  } catch { return null }
}

function getStaticIceServers() {
  const configured = import.meta.env.VITE_ICE_SERVERS
  if (configured) {
    try {
      const parsed = JSON.parse(configured) as RTCIceServer[]
      if (Array.isArray(parsed)) return parsed.filter((server) => server && server.urls)
    } catch { if (import.meta.env.DEV) console.warn('[ICE] invalid VITE_ICE_SERVERS configuration') }
  }
  return [
    { urls: import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302' },
    ...(import.meta.env.VITE_TURN_URL ? [{ urls: import.meta.env.VITE_TURN_URL, username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_CREDENTIAL }] : []),
  ] as RTCIceServer[]
}

export async function getIceServers(accessToken: string) {
  if (cache && cache.expiresAt > Date.now()) return cache.servers
  const endpoint = getSignalingHttpUrl()
  if (!endpoint) {
    if (import.meta.env.PROD) throw new Error('VITE_SIGNALING_URL is required for dynamic ICE servers')
    return getStaticIceServers()
  }
  try {
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!response.ok) throw new Error(`ICE endpoint returned ${response.status}`)
    const body = await response.json() as { iceServers?: RTCIceServer[] }
    if (!Array.isArray(body.iceServers) || !body.iceServers.length) throw new Error('ICE endpoint returned no servers')
    const ttlSeconds = Math.max(60, Number(import.meta.env.VITE_TURN_CREDENTIAL_TTL_SECONDS || defaultTtlSeconds))
    cache = { servers: body.iceServers, expiresAt: Date.now() + ttlSeconds * 1000 * refreshRatio }
    if (import.meta.env.DEV) console.info('[ICE] Loaded dynamic ICE servers; TURN credentials refreshed')
    return cache.servers
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[ICE] Failed to load dynamic ICE servers', error instanceof Error ? error.message : 'unknown error')
    if (import.meta.env.PROD) throw error
    return getStaticIceServers()
  }
}

export function getIceTransportPolicy(): RTCIceTransportPolicy {
  return import.meta.env.VITE_WEBRTC_FORCE_RELAY === 'true' ? 'relay' : 'all'
}
