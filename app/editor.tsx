import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useEffect, useRef } from 'react';

import { useRouter } from 'expo-router';
import { useScriptStore } from '../store/useScriptStore';
import { Save } from 'lucide-react-native';
import * as SQLite from 'expo-sqlite';
import { DATABASE_NAME } from '../db/schema';

export default function ScriptEditor() {
    const router = useRouter();
    const { activeScript, setActiveScript } = useScriptStore();

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

    return (
        <View className="flex-1 bg-zinc-950 p-6">
            <TextInput
                placeholder="Script Title"
                placeholderTextColor="#52525b"
                className="text-white text-2xl font-bold mb-4"
                value={activeScript?.title}
                onChangeText={(text) => useScriptStore.getState().updateActiveScriptSettings({ title: text })}
            />

            <ScrollView className="flex-1 bg-zinc-900 rounded-2xl p-4 mb-6">
                <TextInput
                    placeholder="Type or paste your script here..."
                    placeholderTextColor="#52525b"
                    multiline
                    textAlignVertical="top"
                    className="text-white text-lg h-full"
                    value={activeScript?.content}
                    onChangeText={(text) => useScriptStore.getState().updateActiveScriptSettings({ content: text })}
                />
            </ScrollView>

            <TouchableOpacity
                className="bg-blue-600 p-5 rounded-2xl items-center shadow-lg"
                onPress={handleNext}
            >
                <Text className="text-white text-xl font-bold">Configure Setup →</Text>
            </TouchableOpacity>
        </View>
    );
}
