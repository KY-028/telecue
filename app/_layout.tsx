import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';

import { initDatabase, DATABASE_NAME } from '../db/schema';
import { SQLiteProvider } from 'expo-sqlite';
import '../global.css';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';

export default function RootLayout() {
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';

    // Load Orientation
    useEffect(() => {

        const unlockOrientation = async () => {
            await ScreenOrientation.unlockAsync();
        };
        unlockOrientation();
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
                <Stack.Screen name="index" options={{ title: 'Home', headerShown: false, }} />
                <Stack.Screen name="editor" options={{ title: 'Script Editor' }} />
                <Stack.Screen name="setup" options={{ title: 'Setup' }} />
                <Stack.Screen name="recents" options={{ title: 'Recent Scripts' }} />
                <Stack.Screen name="prompter" options={{ headerShown: false }} />
            </Stack>
        </SQLiteProvider>
    );
}
