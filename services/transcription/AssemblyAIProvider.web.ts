
import { ITranscriptionService } from './types';

// Constants similar to native implementation
// Note: While native forces 16000, on web we'll rely on the AudioContext's sample rate
// and inform AssemblyAI via the URL parameter.
const DEFAULT_SAMPLE_RATE = 16000;
const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_ATTEMPTS = 5;

type ProviderState = 'IDLE' | 'CONNECTING' | 'RECORDING' | 'STOPPING' | 'ERROR';

interface AAIResponse {
    type: 'Begin' | 'Turn' | 'Terminate' | 'Partial' | 'Final' | 'Error';
    id?: string;
    transcript?: string;
    error?: string;
}

export class AssemblyAIProvider implements ITranscriptionService {
    private socket: WebSocket | null = null;
    private apiKey: string = '';
    private onTranscriptCallback: ((text: string) => void) | null = null;
    private onErrorCallback: ((error: Error) => void) | null = null;
    private onReadyCallback: (() => void) | null = null;
    private state: ProviderState = 'IDLE';

    // Audio Context & Processing
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private processor: ScriptProcessorNode | null = null;
    private gainNode: GainNode | null = null;

    private sessionStarted = false;
    private reconnectAttempts = 0;
    private shouldReconnect = false;
    private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
    private cleanupPromise: Promise<void> | null = null;

    constructor() { }

    setAPIKey(key: string) {
        this.apiKey = key;
    }

    async start(): Promise<void> {
        if (this.state !== 'IDLE' && this.state !== 'ERROR') {
            return;
        }

        if (!this.apiKey) {
            const err = new Error("AssemblyAI API Key not set");
            this.handleError(err);
            throw err;
        }

        this.state = 'CONNECTING';
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;

        try {
            // First request microphone access to ensure we can record
            await this.requestMicrophone();
            await this.connect();
        } catch (err) {
            this.state = 'ERROR';
            this.cleanup(); // Ensure we clean up any partial audio context
            throw err;
        }
    }

    private async requestMicrophone() {
        if (typeof window === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Monitoring unavailable: getUserMedia is not supported in this browser");
        }
        // We get the stream here, but we'll set up the full audio graph inside connect/startRecording
        // to match the native flow where we connect WS first or concurrently.
        // Actually, getting it here is fine.
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    private async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.connectionTimeout) clearTimeout(this.connectionTimeout);

            // Create AudioContext to determine sample rate
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const sampleRate = this.audioContext.sampleRate;

            // AssemblyAI expects 'token' query param for browser-based usage if not using headers (standard WS can't set headers easily)
            // But we must be careful: AssemblyAI documentation says to use `token` param for client-side auth.
            // https://www.assemblyai.com/docs/guides/real-time-streaming-transcription#connect-to-the-websocket-api
            const url = `wss://streaming.assemblyai.com/v3/ws?sample_rate=${sampleRate}&encoding=pcm_s16le&token=${this.apiKey}`;

            console.log(`[AssemblyAI] Connecting (Attempt ${this.reconnectAttempts + 1}) with sample rate ${sampleRate}...`);

            try {
                this.socket = new WebSocket(url);

                this.connectionTimeout = setTimeout(() => {
                    if (this.state === 'CONNECTING') {
                        console.warn("[AssemblyAI] Connection timed out");
                        this.socket?.close();
                        reject(new Error("Connection timeout"));
                    }
                }, 10000);

                this.socket.onopen = async () => {
                    if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
                    console.log("[AssemblyAI] WebSocket Connected");
                    this.sessionStarted = false;
                    this.reconnectAttempts = 0;

                    try {
                        this.startWebRecording();
                        this.state = 'RECORDING';
                        resolve();
                    } catch (e) {
                        this.handleError(e as Error);
                        reject(e);
                    }
                };

                this.socket.onmessage = (event) => this.handleMessage(event);

                this.socket.onerror = (e) => {
                    console.error("[AssemblyAI] WebSocket Error", e);
                };

                this.socket.onclose = (e) => {
                    console.log(`[AssemblyAI] WebSocket Closed. Code: ${e.code}, Reason: ${e.reason}`);
                    this.handleClose();
                };
            } catch (err) {
                console.error("[AssemblyAI] Socket creation error", err);
                reject(err);
            }
        });
    }

    private startWebRecording() {
        if (!this.audioContext || !this.mediaStream) {
            throw new Error("AudioContext or MediaStream not initialized");
        }

        // Create source from the stream
        this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

        // Create a ScriptProcessorNode with a buffer size of 4096.
        // This deprecated API is the most compatible way to get raw audio data without external worklet files.
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

        // Create a GainNode with 0 gain to mute the output (to prevent feedback loop)
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 0;

        // Connect the graph: Source -> Processor -> Gain -> Destination
        this.source.connect(this.processor);
        this.processor.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);

        this.processor.onaudioprocess = (e) => {
            if (this.socket?.readyState === WebSocket.OPEN && this.sessionStarted && this.state === 'RECORDING') {
                const inputData = e.inputBuffer.getChannelData(0);
                this.processAndSendAudio(inputData);
            }
        };

        // If the context is suspended (autoplay policy), resume it
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        console.log("[AssemblyAI] Web Recording Started");
    }

    private processAndSendAudio(inputData: Float32Array) {
        // Convert Float32 (-1.0 to 1.0) to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
            // Clamp value
            const s = Math.max(-1, Math.min(1, inputData[i]));
            // Convert to 16-bit
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Send raw binary
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(pcmData.buffer);
        }
    }

    // Stub for interface compatibility if needed, though not strictly in interface
    // but useful if we ever try to use it like the native class
    public sendAudioChunk(base64Data: string) {
        console.warn("[AssemblyAI] sendAudioChunk is not implemented for web provider yet.");
    }

    private handleMessage(event: MessageEvent) {
        try {
            const res: AAIResponse = JSON.parse(event.data);
            const type = res.type;

            if (type === 'Begin') {
                console.log("[AssemblyAI] Session ID:", res.id);
                this.sessionStarted = true;
                this.onReadyCallback?.();
            } else if (type === 'Turn' || type === 'Partial') {
                if (res.transcript) {
                    this.onTranscriptCallback?.(res.transcript);
                }
            } else if (type === 'Error' || res.error) {
                console.error("[AssemblyAI] API Error:", res.error);
                this.handleError(new Error(res.error || 'Unknown API Error'));
            }
        } catch (e) {
            console.error("[AssemblyAI] Parse error", e);
        }
    }

    private handleClose() {
        if (this.shouldReconnect && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS && this.state !== 'STOPPING') {
            this.reconnectAttempts++;
            const delay = RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1);
            console.log(`[AssemblyAI] Retrying in ${delay}ms...`);
            setTimeout(() => {
                if (this.shouldReconnect && this.state !== 'STOPPING') {
                    // Re-request mic & connect ? 
                    // Usually we just reconnect the socket. But if the previous socket close caused issues?
                    // connect() creates new socket.
                    this.connect().catch(err => {
                        console.error("[AssemblyAI] Reconnect failed", err);
                    });
                }
            }, delay);
        } else if (this.state !== 'STOPPING') {
            const wasRecording = this.state === 'RECORDING';
            this.state = 'IDLE';
            this.cleanup();
            if (wasRecording && this.shouldReconnect) {
                this.handleError(new Error("Connection lost and could not be recovered"));
            }
        }
    }

    private handleError(error: Error) {
        this.onErrorCallback?.(error);
        if (this.state !== 'STOPPING' && this.state !== 'IDLE') {
            this.stop().catch(console.error);
        }
    }

    async stop(): Promise<void> {
        if (this.state === 'STOPPING' || this.state === 'IDLE') return;

        this.state = 'STOPPING';
        this.shouldReconnect = false;
        this.sessionStarted = false;

        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }

        if (this.cleanupPromise) return this.cleanupPromise;

        this.cleanupPromise = this.cleanup().finally(() => {
            this.cleanupPromise = null;
            this.state = 'IDLE';
        });

        await this.cleanupPromise;
    }

    private async cleanup() {
        console.log("[AssemblyAI] Internal cleanup started...");

        // Stop processing audio
        if (this.processor) {
            this.processor.disconnect();
            this.processor.onaudioprocess = null;
            this.processor = null;
        }

        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }

        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }

        // Stop media tracks
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        // Close AudioContext
        if (this.audioContext) {
            try {
                if (this.audioContext.state !== 'closed') {
                    await this.audioContext.close();
                }
            } catch (e) {
                console.warn("[AssemblyAI] Error closing AudioContext", e);
            }
            this.audioContext = null;
        }

        // Close WebSocket
        if (this.socket) {
            if (this.socket.readyState === WebSocket.OPEN) {
                try {
                    this.socket.send(JSON.stringify({ type: "Terminate" }));
                } catch (e) { }
            }
            this.socket.close();
            this.socket = null;
        }
    }

    onTranscript(callback: (text: string) => void): void {
        this.onTranscriptCallback = callback;
    }

    onError(callback: (error: Error) => void): void {
        this.onErrorCallback = callback;
    }

    onReady(callback: () => void): void {
        this.onReadyCallback = callback;
    }
}
