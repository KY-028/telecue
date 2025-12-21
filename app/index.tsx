import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useScriptStore } from '../store/useScriptStore';
import { Plus, History } from 'lucide-react-native';

export default function Home() {
    const router = useRouter();
    const resetActiveScript = useScriptStore((state) => state.resetActiveScript);

    const handleNewScript = () => {
        resetActiveScript();
        router.push('/editor');
    };

    return (
        <View className="flex-1 bg-black p-6">
            <View className="mt-10 mb-8">
                <Text className="text-4xl font-bold text-white">TeleCue</Text>
                <Text className="text-gray-400 mt-2 text-lg">Your personal teleprompter companion</Text>
            </View>

            <View className="gap-4">
                <TouchableOpacity
                    className="bg-blue-600 p-6 rounded-2xl flex-row items-center justify-between shadow-lg"
                    activeOpacity={0.8}
                    onPress={handleNewScript}
                >
                    <View>
                        <Text className="text-white text-xl font-semibold">New Script</Text>
                        <Text className="text-blue-200 text-sm mt-1">Start fresh with a new draft</Text>
                    </View>
                    <Plus size={32} color="white" />
                </TouchableOpacity>

                <Link href="/recents" asChild>
                    <TouchableOpacity
                        className="bg-zinc-900 p-6 rounded-2xl flex-row items-center justify-between border border-zinc-800"
                        activeOpacity={0.8}
                    >
                        <View>
                            <Text className="text-white text-xl font-semibold">Resume Recent</Text>
                            <Text className="text-zinc-500 text-sm mt-1">Pick up where you left off</Text>
                        </View>
                        <History size={32} color="#71717a" />
                    </TouchableOpacity>
                </Link>
            </View>
        </View>
    );
}
