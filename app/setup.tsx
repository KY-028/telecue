import { View, Text, TouchableOpacity, ScrollView, Switch, Dimensions, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useScriptStore } from '../store/useScriptStore';
import { Monitor, Smartphone, Type, MoveHorizontal, Gauge } from 'lucide-react-native';

import Slider from '@react-native-community/slider';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS, type SharedValue } from 'react-native-reanimated';
import { useEffect, useMemo } from 'react';

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

    useEffect(() => {
        margin.value = activeScript.margin;
    }, [activeScript.margin]);

    const updateStore = (val: number) => {
        updateSettings({ margin: Math.round(val) });
    };

    const contentStyle = useAnimatedStyle(() => {
        return {
            paddingHorizontal: margin.value,
            transform: [
                { scaleX: activeScript.is_mirrored_h ? -1 : 1 },
                { scaleY: activeScript.is_mirrored_v ? -1 : 1 }
            ]
        };
    });

    const fontSizePx = (activeScript.font_size || 3) * 8 + 16;

    if (!activeScript) return null;

    return (
        <View className="h-64 bg-zinc-900 border border-zinc-800 mb-8 relative rounded-xl">
            <Text className="text-zinc-500 text-xs absolute top-2 left-0 right-0 text-center uppercase tracking-widest z-10">Preview (Drag Edges)</Text>

            <Animated.View
                className="flex-1 bg-black"
                style={[contentStyle, { width: '100%' }]}
            >
                {/* Top spacer */}
                <View style={{ height: 20 }} />

                <View style={{ width: '100%' }}>
                    <Text
                        className="text-white font-bold text-center"
                        style={{ fontSize: fontSizePx, backgroundColor: 'rgba(255,0,0,0.3)' }}

                    >
                        {activeScript?.content || "Your script content will appear here..."}
                    </Text>
                </View>

            </Animated.View>

            <Handle side="left" margin={margin} onDragEnd={updateStore} />
            <Handle side="right" margin={margin} onDragEnd={updateStore} />
        </View>
    );
};

export default function Setup() {
    const router = useRouter();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;
    const { activeScript, updateActiveScriptSettings } = useScriptStore();

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

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ScrollView className="flex-1 bg-black">
                <View
                    className="p-6 pb-20"
                    style={{ paddingHorizontal: isLandscape ? 60 : 24 }}
                >
                    {/* Visual Preview with edge indicators */}
                    <DraggableMarginPreview activeScript={activeScript} updateSettings={updateActiveScriptSettings} />

                    {/* Mode Select */}
                    <Text className="text-zinc-500 font-bold mb-4 uppercase tracking-wider text-xs">Teleprompter Mode</Text>
                    <View className="flex-row gap-4 mb-8">
                        <TouchableOpacity
                            className={`flex-1 p-4 rounded-2xl border-2 ${activeScript.mode === 'phone' ? 'border-blue-600 bg-blue-600/10' : 'border-zinc-800 bg-zinc-900'}`}
                            onPress={() => updateActiveScriptSettings({ mode: 'phone' })}
                        >
                            <Smartphone color={activeScript.mode === 'phone' ? '#2563eb' : '#71717a'} size={24} />
                            <Text className={`mt-2 font-semibold ${activeScript.mode === 'phone' ? 'text-white' : 'text-zinc-400'}`}>Phone Record</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className={`flex-1 p-4 rounded-2xl border-2 ${activeScript.mode === 'rig' ? 'border-blue-600 bg-blue-600/10' : 'border-zinc-800 bg-zinc-900'}`}
                            onPress={() => updateActiveScriptSettings({ mode: 'rig' })}
                        >
                            <Monitor color={activeScript.mode === 'rig' ? '#2563eb' : '#71717a'} size={24} />
                            <Text className={`mt-2 font-semibold ${activeScript.mode === 'rig' ? 'text-white' : 'text-zinc-400'}`}>Teleprompter Rig</Text>
                        </TouchableOpacity>
                    </View>

                    <Text className="text-zinc-500 font-bold mb-4 uppercase tracking-wider text-xs">Display Configuration</Text>

                    <View className="bg-zinc-900 rounded-3xl p-6 gap-8">

                        {/* Sliders */}
                        <View>
                            <View className="flex-row items-center gap-3 mb-2">
                                <Type color="#71717a" size={20} />
                                <Text className="text-white text-lg">Font Size: {activeScript.font_size}</Text>
                            </View>
                            <Slider
                                style={{ width: '100%', height: 40 }}
                                minimumValue={1}
                                maximumValue={10}
                                step={1}
                                value={activeScript.font_size}
                                onValueChange={(val) => updateActiveScriptSettings({ font_size: val })}
                                minimumTrackTintColor="#2563eb"
                                maximumTrackTintColor="#3f3f46"
                                thumbTintColor="#ffffff"
                            />
                        </View>

                        {/* <View>
                            <View className="flex-row items-center gap-3 mb-2">
                                <Gauge color="#71717a" size={20} />
                                <Text className="text-white text-lg">Scroll Speed: {activeScript.speed}</Text>
                            </View>
                            <Slider
                                style={{ width: '100%', height: 40 }}
                                minimumValue={1}
                                maximumValue={10}
                                step={1}
                                value={activeScript.speed}
                                onValueChange={(val) => updateActiveScriptSettings({ speed: val })}
                                minimumTrackTintColor="#2563eb"
                                maximumTrackTintColor="#3f3f46"
                                thumbTintColor="#ffffff"
                            />
                        </View> */}

                        {/* Mirroring */}
                        <View className="gap-6">
                            <View className="flex-row items-center justify-between">
                                <View className="flex-row items-center gap-3">
                                    <MoveHorizontal color="#71717a" size={20} />
                                    <Text className="text-white text-lg">Mirror Horizontal</Text>
                                </View>
                                <Switch
                                    value={activeScript.is_mirrored_h}
                                    onValueChange={(val) => updateActiveScriptSettings({ is_mirrored_h: val })}
                                    trackColor={{ false: '#3f3f46', true: '#2563eb' }}
                                />
                            </View>
                            <View className="flex-row items-center justify-between">
                                <View className="flex-row items-center gap-3">
                                    <MoveHorizontal color="#71717a" size={20} className="rotate-90" />
                                    <Text className="text-white text-lg">Mirror Vertical</Text>
                                </View>
                                <Switch
                                    value={activeScript.is_mirrored_v}
                                    onValueChange={(val) => updateActiveScriptSettings({ is_mirrored_v: val })}
                                    trackColor={{ false: '#3f3f46', true: '#2563eb' }}
                                />
                            </View>
                        </View>

                    </View>

                    <TouchableOpacity
                        className="bg-green-600 p-5 rounded-2xl items-center shadow-lg mt-8 mb-10"
                        onPress={() => router.push('/prompter')}
                    >
                        <Text className="text-white text-xl font-bold">Start Teleprompter</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </GestureHandlerRootView>
    );
}