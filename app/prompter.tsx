import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Dimensions, ScrollView, StyleSheet, Alert, Animated as RNAnimated, Linking, useWindowDimensions, TextInput, AppState } from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useCameraDevice, useCameraPermission, useMicrophonePermission, Camera } from 'react-native-vision-camera';
import { useScriptStore } from '../store/useScriptStore';
import { WPM_MIN, WPM_MAX } from '../constants/prompter';
import { speedToWpm, speedToNormalized, normalizedToSpeed } from '../utils/speed';
import * as Brightness from 'expo-brightness';
import * as MediaLibrary from 'expo-media-library';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    cancelAnimation,
} from 'react-native-reanimated';
import { Play, Pause, FastForward, Rewind, Check, ChevronLeft, SwitchCamera, Search, X, ChevronUp, ChevronDown } from 'lucide-react-native';
import Slider from '@react-native-community/slider';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition';
import { setAudioModeAsync } from 'expo-audio';
import { parseHtmlToStyledSegments, parseHtmlToStyledWords, StyledSegment, StyledWord } from '../utils/htmlParser';
import i18n from '../utils/i18n';


export default function Teleprompter() {
    // --- Hooks & Store ---
    const router = useRouter();
    const isFocused = useIsFocused();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const isLandscape = windowWidth > windowHeight;
    const { activeScript, updateActiveScriptSettings } = useScriptStore();

    // --- App State for Camera ---
    const appState = useRef(AppState.currentState);
    const [isForeground, setIsForeground] = useState(appState.current === 'active');

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            appState.current = nextAppState;
            setIsForeground(nextAppState === 'active');
        });
        return () => subscription.remove();
    }, []);

    const isCameraActive = isFocused && isForeground;

    // Vision Camera Hooks
    const { hasPermission: hasCamPermission, requestPermission: requestCamPermission } = useCameraPermission();
    const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } = useMicrophonePermission();

    // Legacy Hooks (can remove later if fully migrated)
    const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

    // --- Voice Recognition ---
    const { start: startListening, stop: stopListening, transcript, isListening, isReady, error: voiceError, isCallActive } = useVoiceRecognition();

    // --- Playback & UI State ---
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [contentHeight, setContentHeight] = useState(0);
    const [containerHeight, setContainerHeight] = useState(Dimensions.get('window').height);
    const [scrollMode, setScrollMode] = useState<'auto' | 'fixed' | 'wpm'>('fixed');
    const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
    const activeDevice = useCameraDevice(cameraFacing);

    // --- Search State ---
    const [isSearchActive, setIsSearchActive] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    // Matches are now indices into the plain text
    const [allMatches, setAllMatches] = useState<{ start: number; length: number }[]>([]);
    const [matchCursor, setMatchCursor] = useState(0);

    // Auto-Start Listening when in 'auto' mode
    useEffect(() => {
        if (scrollMode === 'auto') {
            if (isCallActive) {
                Alert.alert(i18n.t('modeUnavailable'), i18n.t('callActiveError'));
                setScrollMode('fixed');
                return;
            }

            setMatchedIndex(-1);
            lastMatchIndexRef.current = 0;
            startListening();
        } else {
            stopListening();
        }

        return () => {
            stopListening(); // Ensure socket closes on unmount
        };
    }, [scrollMode]);

    // --- Alignment State ---
    const [matchedIndex, setMatchedIndex] = useState(-1);
    const lastMatchIndexRef = useRef(0);
    const [scriptWords, setScriptWords] = useState<StyledWord[]>([]);  // For AI scrolling
    const [scriptSegments, setScriptSegments] = useState<StyledSegment[]>([]);  // For display
    const [scriptPlainText, setScriptPlainText] = useState('');  // For search
    const [sectionStartIndices, setSectionStartIndices] = useState<number[]>([]);

    // Pre-calculate script segments, words, and plain text
    useEffect(() => {
        const contentToParse = activeScript?.html_content || activeScript?.content;
        if (contentToParse) {
            // Parse for display (preserves exact spacing)
            const { segments, plainText } = parseHtmlToStyledSegments(contentToParse);
            setScriptSegments(segments);
            setScriptPlainText(plainText);

            // Parse for AI scrolling (word-based)
            const parsedWords = parseHtmlToStyledWords(contentToParse);
            setScriptWords(parsedWords);

            // Legacy section logic (using plain text approximation for now)
            const rawContent = (activeScript?.plain_text || contentToParse || '').replace(/<[^>]*>/g, '').trim();
            const lines = rawContent.split('\n');
            const starts: number[] = [0];
            let currentWordTotal = 0;

            for (let i = 0; i < lines.length - 1; i++) {
                const lineWords = lines[i].trim().split(/\s+/).filter(w => w.length > 0);
                currentWordTotal += lineWords.length;

                // If this line is empty and previous or next line is also empty/significant
                if (lines[i].trim() === '' && lines[i + 1].trim() !== '') {
                    starts.push(currentWordTotal);
                }
            }
            const uniqueStarts = Array.from(new Set(starts)).sort((a, b) => a - b);
            setSectionStartIndices(uniqueStarts);

            setMatchedIndex(-1);
            lastMatchIndexRef.current = 0;
        }
    }, [activeScript?.html_content, activeScript?.content]);

    // --- Phase 3: Inactivity Timeout ---
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (scrollMode === 'auto') {
            // Reset timer on every transcript update
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

            silenceTimerRef.current = setTimeout(() => {
                if (scrollMode === 'auto') {
                    setScrollMode('fixed');
                    Alert.alert(
                        i18n.t('inactivityDetected'),
                        i18n.t('inactivityMessage')
                    );
                }
            }, 10000);
        } else {
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
            }
        }

        return () => {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        };
    }, [transcript, scrollMode]);

    useEffect(() => {
        if (voiceError) {
            if (voiceError.message.includes("Seems like you're in another call")) {
                Alert.alert(i18n.t('modeUnavailable'), voiceError.message);
                if (scrollMode === 'auto') {
                    setScrollMode('fixed');
                }
            }
        }
    }, [voiceError, scrollMode]);

    // React to transcript updates
    useEffect(() => {
        if (scrollMode === 'auto' && transcript && scriptWords.length > 0) {
            const { findBestMatchIndex } = require('../utils/textAlignment');
            // Extract plain text words for matching
            const wordList = scriptWords.map((w: any) => w.word);
            const matchIndex = findBestMatchIndex(wordList, transcript, lastMatchIndexRef.current);

            // Guard against large jumps (more than 15 words) in the first 5 seconds of the session
            // or if the match is too far from the current position initially.
            const isInitialPhase = lastMatchIndexRef.current === 0;
            if (isInitialPhase && matchIndex > 15) {
                return;
            }

            if (matchIndex !== lastMatchIndexRef.current && matchIndex >= lastMatchIndexRef.current) {
                lastMatchIndexRef.current = matchIndex;
                setMatchedIndex(matchIndex);

                // Calculate scroll position
                const progress = (matchIndex + 1) / scriptWords.length;
                const targetY = -(progress * contentHeight);

                scrollY.value = withTiming(targetY, {
                    duration: 500, // Reduced from 1200ms for faster response
                    easing: Easing.out(Easing.quad)
                });
            }
        }
    }, [transcript, scrollMode, contentHeight]);

    useEffect(() => {
        setIsCameraReady(false);
    }, [cameraFacing, activeScript?.mode]);

    const [displayValue, setDisplayValue] = useState(() => {
        return activeScript ? speedToNormalized(activeScript.speed || 1) : 0.5;
    });

    const wasPlayingRef = useRef(false);
    const cameraRef = useRef<Camera>(null);
    const isRecordingRef = useRef(isRecording);

    // --- Animation Values ---
    const scrollY = useSharedValue(0);
    const startScrollY = useSharedValue(0);
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

    // Configure Audio Session for concurrency (Restored for Dual-Stream)
    useEffect(() => {
        const configureAudio = async () => {
            try {
                // User requested specific configuration for Dual-Stream
                // Using expo-audio's direct API and unified interruptionMode
                await setAudioModeAsync({
                    allowsRecording: true,
                    playsInSilentMode: true,
                    shouldPlayInBackground: true,
                    interruptionMode: 'mixWithOthers',
                    shouldRouteThroughEarpiece: false,
                    allowsBackgroundRecording: true,
                });
            } catch (e) {
                console.warn("DEBUG: Failed to configure audio session", e);
            }
        };
        configureAudio();
    }, []);



    // Scrolling Logic
    const startAutoScroll = useCallback(() => {
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
        }
    }, [isPlaying, activeScript?.speed, contentHeight, scrollMode, containerHeight]);

    useEffect(() => {
        if (isPlaying) {
            startAutoScroll();
        } else {
            cancelAnimation(scrollY);
        }
    }, [isPlaying, activeScript?.speed, contentHeight, scrollMode, startAutoScroll]);

    // Speed Sync Logic (Simplified to avoid warnings)
    useEffect(() => {
        if (!activeScript) return;
        const target = speedToNormalized(activeScript.speed ?? 1);
        setDisplayValue(target);
    }, [activeScript?.speed]);

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

    const searchInputRef = useRef<any>(null);

    const handleSearch = (text: string) => {
        setSearchQuery(text);
        if (!text.trim() || text.length < 2) {
            setAllMatches([]);
            setMatchCursor(0);
            return;
        }

        // Search in the plain text (supports multi-word and partial word searches)
        const lowerQuery = text.toLowerCase();
        const lowerPlainText = scriptPlainText.toLowerCase();
        const matches: { start: number; length: number }[] = [];

        let searchStart = 0;
        let idx = lowerPlainText.indexOf(lowerQuery, searchStart);
        while (idx !== -1) {
            matches.push({ start: idx, length: text.length });
            searchStart = idx + 1;
            idx = lowerPlainText.indexOf(lowerQuery, searchStart);
        }

        setAllMatches(matches);
        setMatchCursor(0);

        if (matches.length > 0) {
            jumpToMatch(matches[0]);
        }
    };

    const jumpToMatch = (match: { start: number; length: number }) => {
        // Calculate progress based on character position in plain text
        const progress = match.start / (scriptPlainText.length || 1);
        const targetY = -(progress * contentHeight);

        if (scrollMode === 'auto') {
            // Convert character position to approximate word index
            const textBefore = scriptPlainText.slice(0, match.start);
            const wordsBefore = textBefore.split(/\s+/).filter(w => w.length > 0).length;
            lastMatchIndexRef.current = wordsBefore;
        }

        scrollY.value = withTiming(targetY, {
            duration: 500,
            easing: Easing.out(Easing.quad)
        });
    };

    const handleNextMatch = () => {
        if (allMatches.length === 0) return;
        const next = (matchCursor + 1) % allMatches.length;
        setMatchCursor(next);
        jumpToMatch(allMatches[next]);
    };

    const handlePrevMatch = () => {
        if (allMatches.length === 0) return;
        const prev = (matchCursor - 1 + allMatches.length) % allMatches.length;
        setMatchCursor(prev);
        jumpToMatch(allMatches[prev]);
    };

    const toggleSearch = () => {
        if (isSearchActive) {
            setIsSearchActive(false);
            setSearchQuery('');
            setAllMatches([]);
            setMatchCursor(0);
        } else {
            setIsSearchActive(true);
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    };

    // --- Gesture Logic ---
    const panGesture = Gesture.Pan()
        .onStart(() => {
            cancelAnimation(scrollY);
            startScrollY.value = scrollY.value;
        })
        .onUpdate((event) => {
            let nextY = startScrollY.value + event.translationY;
            // Clamping
            if (nextY > 0) nextY = 0;
            if (nextY < -contentHeight) nextY = -contentHeight;
            scrollY.value = nextY;
        })
        .onEnd(() => {
            if (scrollMode === 'auto') {
                // In AI mode, we need to update our search index based on where we are now
                // to allow the AI to "skip" or resume correctly.
                const progress = Math.abs(scrollY.value / (contentHeight || 1));
                const wordIndex = Math.floor(progress * scriptWords.length);

                // Find nearest section start at or before the current word index
                let targetIndex = 0;
                if (sectionStartIndices.length > 0) {
                    for (const start of sectionStartIndices) {
                        if (start <= wordIndex) {
                            targetIndex = start;
                        } else {
                            break;
                        }
                    }
                }

                lastMatchIndexRef.current = targetIndex;
            } else if (isPlaying) {
                // For Fixed/WPM, resume scrolling from new position
                startAutoScroll();
            }
        });

    // --- Handlers ---
    const handleBack = () => {
        if (scrollMode === 'auto') {
            setScrollMode('fixed');
        }

        if (isRecording) {
            Alert.alert(
                i18n.t('stopRecordingTitle'),
                i18n.t('stopRecordingMessage'),
                [
                    { text: i18n.t('cancel'), style: 'cancel' },
                    {
                        text: i18n.t('stopAndGoBack'), style: 'destructive', onPress: () => {
                            setIsRecording(false);
                            router.back();
                        }
                    }
                ]
            );
        } else {
            router.back();
        }
    };

    const handleRewind = () => {
        if (scrollMode !== 'auto') {
            setScrollMode('fixed');
        } else {
            // In AI mode, we reset tracking so it picks up from the start again
            setMatchedIndex(-1);
            lastMatchIndexRef.current = 0;
        }
        setIsPlaying(false);
        scrollY.value = withTiming(0, { duration: 500 });
    };

    const handleForward = () => {
        if (scrollMode !== 'auto') {
            setScrollMode('fixed');
        } else {
            // In AI mode, we move tracking to the end
            const finalIndex = scriptWords.length - 1;
            setMatchedIndex(finalIndex);
            lastMatchIndexRef.current = finalIndex;
        }
        setIsPlaying(false);
        scrollY.value = -contentHeight;
    };

    const handleDone = () => {
        if (scrollMode === 'auto') {
            setScrollMode('fixed');
        }
        router.navigate('/');
    };

    const handleRequestPermission = async () => {
        const camGranted = await requestCamPermission();
        const micGranted = await requestMicPermission();

        if (!camGranted || !micGranted) {
            Alert.alert(
                i18n.t('permissionsRequired'),
                i18n.t('permissionsMessage'),
                [
                    { text: i18n.t('cancel'), style: 'cancel' },
                    { text: i18n.t('openSettings'), onPress: () => Linking.openSettings() }
                ]
            );
        }
    };

    const toggleRecording = async () => {
        if (isRecording) {
            setIsRecording(false);
            try {
                await cameraRef.current?.stopRecording();
            } catch (e) {
                console.error("Stop recording error:", e);
            }
            return;
        }

        if (!activeDevice) {
            Alert.alert(i18n.t('error'), i18n.t('cameraNotFound'));
            return;
        }

        if (isCallActive) {
            Alert.alert(i18n.t('recordingUnavailable'), i18n.t('callActiveError'));
            return;
        }

        if (!hasMicPermission) {
            const micGranted = await requestMicPermission();
            if (!micGranted) {
                Alert.alert(i18n.t('permissionNeeded'), i18n.t('micPermissionRequired'));
                return;
            }
        }
        if (!mediaPermission?.granted) {
            const mediaResponse = await requestMediaPermission();
            if (!mediaResponse.granted) {
                if (!mediaResponse.canAskAgain) {
                    Alert.alert(i18n.t('permissionNeeded'), i18n.t('mediaPermissionRequiredSettings'), [
                        { text: i18n.t('cancel'), style: 'cancel' },
                        { text: i18n.t('openSettings'), onPress: () => Linking.openSettings() }
                    ]);
                } else {
                    Alert.alert(i18n.t('permissionNeeded'), i18n.t('mediaPermissionRequired'));
                }
                return;
            }
        }

        setIsRecording(true);
        try {
            cameraRef.current?.startRecording({
                onRecordingFinished: (video) => {
                    MediaLibrary.saveToLibraryAsync(video.path);
                    Alert.alert(i18n.t('saved'), i18n.t('videoSaved'));
                },
                onRecordingError: (error) => {
                    console.error("Recording error:", error);
                    Alert.alert(i18n.t('error'), i18n.t('recordingFailed'));
                    setIsRecording(false);
                }
            });
        } catch (error) {
            console.error("Recording error:", error);
            Alert.alert(i18n.t('error'), i18n.t('startRecordingFailed'));
            setIsRecording(false);
        }
    };

    // --- Render Helpers ---
    if (!activeScript) {
        return (
            <View className="flex-1 bg-black items-center justify-center p-6">
                <Text className="text-white text-center mb-6 text-lg">{i18n.t('noScriptSelected')}</Text>
                <TouchableOpacity className="bg-blue-600 p-4 rounded-xl" onPress={() => router.replace('/')}>
                    <Text className="text-white font-bold">{i18n.t('goBack')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!hasCamPermission || !hasMicPermission) return <View className="bg-black flex-1" />;
    if ((!hasCamPermission || !hasMicPermission) && activeScript?.mode === 'phone') {
        return (
            <View className="flex-1 bg-black items-center justify-center p-6">
                <Text className="text-white text-center mb-6 text-lg">{i18n.t('permissionRequestMessage')}</Text>
                <TouchableOpacity className="bg-blue-600 p-4 rounded-xl" onPress={handleRequestPermission}>
                    <Text className="text-white font-bold">{i18n.t('grantPermissions')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <GestureHandlerRootView className="flex-1">
            <View
                className="flex-1 bg-black relative"
                onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
            >
                {/* 1. Camera Layer (Background) only if Phone Mode */}
                {activeScript?.mode === 'phone' && activeDevice && (
                    <View style={StyleSheet.absoluteFill}>
                        <Camera
                            ref={cameraRef}
                            style={StyleSheet.absoluteFill}
                            device={activeDevice}
                            isActive={isCameraActive}
                            video={true}
                            audio={true}
                        />
                        {/* Dark Overlay for readability */}
                        <View className="absolute inset-0 bg-black/40" />
                    </View>
                )}

                {/* Fallback if no device */}
                {activeScript?.mode === 'phone' && !activeDevice && (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' }]}>
                        <Text className="text-white">{i18n.t('cameraUnavailable')}</Text>
                    </View>
                )}

                {/* Top Left Back Button */}
                <View className={`absolute ${isLandscape ? "top-6 left-10" : "top-20 left-6"} z-50 flex-row gap-4`}>
                    <TouchableOpacity
                        className={`bg-black/60 ${isLandscape ? "p-2 px-3" : "p-3 px-5"} rounded-full border border-white/20 blur-md flex-row items-center gap-2`}
                        onPress={handleBack}
                    >
                        <ChevronLeft color="white" size={20} />
                        <Text className="text-white font-bold">{i18n.t('back')}</Text>
                    </TouchableOpacity>
                </View>

                {/* Top Right Search Button */}
                <View className={`absolute ${isLandscape ? "top-6 right-10" : "top-20 right-6"} z-50 flex-row gap-4`}>
                    {isSearchActive ? (
                        <View className="flex-row items-center bg-black/60 border border-white/20 px-4 h-12 rounded-full blur-md shadow-2xl min-w-[220px]">
                            <View className="flex-1 flex-row items-center h-full">
                                <TextInput
                                    ref={searchInputRef}
                                    style={{ color: 'white', fontSize: 15, flex: 1, paddingVertical: 0 }}
                                    placeholder={i18n.t('search')}
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={searchQuery}
                                    onChangeText={handleSearch}
                                    autoCapitalize="none"
                                />
                                {searchQuery.length > 0 && (
                                    <Text className="text-[11px] text-white/50 font-medium mr-2">
                                        {allMatches.length > 0 ? `${matchCursor + 1} /${allMatches.length}` : '0/0'}
                                    </Text >
                                )}
                            </View>

                            <View className="flex-row items-center gap-2 pr-1">
                                <TouchableOpacity onPress={handlePrevMatch} className="active:opacity-50">
                                    <ChevronUp color={allMatches.length > 0 ? "white" : "rgba(255,255,255,0.2)"} size={20} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleNextMatch} className="active:opacity-50">
                                    <ChevronDown color={allMatches.length > 0 ? "white" : "rgba(255,255,255,0.2)"} size={20} />
                                </TouchableOpacity>
                                {/* <View className="w-[1px] h-4 bg-white/20 mx-1" /> */}
                                <TouchableOpacity onPress={toggleSearch} className="active:opacity-50">
                                    <X color="white" size={20} />
                                </TouchableOpacity>
                            </View>
                        </View >
                    ) : (
                        <TouchableOpacity
                            className={`bg-black/60 ${isLandscape ? "p-3" : "p-4"} rounded-full border border-white/20 blur-md items-center justify-center`}
                            onPress={toggleSearch}
                        >
                            <Search color="white" size={20} />
                        </TouchableOpacity>
                    )}
                </View >

                {/* Debug Transcript Overlay (Temporary for Phase 2) */}
                {
                    isListening && (
                        <View className="absolute top-24 left-6 right-6 bg-black/50 p-2 rounded z-40 pointer-events-none">
                            <Text className="text-yellow-400 text-xs font-mono">{i18n.t('listening')}: {transcript}</Text>
                            {voiceError && <Text className="text-red-500 text-xs">{i18n.t('error')}: {voiceError.message}</Text>}
                        </View>
                    )
                }

                {/* Script Container */}
                <View className="absolute inset-x-0 top-0 bottom-0">
                    <GestureDetector gesture={panGesture}>
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
                                        {(() => {
                                            if (scriptSegments.length === 0) {
                                                return activeScript?.plain_text || i18n.t('noScriptContent');
                                            }

                                            // Build a set of highlighted character ranges from search matches
                                            const highlightRanges: { start: number; end: number; isActive: boolean }[] = [];
                                            if (searchQuery && allMatches.length > 0) {
                                                allMatches.forEach((match, idx) => {
                                                    highlightRanges.push({
                                                        start: match.start,
                                                        end: match.start + match.length,
                                                        isActive: idx === matchCursor
                                                    });
                                                });
                                            }

                                            // Calculate AI matched character position (approximate)
                                            let aiMatchedCharPos = -1;
                                            if (matchedIndex >= 0 && scriptWords.length > 0) {
                                                // Count characters up to the matched word index
                                                let charCount = 0;
                                                for (let i = 0; i <= matchedIndex && i < scriptWords.length; i++) {
                                                    charCount += scriptWords[i].word.length;
                                                    if (i < matchedIndex) charCount += 1; // space between words
                                                }
                                                aiMatchedCharPos = charCount;
                                            }

                                            // Render segments with exact text preservation
                                            return scriptSegments.map((segment, segIdx) => {
                                                const { text, style: baseStyle, startIndex, endIndex } = segment;

                                                // Check if this segment overlaps with any search highlight
                                                const overlappingHighlights = highlightRanges.filter(
                                                    h => h.start < endIndex && h.end > startIndex
                                                );

                                                // Check if this segment is matched by AI
                                                const isMatchedByAI = aiMatchedCharPos >= 0 && startIndex < aiMatchedCharPos;

                                                if (overlappingHighlights.length === 0) {
                                                    // No search highlights, render segment as-is
                                                    return (
                                                        <Text
                                                            key={segIdx}
                                                            style={[
                                                                baseStyle,
                                                                { color: isMatchedByAI ? '#4ade80' : (baseStyle.color || 'white') }
                                                            ]}
                                                        >
                                                            {text}
                                                        </Text>
                                                    );
                                                }

                                                // Split segment by highlight boundaries
                                                const parts: { text: string; highlight: boolean; isActive: boolean; charStart: number }[] = [];
                                                let currentPos = startIndex;

                                                // Get all boundary points within this segment
                                                const boundaries = new Set<number>();
                                                boundaries.add(startIndex);
                                                boundaries.add(endIndex);
                                                overlappingHighlights.forEach(h => {
                                                    if (h.start > startIndex && h.start < endIndex) boundaries.add(h.start);
                                                    if (h.end > startIndex && h.end < endIndex) boundaries.add(h.end);
                                                });
                                                const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

                                                for (let i = 0; i < sortedBoundaries.length - 1; i++) {
                                                    const partStart = sortedBoundaries[i];
                                                    const partEnd = sortedBoundaries[i + 1];
                                                    const partText = text.slice(partStart - startIndex, partEnd - startIndex);

                                                    // Check if this part is highlighted
                                                    const matchingHighlight = overlappingHighlights.find(
                                                        h => h.start <= partStart && h.end >= partEnd
                                                    );

                                                    parts.push({
                                                        text: partText,
                                                        highlight: !!matchingHighlight,
                                                        isActive: matchingHighlight?.isActive || false,
                                                        charStart: partStart
                                                    });
                                                }

                                                return (
                                                    <Text key={segIdx}>
                                                        {parts.map((part, partIdx) => {
                                                            const partIsAIMatched = aiMatchedCharPos >= 0 && part.charStart < aiMatchedCharPos;
                                                            return (
                                                                <Text
                                                                    key={partIdx}
                                                                    style={[
                                                                        baseStyle,
                                                                        {
                                                                            color: partIsAIMatched ? '#4ade80' : (baseStyle.color || 'white'),
                                                                            backgroundColor: part.highlight ? '#f97316' : 'transparent',
                                                                            opacity: part.highlight && !part.isActive ? 0.75 : 1
                                                                        }
                                                                    ]}
                                                                >
                                                                    {part.text}
                                                                </Text>
                                                            );
                                                        })}
                                                    </Text>
                                                );
                                            });
                                        })()}
                                    </Text>
                                </View>

                                {/* Extra padding at bottom */}
                                <View style={{ height: containerHeight }} />
                            </Animated.View>
                        </ScrollView>
                    </GestureDetector>
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
                                        ? `${speedToWpm(normalizedToSpeed(displayValue))} ${i18n.t('wpm')}`
                                        : `${i18n.t('speed')}: ${normalizedToSpeed(displayValue).toFixed(1)}x`}
                                </Text>
                            </View>
                            <View className={`flex-row items-center justify-between ${isLandscape ? "" : "mb-2"}`}>
                                <View className="w-10 h-5 items-center justify-center">
                                    <Animated.Text style={wpmLabelStyle} className="absolute text-white text-[10px] font-bold">
                                        {Math.round(WPM_MIN)}
                                    </Animated.Text>
                                    <Animated.Text style={fixedLabelStyle} className="absolute text-white text-[10px] font-bold">
                                        {i18n.t('slow')}
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
                                        {i18n.t('fast')}
                                    </Animated.Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Mode Selector */}
                    <View style={{ marginBottom: isLandscape ? 4 : 8 }} className="flex-row justify-between bg-zinc-900 rounded-xl p-1">
                        {(['auto', 'fixed', 'wpm'] as const).map((mode) => {
                            const isActive = scrollMode === mode;
                            return (
                                <TouchableOpacity
                                    key={mode}
                                    onPress={() => setScrollMode(mode)}
                                    style={{ backgroundColor: isActive ? '#3f3f46' : 'transparent' }}
                                    className="flex-1 py-1.5 rounded-lg items-center"
                                >
                                    <Text style={{ color: isActive ? '#ffffff' : '#71717a' }} className="text-[10px] font-bold">
                                        {mode === 'auto' ? i18n.t('autoAi') : mode === 'fixed' ? i18n.t('fixed') : i18n.t('wpm')}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Bottom Row: Controls + Done Button */}
                    <View className="flex-row justify-between items-center">
                        <View style={{ width: 60, alignItems: 'center', justifyContent: 'center' }}>
                            {activeScript?.mode === 'phone' && (
                                <TouchableOpacity
                                    onPress={toggleRecording}
                                    disabled={isCallActive && !isRecording}
                                    className={`w-10 h-10 rounded-full border-2 items-center justify-center ${isRecording ? 'border-red-500' : 'border-white'}`}
                                >
                                    <View className={`rounded-full ${isRecording ? 'w-3 h-3 bg-red-500' : 'w-7 h-7 bg-red-500'}`} />
                                </TouchableOpacity>
                            )}
                        </View>

                        <View className="flex-row items-center gap-6">
                            <TouchableOpacity onPress={handleRewind}>
                                <Rewind color="white" size={isLandscape ? 24 : 28} fill="white" />
                            </TouchableOpacity>

                            {scrollMode !== 'auto' ? (
                                <TouchableOpacity onPress={() => setIsPlaying(!isPlaying)}>
                                    {isPlaying ? (
                                        <Pause color="white" size={isLandscape ? 36 : 40} fill="white" />
                                    ) : (
                                        <Play color="white" size={isLandscape ? 36 : 40} fill="white" />
                                    )}
                                </TouchableOpacity>
                            ) : (
                                <View className="items-center justify-center px-2">
                                    <Text className={`text-orange-400 font-bold text-[10px] text-center ${!isReady ? 'opacity-50' : ''}`}>
                                        {isReady ? i18n.t('aiScrollingActive') : i18n.t('aiScrollingLoading')}
                                    </Text>
                                </View>
                            )}

                            <TouchableOpacity onPress={handleForward}>
                                <FastForward color="white" size={isLandscape ? 24 : 28} fill="white" />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            onPress={handleDone}
                            className="bg-zinc-800 p-2 rounded-full"
                        >
                            <Check color="white" size={isLandscape ? 20 : 24} />
                        </TouchableOpacity>
                    </View>
                </View>
            </View >
        </GestureHandlerRootView >
    );
}
