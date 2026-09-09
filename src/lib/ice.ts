export function getIceServers(): RTCIceServer[] {
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
  ]
}

export function getIceTransportPolicy(): RTCIceTransportPolicy {
  return import.meta.env.VITE_WEBRTC_FORCE_RELAY === 'true' ? 'relay' : 'all'
}
