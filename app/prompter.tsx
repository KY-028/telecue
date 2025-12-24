import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Dimensions, ScrollView, StyleSheet, Alert, Animated as RNAnimated, Linking, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useScriptStore } from '../store/useScriptStore';
import { WPM_MIN, WPM_MAX } from '../constants/prompter';
import { speedToWpm, speedToNormalized, normalizedToSpeed } from '../utils/speed';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness';
import * as MediaLibrary from 'expo-media-library';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    cancelAnimation,
} from 'react-native-reanimated';
import { Play, Pause, FastForward, Rewind, Check, ChevronLeft, SwitchCamera } from 'lucide-react-native';
import Slider from '@react-native-community/slider';

export default function Teleprompter() {
    // --- Hooks & Store ---
    const router = useRouter();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const isLandscape = windowWidth > windowHeight;
    const { activeScript, updateActiveScriptSettings } = useScriptStore();
    const [permission, requestPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();
    const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

    // --- Playback & UI State ---
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [contentHeight, setContentHeight] = useState(0);
    const [containerHeight, setContainerHeight] = useState(Dimensions.get('window').height);
    const [scrollMode, setScrollMode] = useState<'auto' | 'fixed' | 'wpm'>('fixed');
    const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
    const [displayValue, setDisplayValue] = useState(() => {
        return activeScript ? speedToNormalized(activeScript.speed || 1) : 50;
    });

    // --- Refs ---
    const animRef = useRef(new RNAnimated.Value(displayValue)).current;
    const wasPlayingRef = useRef(false);
    const cameraRef = useRef<CameraView>(null);
    const prevModeRef = useRef(scrollMode);
    const isRecordingRef = useRef(isRecording);

    // --- Animation Values ---
    const scrollY = useSharedValue(0);
    const labelOpacity = useSharedValue(scrollMode === 'wpm' ? 1 : 0);

    // --- Effects ---
    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);

    useEffect(() => {
        labelOpacity.value = withTiming(scrollMode === 'wpm' ? 1 : 0, {
            duration: 200,
        });
    }, [scrollMode]);

    useEffect(() => {
        let initialBrightness: number;

        const setupBrightness = async () => {
            try {
                initialBrightness = await Brightness.getBrightnessAsync();
                const { status } = await Brightness.requestPermissionsAsync();
                if (status === 'granted') {
                    await Brightness.setBrightnessAsync(1);
                }
            } catch (e) {
                console.error("Brightness error:", e);
            }
        };
        setupBrightness();

        return () => {
            if (initialBrightness !== undefined) {
                Brightness.setBrightnessAsync(initialBrightness);
            }
            if (isRecordingRef.current) {
                cameraRef.current?.stopRecording();
            }
        };
    }, []);

    // Scrolling Logic
    useEffect(() => {
        if (isPlaying && contentHeight > 0) {
            const currentY = scrollY.value;
            const targetY = -(contentHeight + containerHeight / 2);
            const distance = Math.abs(targetY - currentY);

            let pixelsPerSecond = 30;

            const wordCount = activeScript?.content?.trim().split(/\s+/).length || 1;
            const pixelsPerWord = contentHeight / wordCount;
            const wpm = speedToWpm(activeScript?.speed || 1);
            const wordsPerSecond = wpm / 60;

            if (scrollMode === 'wpm' || scrollMode === 'fixed') {
                pixelsPerSecond = wordsPerSecond * pixelsPerWord;
            } else {
                pixelsPerSecond = (activeScript?.speed || 1) * 30;
            }

            const duration = (distance / pixelsPerSecond) * 1000;

            scrollY.value = withTiming(targetY, {
                duration: duration > 0 ? duration : 0,
                easing: Easing.linear,
            });
        } else {
            cancelAnimation(scrollY);
        }
    }, [isPlaying, activeScript?.speed, contentHeight, scrollMode]);

    // Speed Sync Logic
    useEffect(() => {
        if (!activeScript) return;
        const target = speedToNormalized(activeScript.speed ?? 1);
        const modeChanged = prevModeRef.current !== scrollMode;
        prevModeRef.current = scrollMode;

        if (modeChanged || Math.abs(target - displayValue) < 0.1) {
            animRef.setValue(target);
            setDisplayValue(target);
            return;
        }

        const listenerId = animRef.addListener(({ value }) => {
            setDisplayValue(value);
        });

        RNAnimated.timing(animRef, {
            toValue: target,
            duration: 220,
            useNativeDriver: false,
        }).start(() => {
            animRef.removeListener(listenerId);
            animRef.setValue(target);
            setDisplayValue(target);
        });

        return () => {
            try { animRef.removeListener(listenerId); } catch { }
        };
    }, [scrollMode, activeScript?.speed]);

    // --- Animated Styles ---
    const wpmLabelStyle = useAnimatedStyle(() => ({
        opacity: labelOpacity.value,
    }));

    const fixedLabelStyle = useAnimatedStyle(() => ({
        opacity: 1 - labelOpacity.value,
    }));

    const progressStyle = useAnimatedStyle(() => {
        const progress = Math.min(Math.max(-scrollY.value / (contentHeight || 1), 0), 1);
        return { width: `${progress * 100}%` };
    });

    const animatedTextStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: scrollY.value },
            { scaleX: activeScript?.is_mirrored_h ? -1 : 1 },
            { scaleY: activeScript?.is_mirrored_v ? -1 : 1 },
        ],
    }));

    // --- Handlers ---
    const handleBack = () => {
        if (isRecording) {
            Alert.alert(
                'Stop Recording?',
                'Going back will stop and save your current recording.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Stop & Go Back', style: 'destructive', onPress: () => router.back() }
                ]
            );
        } else {
            router.back();
        }
    };

    const handleRewind = () => {
        setIsPlaying(false);
        scrollY.value = withTiming(0, { duration: 500 });
    };

    const handleForward = () => {
        setIsPlaying(false);
        scrollY.value = -contentHeight;
    };

    const handleRequestPermission = async () => {
        const response = await requestPermission();
        if (!response.granted && !response.canAskAgain) {
            Alert.alert(
                'Permission Required',
                'Camera permission is required for Phone Recording mode. Please enable it in settings.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Open Settings', onPress: () => Linking.openSettings() }
                ]
            );
        }
    };

    const toggleRecording = async () => {
        if (isRecording) {
            setIsRecording(false);
            cameraRef.current?.stopRecording();
            return;
        }

        if (!micPermission?.granted) {
            const micResponse = await requestMicPermission();
            if (!micResponse.granted) {
                if (!micResponse.canAskAgain) {
                    Alert.alert('Permission needed', 'Microphone permission is required to record video. Please enable it in settings.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Open Settings', onPress: () => Linking.openSettings() }
                    ]);
                } else {
                    Alert.alert('Permission needed', 'Microphone permission is required to record video.');
                }
                return;
            }
        }
        if (!mediaPermission?.granted) {
            const mediaResponse = await requestMediaPermission();
            if (!mediaResponse.granted) {
                if (!mediaResponse.canAskAgain) {
                    Alert.alert('Permission needed', 'Media Library permission is required to save videos. Please enable it in settings.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Open Settings', onPress: () => Linking.openSettings() }
                    ]);
                } else {
                    Alert.alert('Permission needed', 'Media Library permission is required to save videos.');
                }
                return;
            }
        }

        setIsRecording(true);
        try {
            const video = await cameraRef.current?.recordAsync();
            if (video) {
                await MediaLibrary.saveToLibraryAsync(video.uri);
                Alert.alert('Saved', 'Video saved to your gallery!');
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to record video.');
            setIsRecording(false);
        }
    };

    // --- Render Helpers ---
    if (!activeScript) {
        return (
            <View className="flex-1 bg-black items-center justify-center p-6">
                <Text className="text-white text-center mb-6 text-lg">No script selected.</Text>
                <TouchableOpacity className="bg-blue-600 p-4 rounded-xl" onPress={() => router.replace('/')}>
                    <Text className="text-white font-bold">Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!permission) return <View className="bg-black flex-1" />;
    if (!permission.granted && activeScript?.mode === 'phone') {
        return (
            <View className="flex-1 bg-black items-center justify-center p-6">
                <Text className="text-white text-center mb-6 text-lg">We need your permission to show the camera for Phone Recording mode.</Text>
                <TouchableOpacity className="bg-blue-600 p-4 rounded-xl" onPress={handleRequestPermission}>
                    <Text className="text-white font-bold">Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // --- Render ---
    return (
        <View
            className="flex-1 bg-black relative"
            onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
        >
            {activeScript?.mode === 'phone' && (
                <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing={cameraFacing}
                    mode="video"
                />
            )}

            {/* Top Left Back Button */}
            <View className={`absolute ${isLandscape ? "top-6 left-10" : "top-12 left-6"} z-50 flex-row gap-4`}>
                <TouchableOpacity
                    className={`bg-black/60 ${isLandscape ? "p-2 px-3" : "p-3 px-5"} rounded-full border border-white/20 blur-md flex-row items-center gap-2`}
                    onPress={handleBack}
                >
                    <ChevronLeft color="white" size={20} />
                    <Text className="text-white font-bold">Back</Text>
                </TouchableOpacity>
            </View>

            {/* Script Container */}
            <View className="absolute inset-x-0 top-0 bottom-0">
                <ScrollView
                    scrollEnabled={false}
                    showsVerticalScrollIndicator={false}
                    style={{
                        flex: 1,
                        backgroundColor: activeScript?.mode === 'phone' ? 'rgba(0,0,0,0.5)' : 'black',
                        paddingHorizontal: isLandscape ? 60 : 24
                    }}
                    contentContainerStyle={{ flexGrow: 1 }}
                >
                    <Animated.View style={[animatedTextStyle, { width: '100%', alignItems: 'center', paddingHorizontal: activeScript?.margin ?? 0 }]}>
                        {/* Padding top to start text in middle */}
                        <View style={{ height: containerHeight / 2 }} />

                        {/* Measurement Wrapper */}
                        <View
                            onLayout={(e) => {
                                if (Math.abs(contentHeight - e.nativeEvent.layout.height) > 10) {
                                    setContentHeight(e.nativeEvent.layout.height);
                                }
                            }}
                            style={{ width: '100%' }}
                        >
                            <Text
                                className="text-white font-bold text-center"
                                style={{ fontSize: (activeScript?.font_size || 3) * 8 + 16 }}
                            >
                                {activeScript?.content || "No script content provided."}
                            </Text>
                        </View>

                        {/* Extra padding at bottom */}
                        <View style={{ height: containerHeight }} />
                    </Animated.View>
                </ScrollView>
            </View>

            {/* Floating Control Bar */}
            <View
                className={`absolute ${isLandscape ? "bottom-4" : "bottom-6"} bg-black/80 rounded-3xl border border-white/10 p-4 pt-0 z-50 shadow-2xl`}
                style={{
                    left: isLandscape ? 120 : 24,
                    right: isLandscape ? 120 : 24
                }}
            >
                {activeScript?.mode === 'phone' && !isRecording && (
                    <TouchableOpacity
                        className="absolute -top-14 left-0 bg-black/60 p-2.5 rounded-full border border-white/20 blur-md items-center justify-center"
                        onPress={() => setCameraFacing(prev => prev === 'front' ? 'back' : 'front')}
                    >
                        <SwitchCamera color="white" size={20} />
                    </TouchableOpacity>
                )}

                {/* Progress Bar */}
                <View className="h-1 bg-zinc-700 rounded-full overflow-hidden mb-3 self-center" style={{ width: '95%' }}>
                    <Animated.View className="h-full bg-orange-500" style={progressStyle} />
                </View>

                {/* Speed Slider */}
                {(scrollMode === 'fixed' || scrollMode === 'wpm') && (
                    <View>
                        <View className="items-center">
                            <Text className="text-white text-[10px] font-bold opacity-50">
                                {scrollMode === 'wpm'
                                    ? `${speedToWpm(normalizedToSpeed(displayValue))} WPM`
                                    : `SPEED: ${normalizedToSpeed(displayValue).toFixed(1)}x`}
                            </Text>
                        </View>
                        <View className={`flex-row items-center justify-between ${isLandscape ? "" : "mb-2"}`}>
                            <View className="w-10 h-5 items-center justify-center">
                                <Animated.Text style={wpmLabelStyle} className="absolute text-white text-[10px] font-bold">
                                    {Math.round(WPM_MIN)}
                                </Animated.Text>
                                <Animated.Text style={fixedLabelStyle} className="absolute text-white text-[10px] font-bold">
                                    SLOW
                                </Animated.Text>
                            </View>
                            <View className="flex-1 mx-4">
                                <Slider
                                    value={displayValue}
                                    minimumValue={0}
                                    maximumValue={100}
                                    step={0.1}
                                    onValueChange={setDisplayValue}
                                    onSlidingStart={() => {
                                        wasPlayingRef.current = isPlaying;
                                        if (isPlaying) setIsPlaying(false);
                                    }}
                                    onSlidingComplete={(val) => {
                                        const newSpeed = normalizedToSpeed(val);
                                        updateActiveScriptSettings({ speed: newSpeed });
                                        if (wasPlayingRef.current) setIsPlaying(true);
                                    }}
                                    minimumTrackTintColor="#f97316"
                                    maximumTrackTintColor="#52525b"
                                    thumbTintColor="#f97316"
                                />
                            </View>
                            <View className="w-10 h-5 items-center justify-center">
                                <Animated.Text style={wpmLabelStyle} className="absolute text-white text-[10px] font-bold">
                                    {Math.round(WPM_MAX)}
                                </Animated.Text>
                                <Animated.Text style={fixedLabelStyle} className="absolute text-white text-[10px] font-bold">
                                    FAST
                                </Animated.Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Mode Selector */}
                <View className={`flex-row justify-between bg-zinc-900 rounded-xl p-1 ${isLandscape ? "mb-1" : "mb-2"}`}>
                    {(['auto', 'fixed', 'wpm'] as const).map((mode) => (
                        <TouchableOpacity
                            key={mode}
                            onPress={() => setScrollMode(mode)}
                            className={`flex-1 py-1.5 rounded-lg items-center ${scrollMode === mode ? 'bg-zinc-700' : ''}`}
                        >
                            <Text className={`text-[10px] font-bold ${scrollMode === mode ? 'text-white' : 'text-zinc-500'}`}>
                                {mode === 'auto' ? 'Auto' : mode === 'fixed' ? 'Fixed' : 'WPM'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Bottom Row: Controls + Done Button */}
                <View className="flex-row justify-between items-center">
                    <View style={{ width: 40 }}>
                        {activeScript?.mode === 'phone' && (
                            <TouchableOpacity
                                onPress={toggleRecording}
                                className={`w-10 h-10 rounded-full border-2 items-center justify-center ${isRecording ? 'border-red-500' : 'border-white'}`}
                            >
                                <View className={`rounded-full ${isRecording ? 'w-3 h-3 bg-red-500 rounded-sm' : 'w-7 h-7 bg-red-500'}`} />
                            </TouchableOpacity>
                        )}
                    </View>

                    <View className="flex-row items-center gap-6">
                        <TouchableOpacity onPress={handleRewind}>
                            <Rewind color="white" size={isLandscape ? 24 : 28} fill="white" />
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setIsPlaying(!isPlaying)}>
                            {isPlaying ? (
                                <Pause color="white" size={isLandscape ? 36 : 40} fill="white" />
                            ) : (
                                <Play color="white" size={isLandscape ? 36 : 40} fill="white" />
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={handleForward}>
                            <FastForward color="white" size={isLandscape ? 24 : 28} fill="white" />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        onPress={() => router.navigate('/')}
                        className="bg-zinc-800 p-2 rounded-full"
                    >
                        <Check color="white" size={isLandscape ? 20 : 24} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}
