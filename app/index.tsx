import { View, Text, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useScriptStore } from '../store/useScriptStore';
import { Plus, History } from 'lucide-react-native';
import { useEffect } from 'react';

export default function Home() {
    const router = useRouter();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;
    const { resetActiveScript, toastMessage, setToastMessage } = useScriptStore();

    useEffect(() => {
        if (toastMessage) {
            const timer = setTimeout(() => {
                setToastMessage(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [toastMessage]);

    const handleNewScript = () => {
        resetActiveScript();
        router.push('/editor');
    };

    return (
        <View
            className="flex-1 bg-black p-6 pt-24"
            style={{ paddingHorizontal: isLandscape ? 60 : 24 }}
        >
            {toastMessage && (
                <View className="absolute bottom-24 left-6 right-6 bg-zinc-700 p-4 rounded-xl border border-zinc-700 shadow-lg z-50">
                    <Text className="text-white font-medium text-center">{toastMessage}</Text>
                </View>
            )}

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
                            <Text className="text-white text-xl font-semibold">Recent Scripts</Text>
                            <Text className="text-zinc-500 text-sm mt-1">Pick up where you left off</Text>
                        </View>
                        <History size={32} color="#71717a" />
                    </TouchableOpacity>
                </Link>
            </View>
        </View>
    );
}
