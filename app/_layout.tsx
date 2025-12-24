import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { initDatabase } from '../db/schema';
import '../global.css';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';

export default function RootLayout() {
    // Load Database & Orientation
    useEffect(() => {
        initDatabase().catch(err => console.error("Database init error:", err));
        
        const unlockOrientation = async () => {
            await ScreenOrientation.unlockAsync();
        };
        unlockOrientation();
    }, []);

    return (
        <>
            <StatusBar style="light" hidden={false} />
            <Stack
                screenOptions={{
                    headerStyle: {
                        backgroundColor: '#000',
                    },
                    headerTintColor: '#fff',
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
        </>
    );
}
