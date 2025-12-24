import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Keyboard, InputAccessoryView } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';

import { useRouter } from 'expo-router';
import { useScriptStore } from '../store/useScriptStore';
import { Save } from 'lucide-react-native';
import * as SQLite from 'expo-sqlite';
import { DATABASE_NAME } from '../db/schema';

export default function ScriptEditor() {
    const router = useRouter();
    const { activeScript, setActiveScript, setToastMessage } = useScriptStore();
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
        if (Platform.OS === 'android') {
            const showSubscription = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
            const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
            return () => {
                showSubscription.remove();
                hideSubscription.remove();
            };
        }
    }, []);

    // Extract save logic for reuse
    const saveScript = async (currentScript: any) => {
        if (!currentScript) return;
        try {
            const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
            if (currentScript.id) {
                await db.runAsync(
                    'UPDATE scripts SET title = ?, content = ?, last_modified = CURRENT_TIMESTAMP WHERE id = ?',
                    [currentScript.title, currentScript.content, currentScript.id]
                );
                setToastMessage("Your script was saved to Recent Scripts!");
            } else {
                // Only insert if there is some content or title to avoid saving empty spam
                if (!currentScript.title && !currentScript.content) return;

                const result = await db.runAsync(
                    'INSERT INTO scripts (title, content, font_size, margin, speed, is_mirrored_h, is_mirrored_v, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        currentScript.title || 'Untitled',
                        currentScript.content || '',
                        currentScript.font_size,
                        currentScript.margin,
                        currentScript.speed,
                        currentScript.is_mirrored_h ? 1 : 0,
                        currentScript.is_mirrored_v ? 1 : 0,
                        currentScript.mode
                    ]
                );
                if (result.lastInsertRowId) {
                    setActiveScript({ ...currentScript, id: result.lastInsertRowId });
                    setToastMessage("Your script was saved to Recent Scripts!");
                }
            }
        } catch (e) {
            console.error("Failed to save script:", e);
        }
    };

    // Use ref to keep track of latest activeScript for cleanup
    const activeScriptRef = useRef(activeScript);
    useEffect(() => {
        activeScriptRef.current = activeScript;
    }, [activeScript]);

    // Save on unmount (e.g. back button)
    useEffect(() => {
        return () => {
            if (activeScriptRef.current) {
                // Fire and forget save on unmount
                saveScript(activeScriptRef.current);
            }
        };
    }, []);

    const handleNext = async () => {
        if (activeScript) {
            await saveScript(activeScript);
        }
        router.push('/setup');
    };

    const headerHeight = useHeaderHeight();

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
        <>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                className="bg-zinc-950"
                keyboardVerticalOffset={headerHeight}
            >
                <View className="flex-1 p-6">
                    <TextInput
                        placeholder="Script Title"
                        placeholderTextColor="#52525b"
                        className="text-white text-2xl font-bold mb-4"
                        value={activeScript?.title}
                        onChangeText={(text) => useScriptStore.getState().updateActiveScriptSettings({ title: text })}
                        inputAccessoryViewID="titleDoneAccessory"
                        keyboardAppearance="dark"
                    />

                    <ScrollView
                        className="flex-1 bg-zinc-900 rounded-2xl p-4 mb-6"
                        contentContainerStyle={{ flexGrow: 1 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        <TextInput
                            placeholder="Type or paste your script here..."
                            placeholderTextColor="#52525b"
                            multiline
                            textAlignVertical="top"
                            className="text-white text-lg flex-1"
                            value={activeScript?.content}
                            onChangeText={(text) => useScriptStore.getState().updateActiveScriptSettings({ content: text })}
                            inputAccessoryViewID="contentDoneAccessory"
                            keyboardAppearance="dark"
                        />
                    </ScrollView>

                    <TouchableOpacity
                        className="bg-blue-600 p-5 rounded-2xl items-center shadow-lg"
                        onPress={handleNext}
                    >
                        <Text className="text-white text-xl font-bold">Configure Setup →</Text>
                    </TouchableOpacity>
                </View>

                {Platform.OS === 'android' && isKeyboardVisible && (
                    <TouchableOpacity
                        onPress={Keyboard.dismiss}
                        className="absolute bottom-4 right-4 bg-zinc-800 p-3 px-6 rounded-full shadow-lg border border-zinc-700 z-50"
                    >
                        <Text className="text-blue-400 font-bold">Done</Text>
                    </TouchableOpacity>
                )}
            </KeyboardAvoidingView>

            {Platform.OS === 'ios' && (
                <>
                    <InputAccessoryView nativeID="titleDoneAccessory">
                        <View className="bg-zinc-800 p-2 flex-row justify-end border-t border-zinc-700">
                            <TouchableOpacity onPress={Keyboard.dismiss} className="p-2 px-4">
                                <Text className="text-blue-400 font-bold text-lg">Done</Text>
                            </TouchableOpacity>
                        </View>
                    </InputAccessoryView>
                    <InputAccessoryView nativeID="contentDoneAccessory">
                        <View className="bg-zinc-800 p-2 flex-row justify-end border-t border-zinc-700">
                            <TouchableOpacity onPress={Keyboard.dismiss} className="p-2 px-4">
                                <Text className="text-blue-400 font-bold text-lg">Done</Text>
                            </TouchableOpacity>
                        </View>
                    </InputAccessoryView>
                </>
            )}
        </>
    );
}
