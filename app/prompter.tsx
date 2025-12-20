import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Dimensions, Platform, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useScriptStore } from '../src/store/useScriptStore';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    cancelAnimation,
    runOnJS,
    useDerivedValue
} from 'react-native-reanimated';
import { AlertCircle, Play, Pause, RotateCcw, FastForward, Rewind, Check, ChevronLeft } from 'lucide-react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Teleprompter() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { activeScript } = useScriptStore();
    const [permission, requestPermission] = useCameraPermissions();

    // Playback State
    const [isPlaying, setIsPlaying] = useState(false);
    const [contentHeight, setContentHeight] = useState(0);
    const [containerHeight, setContainerHeight] = useState(Dimensions.get('window').height);
    const [speed, setSpeed] = useState(activeScript?.speed || 3);

    // Animation Values
    const scrollY = useSharedValue(0);

    // Progress Bar Logic
    const progressStyle = useAnimatedStyle(() => {
        const totalHeight = contentHeight > 0 ? contentHeight + containerHeight : 1;
        const currentScroll = -scrollY.value;
        const progress = Math.min(Math.max(currentScroll / (contentHeight || 1), 0), 1);
        return {
            width: `${progress * 100}%`
        };
    });

    useEffect(() => {
        const setupOrientation = async () => {
            // Unlocking first ensures we break any previous lock
            await ScreenOrientation.unlockAsync();

            if (activeScript?.mode === 'phone') {
                // Explicitly force Portrait
                await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
            } else {
                // Explicitly force Landscape
                await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            }
        };
        setupOrientation();

        const setupBrightness = async () => {
            const { status } = await Brightness.requestPermissionsAsync();
            if (status === 'granted') {
                await Brightness.setBrightnessAsync(1);
            }
        };
        setupBrightness();

        return () => {
            ScreenOrientation.unlockAsync();
        };
    }, [activeScript?.mode]);

    // Scrolling Logic
    useEffect(() => {
        if (isPlaying && contentHeight > 0) {
            const currentY = scrollY.value;
            // Target: Scroll untill content is fully off screen
            const targetY = -(contentHeight + containerHeight / 2);
            const distance = Math.abs(targetY - currentY);

            // Speed calculation
            const pixelsPerSecond = speed * 30;
            const duration = (distance / pixelsPerSecond) * 1000;

            scrollY.value = withTiming(targetY, {
                duration: duration > 0 ? duration : 0,
                easing: Easing.linear,
            });
        } else {
            cancelAnimation(scrollY);
        }
    }, [isPlaying, speed, contentHeight]);

    const handleRewind = () => {
        setIsPlaying(false);
        scrollY.value = withTiming(0, { duration: 500 });
    };

    const handleForward = () => {
        setIsPlaying(false);
        const target = -(contentHeight - containerHeight / 2);
        scrollY.value = withTiming(target, { duration: 500 });
    };

    const animatedTextStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: scrollY.value },
            { scaleX: activeScript?.is_mirrored_h ? -1 : 1 },
            { scaleY: activeScript?.is_mirrored_v ? -1 : 1 },
        ],
    }));

    if (!permission) return <View className="bg-black flex-1" />;
    if (!permission.granted && activeScript?.mode === 'phone') {
        return (
            <View className="flex-1 bg-black items-center justify-center p-6">
                <Text className="text-white text-center mb-6 text-lg">We need your permission to show the camera for Phone Recording mode.</Text>
                <TouchableOpacity className="bg-blue-600 p-4 rounded-xl" onPress={requestPermission}>
                    <Text className="text-white font-bold">Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View
            className="flex-1 bg-black relative"
            onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
        >
            {activeScript?.mode === 'phone' && (
                <CameraView className="absolute inset-0" facing="front" />
            )}

            {/* Top Left Back Button */}
            <TouchableOpacity
                className="absolute top-12 left-6 z-50 bg-black/60 p-3 px-5 rounded-full border border-white/20 blur-md flex-row items-center gap-2"
                onPress={() => router.back()}
            >
                <ChevronLeft color="white" size={20} />
                <Text className="text-white font-bold">Back</Text>
            </TouchableOpacity>

            {/* Script Container */}
            {/* The fix for text truncation: use a ScrollView that is non-interactive to allow proper content styling/measurement
                Wait, Animated.View inside ScrollView can be tricky. 
                Better: Ensure the internal Text component has no height limits. 
                We use a plain View container for layout measurement. 
            */}
            <View
                className="absolute inset-x-0 top-0 bottom-0 justify-center flex-row overflow-hidden"
                style={{
                    // Padding is handled by the View below, but margin is horizontal padding for text
                    backgroundColor: activeScript?.mode === 'phone' ? 'rgba(0,0,0,0.3)' : 'black'
                }}
            >
                <Animated.View style={[animatedTextStyle, { width: '100%', alignItems: 'center', paddingHorizontal: activeScript?.margin || 20 }]}>
                    {/* Padding top to start text in middle */}
                    <View style={{ height: containerHeight / 2 }} />

                    {/* Measurement Wrapper */}
                    <View
                        onLayout={(e) => {
                            // Only update if height is significantly different to act as a layout fix
                            // This ensures we capture the full height of the text block
                            if (Math.abs(contentHeight - e.nativeEvent.layout.height) > 10) {
                                setContentHeight(e.nativeEvent.layout.height);
                            }
                        }}
                        style={{ width: '100%' }} // Ensure it takes full width
                    >
                        <Text
                            className="text-white font-bold text-center"
                            style={{
                                fontSize: (activeScript?.font_size || 3) * 8 + 16,
                                // Remove any height constraints
                            }}
                        >
                            {activeScript?.content || "No script content provided."}
                        </Text>
                    </View>

                    {/* Extra padding at bottom */}
                    <View style={{ height: containerHeight }} />
                </Animated.View>
            </View>

            {/* Floating Control Bar */}
            <View className="absolute bottom-10 left-4 right-4 bg-black/80 rounded-3xl border border-white/10 p-5 z-50 shadow-2xl">
                {/* Speed Slider */}
                <View className="flex-row items-center justify-between mb-4">
                    <View><Text className="text-white text-xs font-bold">SLOW</Text></View>
                    <View className="flex-1 mx-4">
                        <Slider
                            style={{ width: '100%', height: 40 }}
                            minimumValue={1}
                            maximumValue={10}
                            step={0.5}
                            value={speed}
                            onValueChange={setSpeed}
                            minimumTrackTintColor="#f97316"
                            maximumTrackTintColor="#52525b"
                            thumbTintColor="#f97316"
                        />
                    </View>
                    <View><Text className="text-white text-xs font-bold">FAST</Text></View>
                </View>

                {/* Progress Bar */}
                <View className="h-1 bg-zinc-700 w-full mb-6 rounded-full overflow-hidden">
                    <Animated.View className="h-full bg-orange-500" style={progressStyle} />
                </View>

                {/* Bottom Row: Controls + Done Button */}
                <View className="flex-row justify-between items-center">
                    {/* spacer to center the media controls */}
                    <View style={{ width: 40 }} />

                    {/* Media Controls */}
                    <View className="flex-row items-center gap-8">
                        <TouchableOpacity onPress={handleRewind}>
                            <Rewind color="white" size={32} fill="white" />
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setIsPlaying(!isPlaying)}>
                            {isPlaying ? (
                                <Pause color="white" size={48} fill="white" />
                            ) : (
                                <Play color="white" size={48} fill="white" />
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={handleForward}>
                            <FastForward color="white" size={32} fill="white" />
                        </TouchableOpacity>
                    </View>

                    {/* Done Button (Bottom Right) */}
                    <TouchableOpacity
                        onPress={() => router.navigate('/')} // Go to Home
                        className="bg-zinc-800 p-2 rounded-full"
                    >
                        <Check color="white" size={24} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}
