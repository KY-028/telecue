import React, { forwardRef, useImperativeHandle, useEffect, useRef, useState, useLayoutEffect } from 'react';
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
        const getDevices = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = devices.filter(device => device.kind === 'videoinput');
                
                // Find device based on position (front/back)
                // On web, we can't reliably detect front/back, so we'll use the first available device
                // or try to match by label if available
                let selectedDevice = videoDevices[0];
                
                if (videoDevices.length > 1) {
                    // Try to find front camera (usually labeled with "front" or "user")
                    if (position === 'front') {
                        selectedDevice = videoDevices.find(d => 
                            d.label.toLowerCase().includes('front') || 
                            d.label.toLowerCase().includes('user') ||
                            d.label.toLowerCase().includes('facetime')
                        ) || videoDevices[0];
                    } else {
                        // Try to find back camera (usually labeled with "back" or "environment")
                        selectedDevice = videoDevices.find(d => 
                            d.label.toLowerCase().includes('back') || 
                            d.label.toLowerCase().includes('environment') ||
                            d.label.toLowerCase().includes('rear')
                        ) || videoDevices[videoDevices.length - 1];
                    }
                }

                if (selectedDevice) {
                    setDevice({
                        id: selectedDevice.deviceId,
                        name: selectedDevice.label || `Camera ${position}`,
                        position,
                        hasFlash: false,
                        hasTorch: false,
                    });
                }
            } catch (error) {
                console.error('Error enumerating cameras:', error);
            }
        };

        getDevices();
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
                options.onRecordingError(new Error('Camera stream not available'));
                return;
            }

            try {
                const chunks: Blob[] = [];
                const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                    ? 'video/webm;codecs=vp9'
                    : MediaRecorder.isTypeSupported('video/webm')
                    ? 'video/webm'
                    : 'video/mp4';

                const mediaRecorder = new MediaRecorder(streamRef.current, {
                    mimeType,
                    videoBitsPerSecond: 2500000, // 2.5 Mbps
                });

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        chunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    options.onRecordingFinished({ path: url });
                };

                mediaRecorder.onerror = (event) => {
                    options.onRecordingError(new Error('Recording error occurred'));
                };

                mediaRecorder.start();
                mediaRecorderRef.current = mediaRecorder;
                recordingOptionsRef.current = options;
            } catch (error) {
                options.onRecordingError(error instanceof Error ? error : new Error('Failed to start recording'));
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
