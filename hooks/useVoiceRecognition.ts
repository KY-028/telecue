import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { AssemblyAIProvider } from '../services/transcription/AssemblyAIProvider';
import { ITranscriptionService } from '../services/transcription/types';


// Singleton instance to prevent multiple socket connections
const providerInstance = new AssemblyAIProvider();

export function useVoiceRecognition() {
    const [transcript, setTranscript] = useState<string>('');
    const [isListening, setIsListening] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [isCallActive, setIsCallActive] = useState(false);
    const providerRef = useRef<ITranscriptionService>(providerInstance);

    useEffect(() => {
        // Retrieve API Key
        // TODO: SECURITY WARNING: The API key is exposed in the client-side bundle.
        // For production, it is highly recommended to use a backend proxy to handle authentication
        // and keep the API key secret.
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
            // Check if error is related to audio session (often happens during calls)
            if (err.message?.includes("recording") || err.message?.includes("audio") || err.message?.includes("Seems like you're in another call")) {
                setIsCallActive(true);
            }
            setError(err);
            setIsListening(false);
            setIsReady(false);
        });

        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'inactive' || nextAppState === 'background') {
                console.log("DEBUG: App State Interruption detected:", nextAppState);
                // We don't necessarily set isCallActive true immediately for background, 
                // but we might want to flag it if we were listening
            }
        };

        const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            appStateSubscription.remove();
        };
    }, []);

    const start = useCallback(async () => {
        setError(null);
        setTranscript(''); // Clear previous session text
        setIsReady(false);
        setIsCallActive(false); // Reset call active state on new attempt
        try {
            await providerRef.current.start();
            setIsListening(true);
        } catch (e: any) {
            setError(e as Error);
            setIsListening(false);
            setIsReady(false);
            // Also check for call-related errors here
            if (e.message?.includes("call") || e.message?.includes("recording") || e.message?.includes("audio")) {
                setIsCallActive(true);
            }
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
        isCallActive: Platform.OS === 'web' ? false : isCallActive,
        start,
        stop
    };
}
