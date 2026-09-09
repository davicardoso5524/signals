import { WebSocketServer, WebSocket } from 'ws'
import { createClient } from '@supabase/supabase-js'

type Client = WebSocket & { roomId?: string; peerId?: string; userId?: string }
type Message = { type: string; roomId?: string; peerId?: string; target?: string; accessToken?: string; payload?: unknown }

const port = Number(process.env.SIGNALING_PORT || 8787)
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
const rooms = new Map<string, Set<Client>>()
const server = new WebSocketServer({ port })

const send = (client: Client, message: unknown) => {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message))
}

const peersInRoom = (roomId: string) => [...(rooms.get(roomId) || [])]

const leaveRoom = (client: Client) => {
  if (!client.roomId || !client.peerId) return
  const peers = rooms.get(client.roomId)
  peers?.delete(client)
  for (const peer of peers || []) send(peer, { type: 'peer-left', peerId: client.peerId })
  if (peers?.size === 0) rooms.delete(client.roomId)
  client.roomId = undefined
  client.peerId = undefined
  client.userId = undefined
}

server.on('connection', (socket) => {
  const client = socket as Client
  client.on('message', async (raw) => {
    let message: Message
    try { message = JSON.parse(raw.toString()) } catch { return send(client, { type: 'error', message: 'Invalid signaling message.' }) }

    if (message.type === 'join' && message.roomId && message.peerId) {
      if (!message.accessToken) return send(client, { type: 'error', message: 'Signaling authentication is required.' })
      if (!supabaseUrl || !supabaseKey) {
        console.warn('[SIGNAL] Supabase server configuration is missing')
        return send(client, { type: 'error', message: 'Signaling authentication is unavailable.' })
      }
      const authClient = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: `Bearer ${message.accessToken}` } } })
      const { data: userData, error: userError } = await authClient.auth.getUser(message.accessToken)
      if (userError || !userData.user) {
        console.warn('[SIGNAL] Rejected unauthenticated join')
        return send(client, { type: 'error', message: 'Signaling authentication failed.' })
      }
      const { data: membership, error: membershipError } = await authClient.from('room_members').select('room_id').eq('room_id', message.roomId).eq('user_id', userData.user.id).maybeSingle()
      if (membershipError || !membership) {
        console.warn('[SIGNAL] Rejected room membership', message.roomId)
        return send(client, { type: 'error', message: 'You are not a member of this room.' })
      }
      if (peersInRoom(message.roomId).some((peer) => peer.peerId === message.peerId)) {
        return send(client, { type: 'error', message: 'Peer connection already exists.' })
      }
      leaveRoom(client)
      const peers = peersInRoom(message.roomId)
      const room = rooms.get(message.roomId) || new Set<Client>()
      client.roomId = message.roomId
      client.peerId = message.peerId
      client.userId = userData.user.id
      room.add(client)
      rooms.set(message.roomId, room)
      console.info('[SIGNAL] Authorized room join', { roomId: message.roomId, userId: userData.user.id })
      send(client, { type: 'room-peers', peers: peers.map((peer) => peer.peerId).filter(Boolean) })
      for (const peer of peers) send(peer, { type: 'peer-joined', peerId: message.peerId })
      return
    }

    if (message.type === 'signal' && message.target && client.roomId && client.userId && message.roomId === client.roomId) {
      const target = peersInRoom(client.roomId).find((peer) => peer.peerId === message.target)
      if (target) send(target, { type: 'signal', from: client.peerId, payload: message.payload })
    }
  })
  client.on('close', () => leaveRoom(client))
})

console.info(`[SIGNAL] Signaling server listening on ws://localhost:${port}`)
