import { View, Text, TouchableOpacity, ScrollView, Switch, Dimensions, useWindowDimensions, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { useScriptStore } from '../store/useScriptStore';
import { Monitor, Smartphone, Type, MoveHorizontal, Gauge } from 'lucide-react-native';

import Slider from '@react-native-community/slider';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS, type SharedValue } from 'react-native-reanimated';
import { useEffect, useMemo } from 'react';

import { parseHtmlToStyledSegments, StyledSegment } from '../utils/htmlParser';
import i18n from '../utils/i18n';

const Handle = ({ side, margin, onDragEnd }: { side: 'left' | 'right', margin: SharedValue<number>, onDragEnd: (val: number) => void }) => {
    const context = useSharedValue({ startMargin: 0 });

    const pan = Gesture.Pan()
        .onStart(() => {
            context.value = { startMargin: margin.value };
        })
        .onUpdate((e) => {
            let newMargin;
            if (side === 'left') {
                newMargin = context.value.startMargin + e.translationX;
            } else {
                newMargin = context.value.startMargin - e.translationX;
            }
            // Clamp margin (0 to ~120px)
            margin.value = Math.max(0, Math.min(newMargin, 120));
        })
        .onEnd(() => {
            runOnJS(onDragEnd)(margin.value);
        });

    const animatedStyle = useAnimatedStyle(() => {
        return {
            [side]: margin.value - 15, // Center the 30px touch area
        };
    });

    return (
        <GestureDetector gesture={pan}>
            <Animated.View
                style={[
                    { position: 'absolute', top: 0, bottom: 0, width: 30, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
                    animatedStyle
                ]}
            >
                <View className="w-1 h-full bg-orange-500 shadow-sm" />
                <View className="absolute w-6 h-6 bg-orange-500 rounded-full opacity-50" />
            </Animated.View>
        </GestureDetector>
    );
};

const DraggableMarginPreview = ({ activeScript, updateSettings }: { activeScript: any, updateSettings: any }) => {
    const margin = useSharedValue(activeScript.margin);
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';

    useEffect(() => {
        margin.value = activeScript.margin;
    }, [activeScript.margin]);

    const updateStore = (val: number) => {
        updateSettings({ margin: Math.round(val) });
    };

    const contentStyle = useAnimatedStyle(() => {
        return {
            paddingHorizontal: margin.value,
        };
    });

    // Separate static mirroring transform (not animated)
    const mirrorTransform = {
        transform: [
            { scaleX: activeScript.is_mirrored_h ? -1 : 1 },
            { scaleY: activeScript.is_mirrored_v ? -1 : 1 }
        ]
    };

    const fontSizePx = (activeScript.font_size || 3) * 8 + 16;

    // Use the same parser as the prompter
    const previewSegments = useMemo(() => {
        const contentToParse = activeScript?.html_content || activeScript?.content;
        if (!contentToParse) return [];
        const { segments } = parseHtmlToStyledSegments(contentToParse);

        // Truncate to ~500 chars for preview to avoid texture limits
        let charCount = 0;
        const truncatedSegments = [];
        for (const seg of segments) {
            if (charCount > 500) break;
            truncatedSegments.push(seg);
            charCount += seg.text.length;
        }
        return truncatedSegments;
    }, [activeScript?.html_content, activeScript?.content]);

    if (!activeScript) return null;

    return (
        <View className="h-64 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 mb-8 relative rounded-xl">
            <Text className="text-zinc-400 dark:text-zinc-500 text-xs absolute top-2 left-0 right-0 text-center uppercase tracking-widest z-10">{i18n.t('previewDrag')}</Text>

            <Animated.View
                className="flex-1 bg-black"
                style={[contentStyle, mirrorTransform, { width: '100%', height: '100%', backgroundColor: 'black' }]}
            >
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 40 }}
                >
                    <Text
                        className="text-white font-bold text-center"
                        style={{ fontSize: fontSizePx }}
                    >
                        {previewSegments.length > 0 ? (
                            previewSegments.map((segment: StyledSegment, idx: number) => (
                                <Text
                                    key={idx}
                                    style={[
                                        segment.style,
                                        { color: segment.style.color || 'white' }
                                    ]}
                                >
                                    {segment.text}
                                </Text>
                            ))
                        ) : (
                            i18n.t('startWriting')
                        )}
                    </Text>
                </ScrollView>
            </Animated.View>

            <Handle side="left" margin={margin} onDragEnd={updateStore} />
            <Handle side="right" margin={margin} onDragEnd={updateStore} />
        </View>
    );
};

export default function Setup() {
    const router = useRouter();
    const { width, height } = useWindowDimensions();
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    const isLandscape = width > height;
    const { activeScript, updateActiveScriptSettings } = useScriptStore();

    if (!activeScript) {
        return (
            <View className="flex-1 bg-white dark:bg-black items-center justify-center p-6">
                <Text className="text-black dark:text-white text-center mb-6 text-lg">{i18n.t('noScriptSelected')}</Text>
                <TouchableOpacity className="bg-blue-600 p-4 rounded-xl" onPress={() => router.replace('/')}>
                    <Text className="text-white font-bold">{i18n.t('goBack')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ScrollView className="flex-1 bg-white dark:bg-black">
                <View
                    className="p-6 pb-20"
                    style={{ paddingHorizontal: isLandscape ? 60 : 24 }}
                >
                    {/* Visual Preview with edge indicators */}
                    <DraggableMarginPreview activeScript={activeScript} updateSettings={updateActiveScriptSettings} />

                    {/* Mode Select */}
                    <Text className="text-zinc-600 dark:text-zinc-400 font-bold mb-4 uppercase tracking-wider text-xs">{i18n.t('teleprompterMode')}</Text>
                    <View className="flex-row gap-4 mb-8">
                        <TouchableOpacity
                            className={`flex-1 p-4 rounded-2xl border-2 ${activeScript.mode === 'phone' ? 'border-blue-600 bg-blue-600/10' : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900'}`}
                            onPress={() => updateActiveScriptSettings({ mode: 'phone' })}
                        >
                            <Smartphone color={activeScript.mode === 'phone' ? '#2563eb' : (isDarkMode ? '#71717a' : '#a1a1aa')} size={24} />
                            <Text className={`mt-2 font-semibold ${activeScript.mode === 'phone' ? (isDarkMode ? 'text-white' : 'text-blue-600') : (isDarkMode ? 'text-zinc-400' : 'text-zinc-500')}`}>{i18n.t('phoneRecord')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className={`flex-1 p-4 rounded-2xl border-2 ${activeScript.mode === 'rig' ? 'border-blue-600 bg-blue-600/10' : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900'}`}
                            onPress={() => updateActiveScriptSettings({ mode: 'rig' })}
                        >
                            <Monitor color={activeScript.mode === 'rig' ? '#2563eb' : (isDarkMode ? '#71717a' : '#a1a1aa')} size={24} />
                            <Text className={`mt-2 font-semibold ${activeScript.mode === 'rig' ? (isDarkMode ? 'text-white' : 'text-blue-600') : (isDarkMode ? 'text-zinc-400' : 'text-zinc-500')}`}>{i18n.t('teleprompterRig')}</Text>
                        </TouchableOpacity>
                    </View>

                    <Text className="text-zinc-600 dark:text-zinc-400 font-bold mb-4 uppercase tracking-wider text-xs">{i18n.t('displayConfig')}</Text>

                    <View className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-6 gap-8 border border-zinc-100 dark:border-zinc-800">

                        {/* Sliders */}
                        <View>
                            <View className="flex-row items-center gap-3 mb-2">
                                <Type color={isDarkMode ? "#71717a" : "#a1a1aa"} size={20} />
                                <Text className="text-black dark:text-white text-lg">{i18n.t('fontSize')}: {activeScript.font_size}</Text>
                            </View>
                            <Slider
                                style={{ width: '100%', height: 40 }}
                                minimumValue={1}
                                maximumValue={10}
                                step={1}
                                value={activeScript.font_size}
                                onValueChange={(val) => updateActiveScriptSettings({ font_size: val })}
                                minimumTrackTintColor="#2563eb"
                                maximumTrackTintColor={isDarkMode ? "#3f3f46" : "#e4e4e7"}
                                thumbTintColor={isDarkMode ? "#ffffff" : "#2563eb"}
                            />
                        </View>

                        {/* Mirroring */}
                        <View className="gap-6">
                            <View className="flex-row items-center justify-between">
                                <View className="flex-row items-center gap-3">
                                    <MoveHorizontal color={isDarkMode ? "#71717a" : "#a1a1aa"} size={20} />
                                    <Text className="text-black dark:text-white text-lg">{i18n.t('mirrorHorizontal')}</Text>
                                </View>
                                <Switch
                                    value={activeScript.is_mirrored_h}
                                    onValueChange={(val) => updateActiveScriptSettings({ is_mirrored_h: val })}
                                    trackColor={{ false: isDarkMode ? '#3f3f46' : '#e4e4e7', true: '#2563eb' }}
                                />
                            </View>
                            <View className="flex-row items-center justify-between">
                                <View className="flex-row items-center gap-3">
                                    <MoveHorizontal color={isDarkMode ? "#71717a" : "#a1a1aa"} size={20} className="rotate-90" />
                                    <Text className="text-black dark:text-white text-lg">{i18n.t('mirrorVertical')}</Text>
                                </View>
                                <Switch
                                    value={activeScript.is_mirrored_v}
                                    onValueChange={(val) => updateActiveScriptSettings({ is_mirrored_v: val })}
                                    trackColor={{ false: isDarkMode ? '#3f3f46' : '#e4e4e7', true: '#2563eb' }}
                                />
                            </View>
                        </View>

                    </View>

                    <TouchableOpacity
                        className="bg-green-600 p-5 rounded-2xl items-center shadow-lg mt-8 mb-10"
                        onPress={() => router.push('/prompter')}
                    >
                        <Text className="text-white text-xl font-bold">{i18n.t('startTeleprompter')}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </GestureHandlerRootView>
    );
}