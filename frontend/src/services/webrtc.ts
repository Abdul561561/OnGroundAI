export interface WebRTCConfig {
  onRemoteStream: (stream: MediaStream) => void;
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onError: (error: Error) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private callbacks: WebRTCConfig;
  private isMuted: boolean = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;

  constructor(callbacks: WebRTCConfig) {
    this.callbacks = callbacks;
  }

  async initializeLocalMedia(): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.setupAudioAnalyser(this.localStream);
      return this.localStream;
    } catch (err: any) {
      const msg = err.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Please allow microphone access in your browser.'
        : `Could not access microphone: ${err.message || 'Device error'}`;
      throw new Error(msg);
    }
  }

  private setupAudioAnalyser(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.audioSource = this.audioContext.createMediaStreamSource(stream);
      // Connect to analyser only (NOT to destination to prevent acoustic loopback/echo)
      this.audioSource.connect(this.analyser);
    } catch (e) {
      console.warn('Audio analyser setup:', e);
    }
  }

  getAudioLevel(): number {
    if (this.isMuted || !this.analyser || !this.dataArray) return 0;
    try {
      this.analyser.getByteFrequencyData(this.dataArray as any);
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i];
      }
      const avg = sum / this.dataArray.length;
      return Math.min(100, Math.round((avg / 255) * 100));
    } catch {
      return 0;
    }
  }

  createPeerConnection(): RTCPeerConnection {
    if (this.peerConnection) {
      this.close();
    }

    this.peerConnection = new RTCPeerConnection(RTC_CONFIG);
    this.remoteStream = new MediaStream();

    // Attach local audio tracks to peer connection
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onIceCandidate(event.candidate);
      }
    };

    // Handle remote tracks
    this.peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.callbacks.onRemoteStream(event.streams[0]);
      } else if (event.track) {
        this.remoteStream?.addTrack(event.track);
        this.callbacks.onRemoteStream(this.remoteStream!);
      }
    };

    // Monitor connection states
    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        this.callbacks.onConnectionStateChange(this.peerConnection.connectionState);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      if (this.peerConnection?.iceConnectionState === 'failed') {
        this.callbacks.onError(new Error('ICE connection failed. STUN traversal was unable to establish a direct P2P path.'));
      }
    };

    return this.peerConnection;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      this.createPeerConnection();
    }
    const offer = await this.peerConnection!.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await this.peerConnection!.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      this.createPeerConnection();
    }
    await this.peerConnection!.setRemoteDescription({ type: offer.type, sdp: offer.sdp });
    await this.processPendingCandidates();
    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription({ type: answer.type, sdp: answer.sdp });
    await this.processPendingCandidates();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      if (candidate && (candidate.candidate !== undefined)) {
        await this.peerConnection.addIceCandidate(candidate);
      }
    } catch (e) {
      console.warn('Error adding ICE candidate:', e);
    }
  }

  private async processPendingCandidates(): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      if (candidate && (candidate.candidate !== undefined)) {
        try {
          await this.peerConnection.addIceCandidate(candidate);
        } catch (e) {
          console.warn('Error adding queued ICE candidate:', e);
        }
      }
    }
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMuted;
    });
    return this.isMuted;
  }

  getIsMuted(): boolean {
    return this.isMuted;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  close() {
    if (this.audioSource) {
      try {
        this.audioSource.disconnect();
      } catch {}
      this.audioSource = null;
    }
    if (this.analyser) {
      this.analyser = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    this.dataArray = null;

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.ontrack = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStream = null;
    this.pendingCandidates = [];
    this.isMuted = false;
  }
}
