import { View, Text, TouchableOpacity, FlatList, useWindowDimensions, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import { useScriptStore } from '../store/useScriptStore';
import { FileText, ChevronRight } from 'lucide-react-native';
import { DATABASE_NAME } from '../db/schema';

// Helper to extract displayable text from content
const getDisplayableText = (script: Script): string => {
    // Prefer plain_text if available
    if (script.plain_text && script.plain_text.trim()) {
        return script.plain_text;
    }

    // Try to parse JSON content and extract text
    if (script.content && script.content.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(script.content);
            // Extract text from TipTap/ProseMirror JSON structure
            const extractText = (node: any): string => {
                if (!node) return '';
                if (node.type === 'text') return node.text || '';
                if (node.content && Array.isArray(node.content)) {
                    return node.content.map(extractText).join('');
                }
                return '';
            };
            const text = extractText(parsed);
            if (text.trim()) return text;
        } catch (e) {
            // Not valid JSON, fall through
        }
    }

    // Fallback: Strip HTML tags if content looks like HTML
    if (script.content) {
        const stripped = script.content.replace(/<[^>]*>/g, '').trim();
        // Don't show raw JSON
        if (!stripped.startsWith('{')) {
            return stripped;
        }
    }

    return 'No content';
};

type Script = {
    id: number;
    title: string;
    content: string;
    plain_text: string | null;
    html_content: string | null;
    font_size: number;
    margin: number;
    speed: number;
    is_mirrored_h: number;
    is_mirrored_v: number;
    mode: 'phone' | 'rig';
    last_modified: string;
};

export default function Recents() {
    const router = useRouter();
    const { width, height } = useWindowDimensions();
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    const isLandscape = width > height;
    const setActiveScript = useScriptStore((state) => state.setActiveScript);
    const [scripts, setScripts] = useState<Script[]>([]);

    useEffect(() => {
        const loadScripts = async () => {
            const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
            const result = await db.getAllAsync<Script>('SELECT * FROM scripts ORDER BY last_modified DESC');
            setScripts(result);
        };
        loadScripts();
    }, []);

    const handleSelectScript = (script: Script) => {
        setActiveScript({
            title: script.title,
            content: script.content,
            plain_text: script.plain_text || undefined,
            html_content: script.html_content || undefined,
            font_size: script.font_size,
            margin: script.margin,
            speed: script.speed,
            is_mirrored_h: !!script.is_mirrored_h,
            is_mirrored_v: !!script.is_mirrored_v,
            mode: script.mode,
            font_family: 'System',
            // Store ID to support updates later
            id: script.id
        });
        router.push('/setup');
    };

    return (
        <View
            className="flex-1 bg-white dark:bg-black p-4"
            style={{ paddingHorizontal: isLandscape ? 60 : 24 }}
        >
            {scripts.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                    <Text className="text-zinc-400 dark:text-zinc-500 text-lg">No saved scripts found.</Text>
                </View>
            ) : (
                <FlatList
                    className="gap-4"
                    data={scripts}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-xl flex-row items-center border border-zinc-200 dark:border-zinc-800 mb-3"
                            onPress={() => handleSelectScript(item)}
                        >
                            <View className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded-lg mr-4">
                                <FileText color={isDarkMode ? "#a1a1aa" : "#71717a"} size={24} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-black dark:text-white text-lg font-semibold" numberOfLines={1}>{item.title}</Text>
                                <Text className="text-zinc-500 dark:text-zinc-400 text-sm" numberOfLines={1}>{getDisplayableText(item)}</Text>
                            </View>
                            <ChevronRight color={isDarkMode ? "#52525b" : "#a1a1aa"} size={20} />
                        </TouchableOpacity>
                    )}
                />
            )}
        </View>
    );
}
