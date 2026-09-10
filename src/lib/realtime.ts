import { getIceServers, getIceTransportPolicy, getSignalingWebSocketUrl } from './ice'

type SignalPayload = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; screen?: boolean }

type RealtimeEvents = {
  status: (status: string) => void
  participants: (count: number) => void
  peerIds: (peerIds: string[]) => void
  peerNames: (peerNames: Record<string, string>) => void
  peerUsers: (peerUsers: Record<string, string>) => void
  remoteAudio: (stream: MediaStream, peerId: string) => void
  remoteAudioEnded: (peerId: string) => void
  remoteVideo: (stream: MediaStream, peerId: string) => void
  remoteVideoEnded: (peerId: string) => void
}

type PeerState = {
  connection: RTCPeerConnection
  videoTransceiver: RTCRtpTransceiver
  pendingCandidates: RTCIceCandidateInit[]
  makingOffer: boolean
  ignoreOffer: boolean
  isSettingRemoteAnswerPending: boolean
  polite: boolean
  userId: string
  displayName: string
  remoteStreams: Set<MediaStream>
}

const shortId = (value: string) => value ? value.slice(0, 8) : 'none'
const signalLog = (message: string, detail?: Record<string, unknown>) => console.info(`[SIGNAL] ${message}`, detail ?? '')
const webrtcLog = (message: string, detail?: Record<string, unknown>) => console.info(`[WEBRTC] ${message}`, detail ?? '')
const iceLog = (message: string, detail?: Record<string, unknown>) => console.info(`[ICE] ${message}`, detail ?? '')
const screenLog = (message: string, detail?: Record<string, unknown>) => console.info(`[SCREEN] ${message}`, detail ?? '')

export class RealtimeRoom {
  private socket: WebSocket | null = null
  private peers = new Map<string, PeerState>()
  private localStream: MediaStream | null = null
  private screenStream: MediaStream | null = null
  private events: RealtimeEvents
  private roomId = ''
  private peerId = crypto.randomUUID()
  private userId = ''
  private connectedPeers = new Set<string>()
  private iceServers: RTCIceServer[] = []
  private peerNames = new Map<string, string>()
  private peerUsers = new Map<string, string>()

  constructor(events: RealtimeEvents) { this.events = events }

  async connect(roomId: string, accessToken: string, displayName = 'Participant', userId = '') {
    const signalingUrl = getSignalingWebSocketUrl()
    if (!signalingUrl) throw new Error('VITE_SIGNALING_URL is required for production')
    this.roomId = roomId
    this.userId = userId
    this.iceServers = await getIceServers(accessToken)
    this.events.status('Connecting to signaling')
    signalLog('connecting', { room: shortId(roomId) })
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(signalingUrl)
      this.socket = socket
      socket.onopen = () => { signalLog('connected'); socket.send(JSON.stringify({ type: 'join', roomId, peerId: this.peerId, accessToken, displayName })); signalLog('join sent', { room: shortId(roomId) }); resolve() }
      socket.onerror = () => { signalLog('socket error'); reject(new Error('Signaling connection failed')) }
      socket.onclose = () => { signalLog('socket closed'); this.events.status('Signaling disconnected') }
      socket.onmessage = (event) => { void this.handleMessage(JSON.parse(event.data)) }
    })
  }

  setLocalStream(stream: MediaStream) {
    this.localStream = stream
    for (const state of this.peers.values()) this.addAudioTracks(state.connection, stream)
    webrtcLog('local microphone stream set')
  }

  setScreenStream(stream: MediaStream | null) {
    this.screenStream = stream
    const videoTrack = stream?.getVideoTracks()[0] || null
    for (const [peerId, state] of this.peers) {
      void state.videoTransceiver.sender.replaceTrack(videoTrack).then(() => {
        screenLog(videoTrack ? 'local screen track added' : 'local screen track removed', { peer: shortId(peerId) })
      }).catch((error) => screenLog('failed to replace local screen track', { peer: shortId(peerId), error: error instanceof Error ? error.message : 'unknown error' }))
      this.sendSignal(peerId, { screen: Boolean(videoTrack) })
    }
  }

  close() {
    for (const [peerId, state] of this.peers) {
      state.pendingCandidates.length = 0
      state.remoteStreams.clear()
      state.connection.ontrack = null
      state.connection.onicecandidate = null
      state.connection.onnegotiationneeded = null
      state.connection.close()
      webrtcLog('peer connection closed', { peer: shortId(peerId) })
    }
    this.peers.clear()
    this.peerNames.clear()
    this.peerUsers.clear()
    this.connectedPeers.clear()
    this.events.participants(1)
    this.events.peerIds([])
    this.events.peerNames({})
    this.events.peerUsers({})
    this.socket?.close()
    this.socket = null
    this.roomId = ''
    this.userId = ''
  }

  private addAudioTracks(connection: RTCPeerConnection, stream: MediaStream) {
    for (const track of stream.getAudioTracks()) if (!connection.getSenders().some((sender) => sender.track?.id === track.id)) connection.addTrack(track, stream)
  }

  private notifyPeerIds() {
    this.events.peerIds([...this.peers.keys()])
    this.events.peerNames(Object.fromEntries(this.peerNames))
    this.events.peerUsers(Object.fromEntries(this.peerUsers))
  }

  private notifyParticipants() {
    const activeUsers = new Set([...this.connectedPeers].map((peerId) => this.peerUsers.get(peerId) || peerId))
    this.events.participants(activeUsers.size + 1)
  }

  private createPeer(peerId: string, initiator: boolean, displayName = 'Participant', userId = '') {
    if (peerId === this.peerId || (userId && userId === this.userId)) { webrtcLog('ignoring self peer'); return null }
    const existing = this.peers.get(peerId)
    if (existing) return existing
    const connection = new RTCPeerConnection({ iceServers: this.iceServers, iceTransportPolicy: getIceTransportPolicy() })
    const state: PeerState = {
      connection,
      videoTransceiver: connection.addTransceiver('video', { direction: 'sendrecv' }),
      pendingCandidates: [],
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      polite: this.peerId > peerId,
      displayName,
      userId,
      remoteStreams: new Set(),
    }
    this.peers.set(peerId, state)
    this.peerNames.set(peerId, displayName || 'Participant')
    this.peerUsers.set(peerId, userId || peerId)
    webrtcLog('remote peer discovered', { peer: shortId(peerId) })
    webrtcLog('peer created', { peer: shortId(peerId) })
    if (this.localStream) this.addAudioTracks(connection, this.localStream)
    if (this.screenStream) void state.videoTransceiver.sender.replaceTrack(this.screenStream.getVideoTracks()[0] || null)
    connection.onicecandidate = (event) => { if (event.candidate) { iceLog('local candidate generated', { peer: shortId(peerId), type: event.candidate.type || 'unknown' }); this.sendSignal(peerId, { candidate: event.candidate.toJSON() }) } }
    connection.onnegotiationneeded = () => { void this.negotiate(peerId, state) }
    connection.ontrack = (event) => {
      if (state.userId && state.userId === this.userId) { webrtcLog('ignoring self media track'); return }
      const stream = event.streams[0] || new MediaStream([event.track])
      state.remoteStreams.add(stream)
      if (event.track.kind === 'audio') { webrtcLog('remote audio track received', { peer: shortId(peerId) }); this.events.remoteAudio(stream, peerId) }
      if (event.track.kind === 'video') { screenLog('remote screen track received', { peer: shortId(peerId) }); this.events.remoteVideo(stream, peerId) }
      event.track.onended = () => { state.remoteStreams.delete(stream); if (event.track.kind === 'audio') this.events.remoteAudioEnded(peerId); if (event.track.kind === 'video') this.events.remoteVideoEnded(peerId) }
    }
    connection.onconnectionstatechange = () => {
      webrtcLog(`connectionState=${connection.connectionState}`, { peer: shortId(peerId) })
      if (connection.connectionState === 'connected') { this.connectedPeers.add(peerId); this.notifyParticipants(); this.events.status('P2P connected') }
      if (connection.connectionState === 'disconnected' || connection.connectionState === 'failed' || connection.connectionState === 'closed') { this.connectedPeers.delete(peerId); this.notifyParticipants() }
      if (connection.connectionState === 'failed') this.events.status('P2P connection failed')
    }
    connection.oniceconnectionstatechange = () => iceLog(`iceConnectionState=${connection.iceConnectionState}`, { peer: shortId(peerId) })
    connection.onsignalingstatechange = () => webrtcLog(`signalingState=${connection.signalingState}`, { peer: shortId(peerId) })
    if (initiator) webrtcLog('initial negotiation candidate', { peer: shortId(peerId) })
    return state
  }

  private async negotiate(peerId: string, state: PeerState) {
    const connection = state.connection
    if (state.makingOffer || connection.signalingState !== 'stable') return
    try {
      state.makingOffer = true
      webrtcLog('initial negotiation started', { peer: shortId(peerId) })
      await connection.setLocalDescription()
      if (connection.localDescription) { webrtcLog(`${connection.localDescription.type} sent`, { peer: shortId(peerId) }); this.sendSignal(peerId, { description: connection.localDescription }) }
    } catch (error) {
      webrtcLog('negotiation failed', { peer: shortId(peerId), error: error instanceof Error ? error.message : 'unknown error' })
    } finally { state.makingOffer = false }
  }

  private async flushCandidates(state: PeerState, peerId: string) {
    const candidates = state.pendingCandidates.splice(0)
    for (const candidate of candidates) {
      try { await state.connection.addIceCandidate(candidate); iceLog('queued remote candidate applied', { peer: shortId(peerId) }) }
      catch (error) { iceLog('queued remote candidate failed', { peer: shortId(peerId), error: error instanceof Error ? error.message : 'unknown error' }) }
    }
  }

  private sendSignal(target: string, payload: SignalPayload) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'signal', roomId: this.roomId, peerId: this.peerId, target, payload })) }

  private async handleMessage(message: { type: string; peers?: string[]; peerInfo?: Array<{ peerId: string; userId?: string; displayName?: string }>; peerId?: string; userId?: string; displayName?: string; from?: string; payload?: SignalPayload }) {
    if (message.type === 'join-accepted') { signalLog('join accepted', { room: shortId(this.roomId) }); return }
    if (message.type === 'room-peers') { const peerInfo: Array<{ peerId: string; userId?: string; displayName?: string }> = message.peerInfo || (message.peers || []).map((peerId) => ({ peerId })); signalLog('peers received', { count: peerInfo.length }); for (const peer of peerInfo) this.createPeer(peer.peerId, true, peer.displayName, peer.userId); this.notifyPeerIds(); this.notifyParticipants(); this.events.status(peerInfo.length ? 'Negotiating P2P' : 'Waiting for another peer'); return }
    if (message.type === 'peer-joined' && message.peerId) { signalLog('peer joined', { peer: shortId(message.peerId) }); this.createPeer(message.peerId, false, message.displayName, message.userId); this.notifyPeerIds(); return }
    if (message.type === 'peer-left' && message.peerId) { const state = this.peers.get(message.peerId); state?.connection.close(); state?.pendingCandidates.splice(0); state?.remoteStreams.clear(); this.peers.delete(message.peerId); this.peerNames.delete(message.peerId); this.peerUsers.delete(message.peerId); this.connectedPeers.delete(message.peerId); this.notifyPeerIds(); this.notifyParticipants(); webrtcLog('peer left and state cleared', { peer: shortId(message.peerId) }); return }
    if (message.type !== 'signal' || !message.from || !message.payload) return
    const hadPeer = this.peers.has(message.from)
    if (message.from === this.peerId) { webrtcLog('ignoring self peer'); return }
    const state = this.createPeer(message.from, false)
    if (!state) return
    if (!hadPeer) this.notifyPeerIds()
    const connection = state.connection
    if (message.payload.screen === false) {
      screenLog('remote screen stage inactive', { peer: shortId(message.from) })
      this.events.remoteVideoEnded(message.from)
    }
    const description = message.payload.description
    if (description) {
      state.ignoreOffer = false
      const readyForOffer = !state.makingOffer && (connection.signalingState === 'stable' || state.isSettingRemoteAnswerPending)
      const offerCollision = description.type === 'offer' && !readyForOffer
      state.ignoreOffer = !state.polite && offerCollision
      if (state.ignoreOffer) { webrtcLog('ignored colliding offer', { peer: shortId(message.from) }); return }
      try {
        if (offerCollision && state.polite) await connection.setLocalDescription({ type: 'rollback' })
        state.isSettingRemoteAnswerPending = description.type === 'answer'
        await connection.setRemoteDescription(description)
        state.isSettingRemoteAnswerPending = false
        webrtcLog(`${description.type} received`, { peer: shortId(message.from) })
        await this.flushCandidates(state, message.from)
        if (description.type === 'offer') {
          await connection.setLocalDescription()
          if (connection.localDescription) { webrtcLog('answer sent', { peer: shortId(message.from) }); this.sendSignal(message.from, { description: connection.localDescription }) }
        }
      } catch (error) {
        state.isSettingRemoteAnswerPending = false
        webrtcLog('remote description failed', { peer: shortId(message.from), error: error instanceof Error ? error.message : 'unknown error' })
      }
    }
    const candidate = message.payload.candidate
    if (candidate) {
      if (state.ignoreOffer) return
      if (connection.remoteDescription) {
        try { await connection.addIceCandidate(candidate); iceLog('remote candidate applied', { peer: shortId(message.from) }) }
        catch (error) { iceLog('remote candidate failed', { peer: shortId(message.from), error: error instanceof Error ? error.message : 'unknown error' }) }
      } else { state.pendingCandidates.push(candidate); iceLog('remote candidate queued', { peer: shortId(message.from) }) }
    }
  }
}
