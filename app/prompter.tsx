import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, Dimensions, ScrollView, StyleSheet, Alert, Linking, useWindowDimensions, TextInput, AppState, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useCameraDevice, useCameraPermission, useMicrophonePermission } from '../components/CameraView/CameraView';
import type { Camera } from 'react-native-vision-camera';
import CameraView from '../components/CameraView/CameraView';
import { useScriptStore } from '../store/useScriptStore';
import { WPM_MIN, WPM_MAX } from '../constants/prompter';
import { speedToWpm, speedToNormalized, normalizedToSpeed } from '../utils/speed';
import * as Brightness from 'expo-brightness';
import * as MediaLibrary from 'expo-media-library';
import * as SecureStore from 'expo-secure-store';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    cancelAnimation,
    runOnJS,
} from 'react-native-reanimated';
import { Play, Pause, FastForward, Rewind, Check, ChevronLeft, SwitchCamera, Search, X, ChevronUp, ChevronDown } from 'lucide-react-native';
import Slider from '@react-native-community/slider';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition';
import { setAudioModeAsync } from 'expo-audio';
import { parseHtmlToStyledSegments, parseHtmlToStyledWords, StyledSegment, StyledWord } from '../utils/htmlParser';
import { estimateScrollY, estimateCharFromScrollY } from '../utils/layoutHelper';
import i18n from '../utils/i18n';


// --- Helper Types for Chunked Rendering ---
interface TextBlock {
    id: string;
    segments: StyledSegment[];
    startIndex: number; // Global start index in plain text
    endIndex: number;   // Global end index in plain text
}

// --- Storage Helpers for Web Compatibility ---
const getStorageItem = async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(key);
        }
        return null;
    }
    return await SecureStore.getItemAsync(key);
};

const setStorageItem = async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(key, value);
        }
    } else {
        await SecureStore.setItemAsync(key, value);
    }
};

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

    // --- Invite Code State ---
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteCodeInput, setInviteCodeInput] = useState('');

    const handleModeChange = async (mode: 'auto' | 'fixed' | 'wpm') => {
        if (mode === 'auto') {
            try {
                const hasEntered = await getStorageItem('has_entered_invite_code');
                if (hasEntered === 'true') {
                    // If user has scrolled before entering AI mode, enable expanded search
                    if (scrollY.value !== 0) {
                        userDidScroll.value = true;
                        // Calculate word at current scroll position
                        const layoutConfig = {
                            fontSize: activeScript?.font_size || 3,
                            windowWidth,
                            isLandscape,
                            scriptMargin: activeScript?.margin || 0
                        };
                        const centerCharPos = estimateCharFromScrollY(scrollY.value, scriptPlainText, contentHeight, layoutConfig);
                        let centerIndex = 0;
                        for (let i = 0; i < cleanWords.length; i++) {
                            if (cleanWords[i].charStart <= centerCharPos) {
                                centerIndex = i;
                            } else {
                                break;
                            }
                        }
                        lastMatchIndex.value = centerIndex;
                        console.log(`[AI Mode] User pre-scrolled, starting at word: ${cleanWords[centerIndex]?.word}`);
                    }
                    setScrollMode('auto');
                } else {
                    setInviteCodeInput('');
                    setShowInviteModal(true);
                }
            } catch (error) {
                console.error("Error checking invite code:", error);
                setShowInviteModal(true);
            }
        } else {
            setScrollMode(mode);
        }
    };

    const verifyInviteCode = async () => {
        const codeToCheck = inviteCodeInput.trim();
        if (codeToCheck === process.env.EXPO_PUBLIC_INVITE_CODE) {
            try {
                await setStorageItem('has_entered_invite_code', 'true');
                setShowInviteModal(false);
                setScrollMode('auto');
            } catch (error) {
                console.error("Error saving invite code status:", error);
                if (Platform.OS === 'web') {
                    window.alert("Error: Could not save verification status.");
                } else {
                    Alert.alert("Error", "Could not save verification status.");
                }
            }
        } else {
            if (Platform.OS === 'web') {
                window.alert("Invalid Code: The invite code you entered is incorrect.");
            } else {
                Alert.alert("Invalid Code", "The invite code you entered is incorrect.");
            }
        }
    };

    // Auto-Start Listening when in 'auto' mode
    useEffect(() => {
        if (scrollMode === 'auto') {
            if (isCallActive) {
                Alert.alert(i18n.t('modeUnavailable'), i18n.t('callActiveError'));
                setScrollMode('fixed');
                return;
            }

            setMatchedIndex(-1);
            // Only reset to beginning if user hasn't pre-scrolled
            if (!userDidScroll.value) {
                lastMatchIndex.value = 0;
            }
            startListening();
        } else {
            stopListening();
        }

        return () => {
            stopListening(); // Ensure socket closes on unmount
        };
    }, [scrollMode]);

    // --- Alignment State & Loading ---
    const [matchedIndex, setMatchedIndex] = useState(-1);  // Index into scriptWords (for rendering)
    // IMPORTANT: Using useSharedValue instead of useRef because the pan gesture (a worklet)
    // needs to read/write this value, and useRef gets "frozen" by Reanimated worklets.
    // useSharedValue works across both JS thread and UI thread (worklets).
    const lastMatchIndex = useSharedValue(0);  // Index into cleanWords (for AI matching)
    const userDidScroll = useSharedValue(false);  // Flag: true if user scrolled, enables 30-word search window
    const [scriptWords, setScriptWords] = useState<StyledWord[]>([]);  // ALL tokens including newlines (for rendering)
    const [cleanWords, setCleanWords] = useState<{ word: string; charStart: number; charEnd: number; scriptWordIndex: number }[]>([]);  // Words only, no newlines (for AI matching)
    // Replaced plain scriptSegments with scriptBlocks for chunked rendering
    const [scriptBlocks, setScriptBlocks] = useState<TextBlock[]>([]);
    const [scriptPlainText, setScriptPlainText] = useState('');  // For search
    const [sectionStartIndices, setSectionStartIndices] = useState<number[]>([]);
    const [isLoadingScript, setIsLoadingScript] = useState(true);

    // Pre-calculate script segments, words, and plain text (ASYNC for performance)
    useEffect(() => {
        const prepareScript = async () => {
            if (!activeScript) return;

            setIsLoadingScript(true);

            // Yield to UI thread to allow navigation to complete and showing loading spinner
            await new Promise(resolve => setTimeout(resolve, 100));

            const contentToParse = activeScript?.html_content || activeScript?.content;
            if (contentToParse) {
                // 1. Parse all segments first (preserves exact spacing)
                const { segments, plainText } = parseHtmlToStyledSegments(contentToParse);
                setScriptPlainText(plainText);

                // 2. Break segments into blocks (paragraphs)
                // This is crucial for rendering performance and avoiding texture limits
                const blocks: TextBlock[] = [];
                let currentBlockSegments: StyledSegment[] = [];
                let currentBlockStart = 0;
                let currentBlockLength = 0;

                segments.forEach((seg, idx) => {
                    // Check if segment contains newlines which might signal block breaks
                    // For now, let's group by "paragraphs" roughly, or just chunk by length/count.
                    // A simple and robust way is to break on every double newline or strictly ensure
                    // blocks don't get too massive. 
                    // Let's rely on NEWLINE segments as natural split points if present,
                    // or accumulate up to a reasonable character count (e.g., 1000 chars) if no newlines.

                    currentBlockSegments.push(seg);
                    currentBlockLength += seg.text.length;

                    const isNewline = seg.text === '\n';
                    const isLongEnough = currentBlockLength > 500; // ~500 chars per block is very safe

                    if (isNewline || (isLongEnough && seg.text.endsWith(' '))) {
                        // Flush block
                        blocks.push({
                            id: `block-${blocks.length}`,
                            segments: currentBlockSegments,
                            startIndex: currentBlockStart,
                            endIndex: currentBlockStart + currentBlockLength
                        });
                        currentBlockStart += currentBlockLength;
                        currentBlockSegments = [];
                        currentBlockLength = 0;
                    }
                });

                // Flush remaining
                if (currentBlockSegments.length > 0) {
                    blocks.push({
                        id: `block-${blocks.length}`,
                        segments: currentBlockSegments,
                        startIndex: currentBlockStart,
                        endIndex: currentBlockStart + currentBlockLength
                    });
                }
                setScriptBlocks(blocks);

                // 3. Parse for AI scrolling (word-based)
                const parsedWords = parseHtmlToStyledWords(contentToParse);
                setScriptWords(parsedWords);

                // =====================================================================
                // CREATE CLEAN WORD LIST FOR AI MATCHING
                // =====================================================================
                // This is the SINGLE SOURCE OF TRUTH for AI matching coordinates.
                // - "cleanWords" contains only real words (no newlines)
                // - Each entry knows its character position in the original text
                // - lastMatchIndexRef will ALWAYS be an index into this array
                // =====================================================================
                const cleanWordsArray: { word: string; charStart: number; charEnd: number; scriptWordIndex: number }[] = [];
                parsedWords.forEach((w, idx) => {
                    if (w.word.trim() !== '' && w.word !== '\n') {
                        cleanWordsArray.push({
                            word: w.word,
                            charStart: w.startIndex,
                            charEnd: w.endIndex,
                            scriptWordIndex: idx  // So we can map back for rendering
                        });
                    }
                });
                setCleanWords(cleanWordsArray);

                // 4. Legacy section logic
                const rawContent = (activeScript?.plain_text || contentToParse || '').replace(/<[^>]*>/g, '').trim();
                const lines = rawContent.split('\n');
                const starts: number[] = [0];
                let currentWordTotal = 0;

                for (let i = 0; i < lines.length - 1; i++) {
                    const lineWords = lines[i].trim().split(/\s+/).filter(w => w.length > 0);
                    currentWordTotal += lineWords.length;

                    if (lines[i].trim() === '' && lines[i + 1].trim() !== '') {
                        starts.push(currentWordTotal);
                    }
                }
                const uniqueStarts = Array.from(new Set(starts)).sort((a, b) => a - b);
                setSectionStartIndices(uniqueStarts);

                setMatchedIndex(-1);
                lastMatchIndex.value = 0;
            }
            setIsLoadingScript(false);
        };

        prepareScript();
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

    // =========================================================================
    // AI TRANSCRIPT MATCHING - Main Logic
    // =========================================================================
    // This effect runs whenever the speech recognition (transcript) updates.
    // Its job is to figure out WHERE in the script the user is currently reading.
    //
    // COORDINATE SYSTEM (SIMPLIFIED):
    // - cleanWords: The ONLY array used for matching (no newlines, just real words)
    // - lastMatchIndexRef: Index into cleanWords (NOT scriptWords!)
    // - cleanWords[i].scriptWordIndex: Maps back to scriptWords for rendering
    // - cleanWords[i].charStart/charEnd: For scroll position calculation
    //
    // FLOW:
    // 1. Get transcript from speech recognition
    // 2. Find matching position in cleanWords (using lastMatchIndexRef as starting point)
    // 3. Map back to scriptWords index for green highlighting
    // 4. Use character position for accurate scrolling
    // =========================================================================
    useEffect(() => {
        if (scrollMode === 'auto' && transcript && cleanWords.length > 0) {
            const { findBestMatchIndex } = require('../utils/textAlignment');

            // Get just the word strings for matching
            const wordStrings = cleanWords.map(w => w.word);

            // Run matcher with expanded search (30 words) if user scrolled, else normal (10 words)
            const useExpandedSearch = userDidScroll.value;
            const newCleanIndex = findBestMatchIndex(wordStrings, transcript, lastMatchIndex.value, useExpandedSearch);

            // DEBUG: Log matching info
            console.log(`[AI Match] lastRef=${lastMatchIndex.value}, newIndex=${newCleanIndex}, expanded=${useExpandedSearch}`);

            // SAFETY: Bounds check to prevent crashes
            if (newCleanIndex < 0 || newCleanIndex >= cleanWords.length) {
                console.warn(`[AI Match] Out of bounds: ${newCleanIndex}, max=${cleanWords.length - 1}`);
                return;
            }

            // Guard against large jumps at the start (only if NOT user-scrolled)
            if (!userDidScroll.value) {
                const isInitialPhase = lastMatchIndex.value === 0;
                if (isInitialPhase && newCleanIndex > 15) {
                    console.log(`[AI Match] Blocked: initial phase, jump too large (${newCleanIndex} > 15)`);
                    return;
                }
            }

            // Only advance forward (or stay in place)
            if (newCleanIndex > lastMatchIndex.value) {
                lastMatchIndex.value = newCleanIndex;

                // Reset scroll flag - voice recognition now takes precedence
                if (userDidScroll.value) {
                    userDidScroll.value = false;
                    console.log(`[AI Match] User scroll handled - switching back to voice recognition`);
                }

                // Map to scriptWords index for rendering the green highlight
                const cleanWord = cleanWords[newCleanIndex];
                if (!cleanWord) {
                    console.warn(`[AI Match] cleanWords[${newCleanIndex}] is undefined!`);
                    return;
                }

                const scriptWordIndex = cleanWord.scriptWordIndex;
                console.log(`[AI Match] Advancing to cleanIndex=${newCleanIndex}, word="${cleanWord.word}"`);
                setMatchedIndex(scriptWordIndex);

                // SCROLL CALCULATION: Use visual line-based calculation
                // This properly accounts for newlines and text wrapping
                const layoutConfig = {
                    fontSize: activeScript?.font_size || 3,
                    windowWidth,
                    isLandscape,
                    scriptMargin: activeScript?.margin || 0
                };

                const baseTargetY = estimateScrollY(cleanWord.charStart, scriptPlainText, contentHeight, layoutConfig);
                // Offset by 30% of screen height to position matched text higher on screen
                const targetY = baseTargetY - (containerHeight * 0.3);

                console.log(`[Scroll] targetY=${targetY.toFixed(0)}, currentScrollY=${scrollY.value.toFixed(0)}`);

                scrollY.value = withTiming(targetY, {
                    duration: 500,
                    easing: Easing.out(Easing.quad)
                });
            }
        }
    }, [transcript, scrollMode, contentHeight, scriptPlainText, cleanWords, activeScript, windowWidth, isLandscape]);

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
            if (Platform.OS === 'web') return;
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
            if (Platform.OS === 'web') return;
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
        if (!text.trim()) {
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
        // SAFETY: Cap matches to avoid performance issues with single letters (e.g. 'e')
        while (idx !== -1 && matches.length < 500) {
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
        if (contentHeight > 0) {
            // SCROLL CALCULATION: Use visual line-based calculation
            // This properly accounts for newlines and text wrapping
            const layoutConfig = {
                fontSize: activeScript?.font_size || 3,
                windowWidth,
                isLandscape,
                scriptMargin: activeScript?.margin || 0
            };
            const baseTargetY = estimateScrollY(match.start, scriptPlainText, contentHeight, layoutConfig);
            // Offset by 30% of screen height to position matched text higher on screen
            const targetY = baseTargetY - (containerHeight * 0.3);

            console.log(`[Search Jump] charStart=${match.start}, targetY=${targetY.toFixed(0)}`);

            if (scrollMode === 'auto') {
                // Find the word index so the AI knows where we are
                const wordsBefore = scriptPlainText.slice(0, match.start).split(/\s+/).filter(w => w.length > 0).length;
                lastMatchIndex.value = wordsBefore;
                userDidScroll.value = true; // Trigger expanded search
            }

            scrollY.value = withTiming(targetY, {
                duration: 500,
                easing: Easing.out(Easing.quad)
            });
        }
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

    // --- Web Keyboard & Mouse Listeners ---
    useEffect(() => {
        if (Platform.OS === 'web') {
            const handleWheel = (e: WheelEvent) => {
                // Prevent default scrolling behavior to handle it manually
                e.preventDefault();

                cancelAnimation(scrollY);

                // If in auto mode, mark as user scrolled so it doesn't jump back immediately
                if (scrollMode === 'auto') {
                    userDidScroll.value = true;
                }

                const currentY = scrollY.value;
                const delta = e.deltaY;
                let nextY = currentY - delta;

                // Clamp
                if (nextY > 0) nextY = 0;
                if (nextY < -contentHeight) nextY = -contentHeight;

                scrollY.value = nextY;
            };

            const handleKeyDown = (e: KeyboardEvent) => {
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
                    e.preventDefault();
                    toggleSearch();
                }
            };

            // Using passive: false to allow preventDefault on wheel
            window.addEventListener('wheel', handleWheel, { passive: false });
            window.addEventListener('keydown', handleKeyDown);

            return () => {
                window.removeEventListener('wheel', handleWheel);
                window.removeEventListener('keydown', handleKeyDown);
            };
        }
    }, [contentHeight, scrollMode, toggleSearch]);

    // Handler for pan gesture end - called via runOnJS from worklet
    const handlePanEnd = (currentScrollY: number) => {
        const layoutConfig = {
            fontSize: activeScript?.font_size || 3,
            windowWidth,
            isLandscape,
            scriptMargin: activeScript?.margin || 0
        };
        // Offset by 30% of screen height to find word higher on screen (matching AI scroll behavior)
        const adjustedScrollY = currentScrollY + (containerHeight * 0.3);
        const centerCharPosition = estimateCharFromScrollY(adjustedScrollY, scriptPlainText, contentHeight, layoutConfig);

        // Find the cleanWord at or before this position
        let centerIndex = 0;
        for (let i = 0; i < cleanWords.length; i++) {
            if (cleanWords[i].charStart <= centerCharPosition) {
                centerIndex = i;
            } else {
                break;
            }
        }

        console.log(`[Pan] scrollY=${currentScrollY.toFixed(0)}, centerCharPos=${centerCharPosition}`);
        console.log(`[Pan] Center word: index=${centerIndex}, word="${cleanWords[centerIndex]?.word}"`);

        userDidScroll.value = true;
        lastMatchIndex.value = centerIndex;
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
                // The pan gesture is a worklet - we need to use runOnJS for complex calculations
                runOnJS(handlePanEnd)(scrollY.value);
            } else if (isPlaying) {
                // For Fixed/WPM, resume scrolling from new position
                runOnJS(startAutoScroll)();
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
            setMatchedIndex(-1);
            lastMatchIndex.value = 0;
        }
        setIsPlaying(false);
        scrollY.value = withTiming(0, { duration: 500 });
    };

    const handleForward = () => {
        if (scrollMode !== 'auto') {
            setScrollMode('fixed');
        } else {
            // Use cleanWords index (last word)
            const finalCleanIndex = cleanWords.length - 1;
            lastMatchIndex.value = finalCleanIndex;
            // Map to scriptWords for rendering
            if (cleanWords[finalCleanIndex]) {
                setMatchedIndex(cleanWords[finalCleanIndex].scriptWordIndex);
            }
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
        try {
            console.log('[Prompter] toggleRecording called. isRecording:', isRecording);
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
                console.log('[Prompter] toggleRecording failed: No activeDevice found.');
                const msg = i18n.t('cameraNotFound');
                if (Platform.OS === 'web') window.alert(msg);
                else Alert.alert(i18n.t('error'), msg);
                return;
            }

            if (isCallActive && Platform.OS !== 'web') {
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

            // Skipped media permission check on web (patched previously), restored for Native:
            if (Platform.OS !== 'web' && !mediaPermission?.granted) {
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

            console.log('[Prompter] Starting recording... cameraRef exists?', !!cameraRef.current);
            if (!cameraRef.current) {
                console.error('[Prompter] cameraRef.current is null! Cannot start recording.');
                const msg = 'Internal Error: Camera reference missing. Refresh the page?';
                if (Platform.OS === 'web') window.alert(msg);
                else Alert.alert(i18n.t('error'), msg);
                return;
            }

            setIsRecording(true);
            try {
                cameraRef.current?.startRecording({
                    onRecordingFinished: (video) => {
                        console.log('[Prompter] onRecordingFinished', video);
                        if (Platform.OS === 'web') {
                            // Web download logic with File System Access API support
                            const saveRecording = async () => {
                                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                                const filename = `telecue-recording-${timestamp}.mp4`;

                                try {
                                    // Try modern File System Access API
                                    // @ts-ignore - showSaveFilePicker is not yet in standard lib
                                    if (typeof window.showSaveFilePicker === 'function') {
                                        const handle = await (window as any).showSaveFilePicker({
                                            suggestedName: filename,
                                            types: [{
                                                description: 'Video File',
                                                accept: { 'video/mp4': ['.mp4', '.webm'] },
                                            }],
                                        });

                                        // Fetch the blob from the blob URL
                                        const response = await fetch(video.path);
                                        const blob = await response.blob();

                                        const writable = await handle.createWritable();
                                        await writable.write(blob);
                                        await writable.close();
                                        window.alert("Recording saved successfully.");
                                        return;
                                    }
                                } catch (err: any) {
                                    if (err.name === 'AbortError') {
                                        // User cancelled the picker
                                        return;
                                    }
                                    console.warn("File System Access API failed, falling back to download:", err);
                                }

                                // Fallback to classic download
                                const a = document.createElement('a');
                                a.href = video.path;
                                a.download = filename;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                            };

                            saveRecording();
                        } else {
                            // Native save logic
                            MediaLibrary.saveToLibraryAsync(video.path);
                            Alert.alert(i18n.t('saved'), i18n.t('videoSaved'));
                        }
                    },
                    onRecordingError: (error) => {
                        console.error("[Prompter] Recording error callback:", error);
                        const msg = i18n.t('recordingFailed') + ": " + error.message;
                        if (Platform.OS === 'web') window.alert(msg);
                        else Alert.alert(i18n.t('error'), msg);
                        setIsRecording(false);
                    }
                });
            } catch (error: any) {
                console.error("[Prompter] Start recording synchronous error:", error);
                const msg = i18n.t('startRecordingFailed') + ": " + (error?.message || 'Unknown');
                if (Platform.OS === 'web') window.alert(msg);
                else Alert.alert(i18n.t('error'), msg);
                setIsRecording(false);
            }
        } catch (e: any) {
            console.error("[Prompter] CRITICAL toggleRecording error:", e);
            if (Platform.OS === 'web') window.alert("Critical Error: " + e.message);
        }
    };

    // --- Memoized Camera View to prevent flashing on state updates ---
    const cameraLayer = useMemo(() => {
        if (activeScript?.mode === 'phone' && activeDevice) {
            return (
                <View style={StyleSheet.absoluteFill}>
                    <CameraView
                        ref={cameraRef}
                        style={StyleSheet.absoluteFill}
                        device={activeDevice}
                        isActive={isCameraActive}
                        video={true}
                        audio={hasMicPermission}
                    />
                    {/* Dark Overlay for readability */}
                    <View className="absolute inset-0 bg-black/40 z-1" />
                </View>
            );
        }
        return null;
    }, [activeScript?.mode, activeDevice, isCameraActive, hasMicPermission]);

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

    if (Platform.OS !== 'web' && (!hasCamPermission || !hasMicPermission)) return <View className="bg-black flex-1" />;

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

    // --- Loading Screen ---
    if (isLoadingScript) {
        return (
            <View className="flex-1 bg-black items-center justify-center space-y-4">
                <ActivityIndicator size="large" color="#ea580c" />
                <Text className="text-white text-lg font-medium">{i18n.t('preparingScript') || "Preparing Script..."}</Text>
            </View>
        );
    }

    return (
        <GestureHandlerRootView className="flex-1">
            <View
                className="flex-1 bg-black relative"
                onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
            >
                {/* 1. Camera Layer (Background) */}
                {cameraLayer}

                {/* Fallback if no device */}
                {activeScript?.mode === 'phone' && !activeDevice && (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' }]}>
                        <Text className="text-white">{i18n.t('cameraUnavailable')}</Text>
                    </View>
                )}

                {/* Top Left Back Button */}
                <View style={{ zIndex: 9999 }} className={`absolute ${isLandscape ? "top-6 left-10" : "top-20 left-6"} flex-row gap-4`}>
                    <TouchableOpacity
                        className={`bg-black/60 ${isLandscape ? "p-2 px-3" : "p-3 px-5"} z-50 rounded-full border border-white/20 ${Platform.OS === 'web' ? "" : "blur-md"} flex-row items-center gap-2`}
                        onPress={handleBack}
                    >
                        <ChevronLeft color="white" size={20} />
                        <Text className="text-white font-bold">{i18n.t('back')}</Text>
                    </TouchableOpacity>
                </View>

                {/* Top Right Search Button */}
                <View style={{ zIndex: 9999 }} className={`absolute ${isLandscape ? "top-6 right-10" : "top-20 right-6"} z-50 flex-row gap-4`}>
                    {isSearchActive ? (
                        <View className={`flex-row items-center bg-black/60 border border-white/20 px-4 h-12 rounded-full ${Platform.OS === 'web' ? "" : "blur-md"} shadow-2xl min-w-[220px] z-50`}>
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
                            className={`bg-black/60 ${isLandscape ? "p-3" : "p-4"} rounded-full border border-white/20 ${Platform.OS === 'web' ? "" : "blur-md"} items-center justify-center`}
                            onPress={toggleSearch}
                        >
                            <Search color="white" size={20} />
                        </TouchableOpacity>
                    )}
                </View >

                {/* Debug Transcript Overlay (Temporary for Phase 2) */}
                {/* {
                    isListening && (
                        <View className="absolute top-24 left-6 right-6 bg-black/50 p-2 rounded z-40 pointer-events-none">
                            <Text className="text-yellow-400 text-xs font-mono">{i18n.t('listening')}: {transcript}</Text>
                            {voiceError && <Text className="text-red-500 text-xs">{i18n.t('error')}: {voiceError.message}</Text>}
                        </View>
                    )
                } */}

                {/* Script Container */}
                <View className="absolute inset-x-0 top-0 bottom-0">
                    <GestureDetector gesture={panGesture}>
                        <ScrollView
                            scrollEnabled={false}
                            showsVerticalScrollIndicator={false}
                            style={{
                                flex: 1,
                                backgroundColor: activeScript?.mode === 'phone' ? 'rgba(0,0,0,0.5)' : 'black',
                                paddingHorizontal: Platform.OS === 'web' ? Math.max(24, (windowWidth - 800) / 2) : (isLandscape ? 60 : 24),
                                zIndex: 1, // Ensure this is lower than top controls (z-50)
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
                                    {scriptBlocks.length === 0 ? (
                                        <Text className="text-white font-bold text-center" style={{ fontSize: (activeScript?.font_size || 3) * 8 + 16 }}>
                                            {activeScript?.plain_text || i18n.t('noScriptContent')}
                                        </Text>
                                    ) : (
                                        // Render chunks separately to avoid texture limits
                                        scriptBlocks.map((block) => {
                                            // Calculate global offsets for this block
                                            const blockStart = block.startIndex;
                                            const blockEnd = block.endIndex;

                                            // Determine highlights relevant to this block
                                            const relevantHighlights: { start: number; end: number; isActive: boolean }[] = [];
                                            if (searchQuery && allMatches.length > 0) {
                                                allMatches.forEach((match, idx) => {
                                                    const matchStart = match.start;
                                                    const matchEnd = match.start + match.length;
                                                    // Check overlap
                                                    if (matchEnd > blockStart && matchStart < blockEnd) {
                                                        // Clip to block boundaries
                                                        relevantHighlights.push({
                                                            start: Math.max(matchStart, blockStart),
                                                            end: Math.min(matchEnd, blockEnd),
                                                            isActive: idx === matchCursor
                                                        });
                                                    }
                                                });
                                            }

                                            // Determine AI Highlight position relative to this block
                                            // matches are now explicitly mapped to global char indices via scriptWords
                                            let aiMatchedPosLimit = -1;
                                            if (matchedIndex >= 0 && matchedIndex < scriptWords.length) {
                                                aiMatchedPosLimit = scriptWords[matchedIndex].endIndex;
                                            }

                                            const blockFontSize = (activeScript?.font_size || 3) * 8 + 16;

                                            return (
                                                <Text
                                                    key={block.id}
                                                    className="text-white font-bold text-center"
                                                    style={{ fontSize: blockFontSize }}
                                                >
                                                    {block.segments.map((segment, segIdx) => {
                                                        const globalSegStart = blockStart + (segment.startIndex - block.segments[0].startIndex);
                                                        // Wait, segments have global start indices already from the parser?
                                                        // No, parser returns 0-based index relative to the passed string.
                                                        // We passed the ONE big string to parser first, then sliced segments.
                                                        // So segment.startIndex IS global.

                                                        const { text, style: baseStyle, startIndex, endIndex } = segment;

                                                        // Check search highlights overlap
                                                        const overlappingHighlights = relevantHighlights.filter(
                                                            h => h.start < endIndex && h.end > startIndex
                                                        );

                                                        // Check AI match overlap
                                                        // If the segment is fully before the limit, it's matched.
                                                        // If it's partially before, we need to split.
                                                        const isFullyMatchedByAI = aiMatchedPosLimit >= endIndex;
                                                        const isPartiallyMatchedByAI = aiMatchedPosLimit > startIndex && aiMatchedPosLimit < endIndex;

                                                        if (overlappingHighlights.length === 0 && isFullyMatchedByAI) {
                                                            return (
                                                                <Text
                                                                    key={segIdx}
                                                                    style={[
                                                                        baseStyle,
                                                                        { color: '#4ade80' }
                                                                    ]}
                                                                >
                                                                    {text}
                                                                </Text>
                                                            );
                                                        }

                                                        if (overlappingHighlights.length === 0 && !isPartiallyMatchedByAI && !isFullyMatchedByAI) {
                                                            return (
                                                                <Text
                                                                    key={segIdx}
                                                                    style={baseStyle}
                                                                >
                                                                    {text}
                                                                </Text>
                                                            );
                                                        }

                                                        // Handle text splitting for search highlights
                                                        const parts: { text: string; highlight: boolean; isActive: boolean; charStart: number }[] = [];

                                                        const boundaries = new Set<number>();
                                                        boundaries.add(startIndex);
                                                        boundaries.add(endIndex);
                                                        if (isPartiallyMatchedByAI) boundaries.add(aiMatchedPosLimit);
                                                        overlappingHighlights.forEach(h => {
                                                            if (h.start > startIndex && h.start < endIndex) boundaries.add(h.start);
                                                            if (h.end > startIndex && h.end < endIndex) boundaries.add(h.end);
                                                        });
                                                        const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

                                                        for (let i = 0; i < sortedBoundaries.length - 1; i++) {
                                                            const partStart = sortedBoundaries[i];
                                                            const partEnd = sortedBoundaries[i + 1];
                                                            const partText = text.slice(partStart - startIndex, partEnd - startIndex);

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
                                                                    const partIsAIMatched = aiMatchedPosLimit >= part.charStart + part.text.length; // Fully covered part
                                                                    // Or checked if part start < limit (if boundaries are constructed correctly, part should be either fully before or after limit)
                                                                    // Since we added limit to boundaries, parts are split exactly at limit.
                                                                    // So simple check: start < limit
                                                                    const isPartMatched = aiMatchedPosLimit > part.charStart;
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
                                                    })}
                                                </Text>
                                            );
                                        })
                                    )}
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
                        left: Platform.OS === 'web' ? Math.max(24, (windowWidth - 600) / 2) : (isLandscape ? 120 : 24),
                        right: Platform.OS === 'web' ? Math.max(24, (windowWidth - 600) / 2) : (isLandscape ? 120 : 24),
                        zIndex: 100, // Ensure this is definitely on top
                    }}
                >
                    {activeScript?.mode === 'phone' && Platform.OS !== 'web' && !isRecording && (
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
                                    onPress={() => handleModeChange(mode)}
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
                            {(activeScript?.mode === 'phone') && (
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

                {/* Invite Code Modal */}
                <Modal
                    visible={showInviteModal}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowInviteModal(false)}
                >
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        className="flex-1 items-center justify-center bg-black/80"
                    >
                        <View className="bg-zinc-900 p-6 rounded-2xl w-[80%] max-w-sm border border-white/10">
                            <Text className="text-white text-xl font-bold mb-2 text-center">Enter Invite Code</Text>
                            <Text className="text-zinc-400 text-sm mb-6 text-center">
                                This feature is currently in early access. Please enter your invite code to continue.
                            </Text>

                            <TextInput
                                className="bg-zinc-800 text-white p-4 rounded-xl mb-6 border border-white/10"
                                placeholder="Enter code"
                                placeholderTextColor="#71717a"
                                value={inviteCodeInput}
                                onChangeText={setInviteCodeInput}
                                autoCapitalize="characters"
                                autoCorrect={false}
                            />

                            <View className="flex-row gap-3">
                                <TouchableOpacity
                                    className="flex-1 bg-zinc-800 p-3 rounded-xl items-center"
                                    onPress={() => setShowInviteModal(false)}
                                >
                                    <Text className="text-white font-bold">Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    className="flex-1 bg-blue-600 p-3 rounded-xl items-center"
                                    onPress={verifyInviteCode}
                                >
                                    <Text className="text-white font-bold">Submit</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>
            </View >
        </GestureHandlerRootView >
    );
}
