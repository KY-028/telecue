import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import { useScriptStore } from '../store/useScriptStore';
import { FileText, ChevronRight } from 'lucide-react-native';
import { DATABASE_NAME } from '../db/schema';

type Script = {
    id: number;
    title: string;
    content: string;
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
        <View className="flex-1 bg-black p-4">
            {scripts.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                    <Text className="text-zinc-500 text-lg">No saved scripts found.</Text>
                </View>
            ) : (
                <FlatList
                    className="gap-4"
                    data={scripts}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            className="bg-zinc-900 p-4 rounded-xl flex-row items-center border border-zinc-800 mb-3"
                            onPress={() => handleSelectScript(item)}
                        >
                            <View className="bg-zinc-800 p-3 rounded-lg mr-4">
                                <FileText color="#a1a1aa" size={24} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-white text-lg font-semibold" numberOfLines={1}>{item.title}</Text>
                                <Text className="text-zinc-500 text-sm" numberOfLines={1}>{item.content}</Text>
                            </View>
                            <ChevronRight color="#52525b" size={20} />
                        </TouchableOpacity>
                    )}
                />
            )}
        </View>
    );
}
