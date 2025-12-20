import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { initDatabase } from '../src/db/schema';
import '../global.css';

export default function RootLayout() {
    useEffect(() => {
        initDatabase().catch(err => console.error("Database init error:", err));
    }, []);

    return (
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
            <Stack.Screen name="index" options={{ title: 'TeleCue' }} />
            <Stack.Screen name="editor" options={{ title: 'Script Editor' }} />
            <Stack.Screen name="setup" options={{ title: 'Setup' }} />
            <Stack.Screen name="recents" options={{ title: 'Recent Scripts' }} />
            <Stack.Screen name="prompter" options={{ headerShown: false, orientation: 'landscape' }} />
        </Stack>
    );
}
