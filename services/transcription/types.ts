export interface ITranscriptionService {
    start(): Promise<void>;
    stop(): Promise<void>;
    onTranscript(callback: (text: string) => void): void;
    onError(callback: (error: Error) => void): void;
    onReady(callback: () => void): void;
    setAPIKey(key: string): void;
}
