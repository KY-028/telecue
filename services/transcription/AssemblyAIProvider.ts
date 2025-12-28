import { ExpoAudioStreamModule } from '@siteed/expo-audio-studio';
import { ITranscriptionService } from './types';
import { LegacyEventEmitter } from 'expo-modules-core';

const SAMPLE_RATE = 16000;
const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_ATTEMPTS = 5;

type ProviderState = 'IDLE' | 'CONNECTING' | 'RECORDING' | 'STOPPING' | 'ERROR';

interface AAIResponse {
    type: 'Begin' | 'Turn' | 'Terminate' | 'Partial' | 'Final' | 'Error';
    id?: string;
    transcript?: string;
    error?: string;
}

const emitter = new LegacyEventEmitter(ExpoAudioStreamModule);

export class AssemblyAIProvider implements ITranscriptionService {
    private socket: WebSocket | null = null;
    private apiKey: string = '';
    private onTranscriptCallback: ((text: string) => void) | null = null;
    private onErrorCallback: ((error: Error) => void) | null = null;
    private onReadyCallback: (() => void) | null = null;
    private state: ProviderState = 'IDLE';
    private eventListener: any = null;
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
            console.log(`[AssemblyAI] Already in state: ${this.state}`);
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
            await this.connect();
        } catch (err) {
            this.state = 'ERROR';
            throw err;
        }
    }

    private async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.connectionTimeout) clearTimeout(this.connectionTimeout);

            const url = `wss://streaming.assemblyai.com/v3/ws?sample_rate=${SAMPLE_RATE}&encoding=pcm_s16le`;
            console.log(`[AssemblyAI] Connecting (Attempt ${this.reconnectAttempts + 1})...`);

            try {
                // @ts-ignore - RN WebSocket allows headers in 3rd arg
                this.socket = new WebSocket(url, null, {
                    headers: { 'Authorization': this.apiKey }
                });

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
                        await this.startNativeRecording();
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
                    // onclose will handle the reconnection logic
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

    private async startNativeRecording() {
        if (this.eventListener) return;

        const config = {
            sampleRate: SAMPLE_RATE,
            encoding: 'pcm_16bit',
            channels: 1,
            interval: 100,
        };

        this.eventListener = emitter.addListener('AudioData', (event: any) => {
            if (this.socket?.readyState === WebSocket.OPEN && this.sessionStarted && this.state === 'RECORDING') {
                if (event.encoded) {
                    this.sendAudio(event.encoded);
                }
            }
        });

        try {
            await ExpoAudioStreamModule.startRecording(config);
            console.log("[AssemblyAI] Native Recording Started");
        } catch (e) {
            console.error("[AssemblyAI] Failed to start native recording", e);
            throw e;
        }
    }

    private handleMessage(event: WebSocketMessageEvent) {
        try {
            const res: AAIResponse = JSON.parse(event.data);
            const type = res.type;

            if (type === 'Begin') {
                console.log("[AssemblyAI] Session ID:", res.id);
                this.sessionStarted = true;
                this.onReadyCallback?.();
            } else if (type === 'Turn' || type === 'Partial') {
                if (res.transcript) {
                    // console.log(`[AssemblyAI] ${type}:`, res.transcript);
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

        console.log("[AssemblyAI] Stopping...");
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
        try {
            await ExpoAudioStreamModule.stopRecording();
            console.log("[AssemblyAI] Native recording stopped");
        } catch (e) {
            // Silence common expected errors
            const msg = (e as Error).message || "";
            if (!msg.includes("no recording in progress") && !msg.includes("Failed to stop")) {
                console.warn("[AssemblyAI] stopRecording error ignored:", msg);
            }
        }

        if (this.eventListener) {
            this.eventListener.remove();
            this.eventListener = null;
        }

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

    private sendAudio(base64Data: string) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const binary = this.decodeBase64(base64Data);
            this.socket.send(binary);
        }
    }

    private static lookup: Uint8Array | null = null;
    private static getLookup(): Uint8Array {
        if (!this.lookup) {
            this.lookup = new Uint8Array(256);
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            for (let i = 0; i < chars.length; i++) {
                this.lookup[chars.charCodeAt(i)] = i;
            }
        }
        return this.lookup;
    }

    /**
     * Optimized Base64 to Uint8Array decoding.
     * Manual decoding is often faster than atob() for large buffers in some JS environments.
     */
    private decodeBase64(base64: string): Uint8Array {
        const lookup = AssemblyAIProvider.getLookup();
        let bufferLength = base64.length * 0.75;
        if (base64[base64.length - 1] === '=') {
            bufferLength--;
            if (base64[base64.length - 2] === '=') {
                bufferLength--;
            }
        }

        const bytes = new Uint8Array(bufferLength);
        let p = 0;

        for (let i = 0; i < base64.length; i += 4) {
            const encoded1 = lookup[base64.charCodeAt(i)];
            const encoded2 = lookup[base64.charCodeAt(i + 1)];
            const encoded3 = lookup[base64.charCodeAt(i + 2)];
            const encoded4 = lookup[base64.charCodeAt(i + 3)];

            bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
            if (p < bufferLength) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
            if (p < bufferLength) bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
        }

        return bytes;
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
