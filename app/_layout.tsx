import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { initDatabase } from '../db/schema';
import '../global.css';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';

export default function RootLayout() {
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';

    // Load Database & Orientation
    useEffect(() => {
        initDatabase().catch(err => console.error("Database init error:", err));

        const unlockOrientation = async () => {
            await ScreenOrientation.unlockAsync();
        };
        unlockOrientation();
    }, []);

    return (
        <ThemeProvider value={isDarkMode ? DarkTheme : DefaultTheme}>
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
        </ThemeProvider>
    );
}
