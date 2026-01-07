import { View, Text, TouchableOpacity, ScrollView, useWindowDimensions, useColorScheme, Platform } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useScriptStore } from '../store/useScriptStore';
import { Plus, History } from 'lucide-react-native';
import { useEffect } from 'react';
import i18n from '../utils/i18n';

export default function Home() {
    const router = useRouter();
    const { width, height } = useWindowDimensions();
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
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
        <View className="flex-1 bg-white dark:bg-black">
            <View
                className="flex-1"
                style={{
                    paddingTop: 96, // pt-24 equivalent
                    padding: 24,    // p-6 equivalent
                    paddingHorizontal: isLandscape ? 60 : 24,
                    width: '100%',
                    maxWidth: Platform.OS === 'web' ? 800 : undefined,
                    alignSelf: 'center',
                }}
            >
                {toastMessage && (
                    <View className="absolute bottom-24 left-6 right-6 bg-zinc-200 dark:bg-zinc-700 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-lg z-50">
                        <Text className="text-black dark:text-white font-medium text-center">{toastMessage}</Text>
                    </View>
                )}

                <View className="mt-10 mb-8">
                    <Text className="text-4xl font-bold text-black dark:text-white">{i18n.t('appName')}</Text>
                    <Text className="text-gray-500 dark:text-gray-400 mt-2 text-lg">{i18n.t('appSubtitle')}</Text>
                </View>

                <View className="gap-4">
                    <TouchableOpacity
                        className="bg-blue-600 p-6 rounded-2xl flex-row items-center justify-between shadow-lg"
                        activeOpacity={0.8}
                        onPress={handleNewScript}
                    >
                        <View>
                            <Text className="text-white text-xl font-semibold">{i18n.t('newScript')}</Text>
                            <Text className="text-blue-100 dark:text-blue-200 text-sm mt-1">{i18n.t('newScriptSubtitle')}</Text>
                        </View>
                        <Plus size={32} color="white" />
                    </TouchableOpacity>

                    <Link href="/recents" asChild>
                        <TouchableOpacity
                            className="bg-zinc-50 dark:bg-zinc-900 p-6 rounded-2xl flex-row items-center justify-between border border-zinc-200 dark:border-zinc-800"
                            activeOpacity={0.8}
                        >
                            <View>
                                <Text className="text-black dark:text-white text-xl font-semibold">{i18n.t('recentScripts')}</Text>
                                <Text className="text-zinc-400 dark:text-zinc-500 text-sm mt-1">{i18n.t('recentScriptsSubtitle')}</Text>
                            </View>
                            <History size={32} color={isDarkMode ? "#71717a" : "#a1a1aa"} />
                        </TouchableOpacity>
                    </Link>
                </View>
            </View>
        </View>
    );
}
