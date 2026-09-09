type SignalPayload = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

type RealtimeEvents = {
  status: (status: string) => void
  participants: (count: number) => void
  remoteAudio: (stream: MediaStream, peerId: string) => void
  remoteVideo: (stream: MediaStream, peerId: string) => void
}

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || (import.meta.env.DEV ? 'ws://127.0.0.1:8787' : '')
const ICE_SERVERS: RTCIceServer[] = [
  { urls: import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302' },
  ...(import.meta.env.VITE_TURN_URL ? [{ urls: import.meta.env.VITE_TURN_URL, username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_CREDENTIAL }] : []),
]

export class RealtimeRoom {
  private socket: WebSocket | null = null
  private peers = new Map<string, RTCPeerConnection>()
  private localStream: MediaStream | null = null
  private screenStream: MediaStream | null = null
  private events: RealtimeEvents
  private roomId = ''
  private peerId = crypto.randomUUID()
  private connectedPeers = new Set<string>()

  constructor(events: RealtimeEvents) { this.events = events }

  async connect(roomId: string, accessToken: string) {
    if (!SIGNALING_URL) throw new Error('VITE_SIGNALING_URL is required for production')
    this.roomId = roomId
    this.events.status('Connecting to signaling')
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(SIGNALING_URL)
      this.socket = socket
      socket.onopen = () => { socket.send(JSON.stringify({ type: 'join', roomId, peerId: this.peerId, accessToken })); resolve() }
      socket.onerror = () => reject(new Error('Signaling connection failed'))
      socket.onclose = () => this.events.status('Signaling disconnected')
      socket.onmessage = (event) => this.handleMessage(JSON.parse(event.data))
    })
  }

  setLocalStream(stream: MediaStream) {
    this.localStream = stream
    for (const connection of this.peers.values()) this.addTracks(connection, stream)
  }

  setScreenStream(stream: MediaStream | null) {
    this.screenStream = stream
    const videoTrack = stream?.getVideoTracks()[0] || null
    for (const connection of this.peers.values()) {
      const sender = connection.getSenders().find((item) => item.track?.kind === 'video')
      if (sender && videoTrack) sender.replaceTrack(videoTrack)
      if (!sender && videoTrack && stream) connection.addTrack(videoTrack, stream)
      if (sender && !videoTrack) sender.replaceTrack(null)
    }
  }

  close() {
    for (const connection of this.peers.values()) connection.close()
    this.peers.clear()
    this.connectedPeers.clear()
    this.events.participants(1)
    this.socket?.close()
    this.socket = null
  }

  private addTracks(connection: RTCPeerConnection, stream: MediaStream) {
    for (const track of stream.getTracks()) if (!connection.getSenders().some((sender) => sender.track?.id === track.id)) connection.addTrack(track, stream)
  }

  private createPeer(peerId: string, initiator: boolean) {
    const existing = this.peers.get(peerId)
    if (existing) return existing
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this.peers.set(peerId, connection)
    if (this.localStream) this.addTracks(connection, this.localStream)
    const screenStream = this.screenStream
    if (screenStream) this.addTracks(connection, screenStream)
    connection.onicecandidate = (event) => { if (event.candidate) this.sendSignal(peerId, { candidate: event.candidate.toJSON() }) }
    connection.ontrack = (event) => { const stream = event.streams[0]; if (!stream) return; if (event.track.kind === 'audio') this.events.remoteAudio(stream, peerId); if (event.track.kind === 'video') this.events.remoteVideo(stream, peerId) }
    connection.onconnectionstatechange = () => { if (connection.connectionState === 'connected') { this.connectedPeers.add(peerId); this.events.participants(this.connectedPeers.size + 1); this.events.status('P2P connected') } if (connection.connectionState === 'failed') this.events.status('P2P connection failed') }
    if (initiator) connection.createOffer().then((offer) => connection.setLocalDescription(offer).then(() => this.sendSignal(peerId, { description: connection.localDescription || undefined })))
    return connection
  }

  private sendSignal(target: string, payload: SignalPayload) { this.socket?.send(JSON.stringify({ type: 'signal', roomId: this.roomId, peerId: this.peerId, target, payload })) }

  private async handleMessage(message: { type: string; peers?: string[]; peerId?: string; from?: string; payload?: SignalPayload }) {
    if (message.type === 'room-peers') { for (const peerId of message.peers || []) this.createPeer(peerId, true); this.events.participants((message.peers?.length || 0) + 1); this.events.status(message.peers?.length ? 'Negotiating P2P' : 'Waiting for another peer'); return }
    if (message.type === 'peer-joined' && message.peerId) { this.createPeer(message.peerId, false); this.events.participants(this.peers.size + 1); return }
    if (message.type === 'peer-left' && message.peerId) { this.peers.get(message.peerId)?.close(); this.peers.delete(message.peerId); this.connectedPeers.delete(message.peerId); this.events.participants(this.connectedPeers.size + 1); return }
    if (message.type !== 'signal' || !message.from || !message.payload) return
    const connection = this.createPeer(message.from, false)
    if (message.payload.description) {
      await connection.setRemoteDescription(message.payload.description)
      if (message.payload.description.type === 'offer') { const answer = await connection.createAnswer(); await connection.setLocalDescription(answer); this.sendSignal(message.from, { description: connection.localDescription || undefined }) }
    }
    if (message.payload.candidate) await connection.addIceCandidate(message.payload.candidate)
  }
}
