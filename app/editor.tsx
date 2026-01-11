
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Keyboard, InputAccessoryView, useWindowDimensions, useColorScheme } from 'react-native';
import { useRichTextEditor, RichTextEditor, FormattingToolbar } from '../components/Editor/useRichTextEditor';
import { RichTextEditorRef } from '../components/Editor/types';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRouter, useFocusEffect } from 'expo-router';
import debounce from 'lodash.debounce';
import { useScriptStore } from '../store/useScriptStore';
import { useSQLiteContext } from 'expo-sqlite';
import i18n from '../utils/i18n';

export default function ScriptEditor() {
    const db = useSQLiteContext();
    const { activeScript, setActiveScript, setToastMessage, updateActiveScriptSettings } = useScriptStore();
    const router = useRouter();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    const insets = useSafeAreaInsets();

    // Parse initial content
    const initialContent = useMemo(() => {
        const content = activeScript?.content || '';

        if (Platform.OS === 'web') {
            // On Web, prefer the HTML content if available, otherwise try plain text or raw content
            if (activeScript?.html_content) {
                return activeScript.html_content;
            }
            // If only JSON content exists, we can't easily render it on web without a converter.
            // But we'll return it as string and let the hook handle (which currently ignores it if it looks like JSON).
            // This is a known limitation until we have a JSON->HTML converter or unified format.
            return content;
        }

        // Native (TenTap) handles JSON string or object
        if (content.trim().startsWith('{')) {
            try {
                return JSON.parse(content);
            } catch (e) {
                return content;
            }
        }
        return content;
    }, [activeScript?.id]);



    // Filter save logic for reuse
    const saveScript = useCallback(async (currentScript: any) => {
        if (!currentScript) return;

        // Security & Validation
        const MAX_TITLE_LENGTH = 255;
        const MAX_CONTENT_LENGTH = 1000000; // ~1MB

        if (currentScript.title && currentScript.title.length > MAX_TITLE_LENGTH) {
            setToastMessage(i18n.t('error') + ": Title too long");
            return;
        }

        // Sanitize numeric inputs to prevent boundary issues
        const fontSize = Math.max(1, Math.min(Number(currentScript.font_size) || 3, 20));
        const margin = Math.max(0, Math.min(Number(currentScript.margin) || 20, 200));
        const speed = Math.max(0.1, Math.min(Number(currentScript.speed) || 1, 10));

        try {
            // Get latest content from arguments directly
            const content = currentScript.content;
            const plainText = currentScript.plain_text;
            const htmlContent = currentScript.html_content;

            if (content && content.length > MAX_CONTENT_LENGTH) {
                setToastMessage(i18n.t('error') + ": Content too large");
                return;
            }

            if (currentScript.id) {
                await db.runAsync(
                    'UPDATE scripts SET title = ?, content = ?, plain_text = ?, html_content = ?, font_size = ?, margin = ?, speed = ?, is_mirrored_h = ?, is_mirrored_v = ?, mode = ?, last_modified = CURRENT_TIMESTAMP WHERE id = ?',
                    [
                        currentScript.title,
                        content,
                        plainText || '',
                        htmlContent || '',
                        fontSize,
                        margin,
                        speed,
                        currentScript.is_mirrored_h ? 1 : 0,
                        currentScript.is_mirrored_v ? 1 : 0,
                        currentScript.mode,
                        currentScript.id
                    ]
                );
                // setToastMessage(i18n.t('scriptSaved')); // Optional: reduce noise for auto-save
            } else {
                if (!currentScript.title && !content) return;

                const result = await db.runAsync(
                    'INSERT INTO scripts (title, content, plain_text, html_content, font_size, margin, speed, is_mirrored_h, is_mirrored_v, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        currentScript.title || i18n.t('untitled'),
                        content || '',
                        plainText || '',
                        htmlContent || '',
                        fontSize,
                        margin,
                        speed,
                        currentScript.is_mirrored_h ? 1 : 0,
                        currentScript.is_mirrored_v ? 1 : 0,
                        currentScript.mode
                    ]
                );
                if (result.lastInsertRowId) {
                    setActiveScript({ ...currentScript, content, id: result.lastInsertRowId });
                    setToastMessage(i18n.t('scriptSaved'));
                }
            }
        } catch (e: any) {
            const errorMessage = e?.message || String(e);
            console.error("Failed to save script:", errorMessage);

            // Don't show toast for transient issues
            if (!errorMessage.includes('NullPointerException') && !errorMessage.includes('database')) {
                setToastMessage(i18n.t('saveFailed'));
            }
        }
    }, [db, setActiveScript, setToastMessage]);

    // specific debounce for saving script content
    const debouncedSave = useMemo(
        () => debounce((script) => {
            saveScript(script);
        }, 2000),
        [saveScript]
    );

    const handleEditorChange = useCallback(({ json, html, text }: { json: any, html: string, text: string }) => {
        if (!activeScript) return;
        const updated = {
            ...activeScript,
            content: JSON.stringify(json), // Main storage
            html_content: html,           // Backup/Web format
            plain_text: text              // Search/AI
        };
        updateActiveScriptSettings(updated);
        debouncedSave(updated);
        activeScriptRef.current = updated; // Update ref immediately for potential rapid unmount
    }, [updateActiveScriptSettings, debouncedSave, activeScript]);

    const {
        editor,
        isFocused: editorFocused
    } = useRichTextEditor({
        initialContent,
        placeholder: i18n.t('startWriting'),
        onChange: handleEditorChange,
        isDarkMode
    });



    useEffect(() => {
        const showSubscription = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            () => setKeyboardVisible(true)
        );
        const hideSubscription = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => setKeyboardVisible(false)
        );
        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);



    // Use ref to keep track of latest activeScript for cleanup
    const activeScriptRef = useRef(activeScript);
    useEffect(() => {
        activeScriptRef.current = activeScript;
    }, [activeScript]);

    // Save on unmount (e.g. back button)
    useFocusEffect(
        useCallback(() => {
            return () => {
                if (activeScriptRef.current) {
                    saveScript(activeScriptRef.current);
                }
            };
        }, [saveScript])
    );

    const handleNext = async () => {
        if (activeScript) {
            await saveScript(activeScript);
        }
        router.push('/setup');
    };

    const handleDone = () => {
        Keyboard.dismiss();
        editor?.blur();
    };

    const headerHeight = useHeaderHeight();

    if (!activeScript) {
        return (
            <View className="flex-1 bg-white dark:bg-black items-center justify-center p-6">
                <Text className="text-black dark:text-white text-center mb-6 text-lg">{i18n.t('noScriptSelected')}</Text>
                <TouchableOpacity className="bg-blue-600 p-4 rounded-xl" onPress={() => router.replace('/')}>
                    <Text className="text-white font-bold">{i18n.t('goBack')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : (isKeyboardVisible ? 'height' : undefined)}
            style={{ flex: 1 }}
            className="bg-white dark:bg-zinc-950"
            keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 35}
        >
            <View
                className="flex-1"
                style={{
                    paddingHorizontal: isLandscape ? 60 : 24,
                    paddingTop: 24,
                    width: '100%',
                    maxWidth: Platform.OS === 'web' ? 800 : undefined,
                    alignSelf: 'center',
                }}
            >
                <TextInput
                    placeholder={i18n.t('scriptTitle')}
                    placeholderTextColor={isDarkMode ? "#52525b" : "#a1a1aa"}
                    className="text-black dark:text-white text-2xl font-bold mb-4"
                    value={activeScript?.title}
                    onChangeText={(text) => useScriptStore.getState().updateActiveScriptSettings({ title: text })}
                    inputAccessoryViewID="titleDoneAccessory"
                    keyboardAppearance={isDarkMode ? "dark" : "light"}
                />

                <View className="flex-1 bg-zinc-50 dark:bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
                    <RichTextEditor
                        editor={editor}
                        style={{ flex: 1 }}
                    />
                </View>

                {/* Navigation Button */}
                {!isKeyboardVisible && (
                    <TouchableOpacity
                        className="bg-blue-600 p-5 rounded-2xl items-center shadow-lg mt-4 mb-6"
                        onPress={handleNext}
                        {...(Platform.OS === 'web' ? {
                            // Prevent focus loss on web to avoid layout shift (hiding toolbar) cancelling the click
                            onMouseDown: (e: any) => e.preventDefault()
                        } : {})}
                    >
                        <Text className="text-white text-xl font-bold">{i18n.t('configureSetup')} →</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* iOS Helper for Title Input */}
            {Platform.OS === 'ios' && (
                <InputAccessoryView nativeID="titleDoneAccessory">
                    <View className="bg-zinc-100 dark:bg-zinc-800 p-2 flex-row justify-end border-t border-zinc-200 dark:border-zinc-700">
                        <TouchableOpacity onPress={Keyboard.dismiss} className="p-2 px-4">
                            <Text className="text-blue-600 dark:text-blue-400 font-bold text-lg">{i18n.t('done')}</Text>
                        </TouchableOpacity>
                    </View>
                </InputAccessoryView>
            )}

            {/* Custom Toolbar */}
            {editorFocused && (
                <View style={{ paddingBottom: Platform.OS === 'ios' ? 0 : insets.bottom }}>
                    <FormattingToolbar
                        editor={editor}
                        onDone={handleDone}
                    />
                </View>
            )}

        </KeyboardAvoidingView>
    );
}
