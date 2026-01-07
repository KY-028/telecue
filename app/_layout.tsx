import { Platform, useColorScheme } from 'react-native';
if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // @ts-ignore
    window._WORKLET = false;
    // @ts-ignore
    window._getAnimationTimestamp = () => performance.now();
}

import 'react-native-reanimated';
import { useEffect } from 'react';
import { Stack } from 'expo-router';

import { initDatabase, DATABASE_NAME } from '../db/schema';
import { SQLiteProvider } from 'expo-sqlite';
import '../global.css';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import i18n from '../utils/i18n';

export default function RootLayout() {
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';

    // Load Orientation
    useEffect(() => {

        const unlockOrientation = async () => {
            await ScreenOrientation.unlockAsync();
        };
        if (Platform.OS !== 'web') {
            unlockOrientation();
        }
    }, []);

    return (
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDatabase} useSuspense>
            <StatusBar style={isDarkMode ? 'light' : 'dark'} hidden={false} />
            <Stack
                screenOptions={{
                    headerStyle: {
                        backgroundColor: isDarkMode ? '#000' : '#fff',
                    },
                    headerTintColor: isDarkMode ? '#fff' : '#000',
                    headerTitleStyle: {
                        fontWeight: 'bold',
                    },
                }}
            >
                <Stack.Screen name="index" options={{ title: i18n.t('home'), headerShown: false, }} />
                <Stack.Screen name="editor" options={{ title: i18n.t('scriptEditor') }} />
                <Stack.Screen name="setup" options={{ title: i18n.t('setup') }} />
                <Stack.Screen name="recents" options={{ title: i18n.t('recentScripts') }} />
                <Stack.Screen name="prompter" options={{ headerShown: false }} />
            </Stack>
        </SQLiteProvider>
    );
}
