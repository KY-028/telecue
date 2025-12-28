import { useState, useEffect, useRef, useCallback } from 'react';
import { AssemblyAIProvider } from '../services/transcription/AssemblyAIProvider';
import { ITranscriptionService } from '../services/transcription/types';


// Singleton instance to prevent multiple socket connections
const providerInstance = new AssemblyAIProvider();

export function useVoiceRecognition() {
    const [transcript, setTranscript] = useState<string>('');
    const [isListening, setIsListening] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const providerRef = useRef<ITranscriptionService>(providerInstance);

    useEffect(() => {
        // Retrieve API Key
        const apiKey = process.env.EXPO_PUBLIC_ASSEMBLYAI_API_KEY;
        console.log("DEBUG: API Key loaded from env:", apiKey ? `${apiKey.substring(0, 4)}...***` : "undefined");

        if (apiKey) {
            providerRef.current.setAPIKey(apiKey);
        } else {
            console.warn("EXPO_PUBLIC_ASSEMBLYAI_API_KEY is missing in .env");
            setError(new Error("API Key Missing"));
        }

        // Setup callbacks
        providerRef.current.onTranscript((text) => {
            setTranscript(text);
        });

        providerRef.current.onReady(() => {
            console.log("DEBUG: Transcription Provider is Ready");
            setIsReady(true);
        });

        providerRef.current.onError((err) => {
            console.error("Transcription Error:", err);
            setError(err);
            setIsListening(false);
            setIsReady(false);
        });

        return () => {
            // generic cleanup if needed
        };
    }, []);

    const start = useCallback(async () => {
        setError(null);
        setTranscript(''); // Clear previous session text
        setIsReady(false);
        try {
            await providerRef.current.start();
            setIsListening(true);
        } catch (e) {
            setError(e as Error);
            setIsListening(false);
            setIsReady(false);
        }
    }, []);

    const stop = useCallback(async () => {
        try {
            await providerRef.current.stop();
            setIsListening(false);
            setIsReady(false);
        } catch (e) {
            console.error("Stop error", e);
        }
    }, []);

    return {
        transcript,
        isListening,
        isReady,
        error,
        start,
        stop
    };
}
