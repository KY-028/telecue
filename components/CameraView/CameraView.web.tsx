import React, { forwardRef, useImperativeHandle, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';

// Types matching react-native-vision-camera interface
interface CameraDevice {
    id: string;
    name: string;
    position: 'front' | 'back';
    hasFlash: boolean;
    hasTorch: boolean;
}

interface RecordingOptions {
    onRecordingFinished: (video: { path: string }) => void;
    onRecordingError: (error: Error) => void;
}

interface CameraRef {
    takePhoto: () => Promise<{ path: string }>;
    startRecording: (options: RecordingOptions) => Promise<void>;
    stopRecording: () => Promise<void>;
    focus: () => Promise<void>;
}

interface CameraProps {
    device?: CameraDevice;
    isActive?: boolean;
    video?: boolean;
    audio?: boolean;
    style?: any;
}

// Hook to get camera device (mimics useCameraDevice from vision-camera)
export const useCameraDevice = (position: 'front' | 'back'): CameraDevice | undefined => {
    const [device, setDevice] = useState<CameraDevice | undefined>(undefined);

    useEffect(() => {
        let isMounted = true;
        let pollInterval: any = null;

        const getDevices = async () => {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                    console.warn('enumerateDevices not supported');
                    return;
                }

                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = devices.filter(device => device.kind === 'videoinput');

                // If no devices found or labels are empty (no permission yet), keep checking
                const hasLabels = videoDevices.some(d => d.label.length > 0);

                if (videoDevices.length === 0) {
                    if (isMounted) setDevice(undefined);
                    return;
                }

                // Find device based on position
                let selectedDevice = videoDevices[0];

                if (videoDevices.length > 1) {
                    if (position === 'front') {
                        selectedDevice = videoDevices.find(d =>
                            d.label.toLowerCase().includes('front') ||
                            d.label.toLowerCase().includes('user') ||
                            d.label.toLowerCase().includes('facetime')
                        ) || videoDevices[0];
                    } else {
                        selectedDevice = videoDevices.find(d =>
                            d.label.toLowerCase().includes('back') ||
                            d.label.toLowerCase().includes('environment') ||
                            d.label.toLowerCase().includes('rear')
                        ) || videoDevices[videoDevices.length - 1];
                    }
                }

                if (selectedDevice && isMounted) {
                    // Only update if device changed to avoid redundant renders
                    setDevice(prev => {
                        if (prev?.id === selectedDevice.deviceId) return prev;
                        return {
                            id: selectedDevice.deviceId,
                            name: selectedDevice.label || `Camera ${position}`,
                            position,
                            hasFlash: false,
                            hasTorch: false,
                        };
                    });
                }
            } catch (error) {
                console.error('Error enumerating cameras:', error);
            }
        };

        // Initial check
        getDevices();

        // Listen for device changes (plugging in, permissions granted often trigger this)
        const handleDeviceChange = () => getDevices();
        if (navigator.mediaDevices) {
            navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
        }

        // POLLING: Aggressively check for a few seconds if no device found or generic label
        // This helps when permission is granted *after* component mount
        let attempts = 0;
        pollInterval = setInterval(() => {
            attempts++;
            getDevices();
            // Stop polling after 5 seconds
            if (attempts > 10) clearInterval(pollInterval);
        }, 500);

        return () => {
            isMounted = false;
            if (pollInterval) clearInterval(pollInterval);
            if (navigator.mediaDevices) {
                navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
            }
        };
    }, [position]);

    return device;
};

// Hook for camera permission
export const useCameraPermission = () => {
    const [hasPermission, setHasPermission] = useState(false);

    useEffect(() => {
        const checkPermission = async () => {
            try {
                // Check if we can query permissions
                if ('permissions' in navigator && 'query' in navigator.permissions) {
                    const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
                    setHasPermission(result.state === 'granted');
                    result.addEventListener('change', () => {
                        setHasPermission(result.state === 'granted');
                    });
                } else {
                    // Fallback: try to get user media (will prompt if needed)
                    // We don't actually start the stream, just check if we can
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                        setHasPermission(true);
                        stream.getTracks().forEach(track => track.stop());
                    } catch {
                        setHasPermission(false);
                    }
                }
            } catch (error) {
                console.error('Error checking camera permission:', error);
                setHasPermission(false);
            }
        };

        checkPermission();
    }, []);

    const requestPermission = async (): Promise<boolean> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            setHasPermission(true);
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error('Error requesting camera permission:', error);
            setHasPermission(false);
            return false;
        }
    };

    return { hasPermission, requestPermission };
};

// Hook for microphone permission
export const useMicrophonePermission = () => {
    const [hasPermission, setHasPermission] = useState(false);

    useEffect(() => {
        const checkPermission = async () => {
            try {
                if ('permissions' in navigator && 'query' in navigator.permissions) {
                    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                    setHasPermission(result.state === 'granted');
                    result.addEventListener('change', () => {
                        setHasPermission(result.state === 'granted');
                    });
                } else {
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        setHasPermission(true);
                        stream.getTracks().forEach(track => track.stop());
                    } catch {
                        setHasPermission(false);
                    }
                }
            } catch (error) {
                console.error('Error checking microphone permission:', error);
                setHasPermission(false);
            }
        };

        checkPermission();
    }, []);

    const requestPermission = async (): Promise<boolean> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setHasPermission(true);
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error('Error requesting microphone permission:', error);
            setHasPermission(false);
            return false;
        }
    };

    return { hasPermission, requestPermission };
};

// Camera Component
const CameraView = forwardRef<CameraRef, CameraProps>(({ device, isActive = true, video = true, audio = true, style }, ref) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingOptionsRef = useRef<RecordingOptions | null>(null);
    const containerRef = useRef<any>(null);

    // Start/stop camera stream
    useEffect(() => {
        if (!isActive || !device || !video) {
            // Stop stream if inactive
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
            return;
        }

        const startStream = async () => {
            try {
                const constraints: MediaStreamConstraints = {
                    video: {
                        deviceId: { exact: device.id },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: audio,
                };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                streamRef.current = stream;

                // Attach stream to video element if it exists
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(err => console.error('Error playing video:', err));
                }
            } catch (error) {
                console.error('Error starting camera stream:', error);
            }
        };

        startStream();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        };
    }, [isActive, device, video, audio]);

    // Update video element source when stream changes
    useEffect(() => {
        if (videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    }, [streamRef.current]);

    // Callback ref to attach video element to container
    const setContainerRef = (node: any) => {
        containerRef.current = node;

        if (!node || typeof document === 'undefined') {
            if (videoRef.current && videoRef.current.parentNode) {
                videoRef.current.parentNode.removeChild(videoRef.current);
                videoRef.current = null;
            }
            return;
        }

        // React Native Web exposes the DOM node through _node property
        // or directly if it's already a DOM element
        const getDomNode = () => {
            if (node.nodeType === 1) return node; // Already a DOM element
            return node._node || node._nativeNode;
        };

        const domNode = getDomNode();
        if (!domNode || typeof domNode.appendChild !== 'function') return;

        // Create and attach video element
        if (!videoRef.current) {
            const video = document.createElement('video');
            video.autoplay = true;
            video.playsInline = true;
            video.muted = true; // IMPORTANT: Mute to prevent echo (feedback loop)
            video.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;';
            domNode.appendChild(video);
            videoRef.current = video;

            // Attach stream if available
            if (streamRef.current) {
                video.srcObject = streamRef.current;
                video.play().catch(err => console.error('Error playing video:', err));
            }
        }
    };

    // Expose camera methods via ref
    useImperativeHandle(ref, () => ({
        takePhoto: async () => {
            if (!videoRef.current) {
                throw new Error('Video element not ready');
            }

            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth || 1920;
            canvas.height = videoRef.current.videoHeight || 1080;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg');

                // Return as file path (web-compatible format)
                return { path: dataUrl };
            }
            throw new Error('Failed to capture photo');
        },

        startRecording: async (options: RecordingOptions) => {
            if (!streamRef.current) {
                const err = new Error('Camera stream not available');
                console.error(err);
                options.onRecordingError(err);
                return;
            }

            const tryStartRecording = (mimeType: string | undefined) => {
                try {
                    const chunks: Blob[] = [];
                    const recorderOptions: MediaRecorderOptions = {
                        videoBitsPerSecond: 2500000,
                    };
                    if (mimeType) {
                        recorderOptions.mimeType = mimeType;
                    }

                    console.log(`[CameraView] Attempting recording with mimeType: ${mimeType || 'default'}`);
                    const mediaRecorder = new MediaRecorder(streamRef.current!, mimeType ? recorderOptions : undefined);

                    mediaRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            chunks.push(event.data);
                        }
                    };

                    mediaRecorder.onstop = () => {
                        const finalType = mediaRecorder.mimeType || mimeType || 'video/webm';
                        console.log(`[CameraView] Recording finished. Final mimeType: ${finalType}, Chunks: ${chunks.length}`);
                        const blob = new Blob(chunks, { type: finalType });
                        const url = URL.createObjectURL(blob);
                        options.onRecordingFinished({ path: url });
                    };

                    mediaRecorder.onerror = (event: any) => {
                        console.error("[CameraView] MediaRecorder error:", event);
                        options.onRecordingError(new Error('Recording error occurred: ' + (event.error?.message || 'Unknown')));
                    };

                    mediaRecorder.start();
                    mediaRecorderRef.current = mediaRecorder;
                    recordingOptionsRef.current = options;
                    return true;
                } catch (e) {
                    console.warn(`[CameraView] Failed to start recorder with mimeType ${mimeType}:`, e);
                    return false;
                }
            };

            // Strategy: Try preferred MP4 -> preferred WebM -> Default (no options)
            let success = false;

            // 1. Try MP4 if supported
            if (MediaRecorder.isTypeSupported('video/mp4')) {
                success = tryStartRecording('video/mp4');
            }

            // 2. Try WebM if MP4 failed or not supported
            if (!success && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                success = tryStartRecording('video/webm;codecs=vp9');
            }
            if (!success && MediaRecorder.isTypeSupported('video/webm')) {
                success = tryStartRecording('video/webm');
            }

            // 3. Fallback to browser default (no mimeType specified)
            if (!success) {
                console.log('[CameraView] Fallback to default MediaRecorder settings');
                success = tryStartRecording(undefined);
            }

            if (!success) {
                const err = new Error('Failed to initialize MediaRecorder with any configuration');
                console.error(err);
                options.onRecordingError(err);
            }
        },

        stopRecording: async () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
                mediaRecorderRef.current = null;
                recordingOptionsRef.current = null;
            }
        },

        focus: async () => {
            // Web cameras don't support programmatic focus
            return Promise.resolve();
        },
    }));

    return (
        <View
            ref={setContainerRef}
            style={[styles.container, style]}
        />
    );
});

CameraView.displayName = 'CameraView';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
        overflow: 'hidden',
    },
});

export default CameraView;
