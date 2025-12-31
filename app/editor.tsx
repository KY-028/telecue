import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Keyboard, InputAccessoryView, useWindowDimensions, useColorScheme } from 'react-native';
import { RichText, useEditorBridge, useBridgeState, TenTapStartKit, CoreBridge, PlaceholderBridge, defaultEditorTheme, darkEditorTheme } from '@10play/tentap-editor';
import { FormattingToolbar } from '../components/FormattingToolbar';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRouter } from 'expo-router';
import { useScriptStore } from '../store/useScriptStore';
import { Save } from 'lucide-react-native';
import { useSQLiteContext } from 'expo-sqlite';
import i18n from '../utils/i18n';

const FONT_FAMILY = '-apple-system, Roboto, "Helvetica Neue", system-ui, sans-serif';
const EDITOR_CSS = `
  :root {
    --bg-color: #ffffff;
    --text-color: #000000;
    --placeholder-color: #a1a1aa;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg-color: #18181b;
      --text-color: #ffffff;
      --placeholder-color: #52525b;
    }
  }
  body {
    background-color: var(--bg-color);
    color: var(--text-color);
    font-family: ${FONT_FAMILY};
    margin: 0;
    padding: 0;
    height: 100%;
    overscroll-behavior: none;
  }
  .ProseMirror {
    background-color: var(--bg-color);
    color: var(--text-color);
    font-family: ${FONT_FAMILY};
    font-size: 18px;
    padding: 24px;
    min-height: 100%;
    outline: none;
    box-sizing: border-box;
    -webkit-user-select: text;
    user-select: text;
  }
  .ProseMirror p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    color: var(--placeholder-color);
    pointer-events: none;
    height: 0;
    font-family: ${FONT_FAMILY};
    font-size: 18px;
  }
  p { margin: 0; }
`;

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

    // Parse initial content - support both HTML and JSON (AST)
    // IMPORTANT: Dependency is activeScript?.id to avoid re-initializing editor on every keystroke
    const initialContent = useMemo(() => {
        const content = activeScript?.content || '';
        if (content.trim().startsWith('{')) {
            try {
                return JSON.parse(content);
            } catch (e) {
                return content;
            }
        }
        return content;
    }, [activeScript?.id]);

    // TenTap Editor Bridge
    const editor = useEditorBridge({
        autofocus: false,
        avoidIosKeyboard: false, // Use KeyboardAvoidingView instead for the whole layout
        initialContent,
        bridgeExtensions: [
            ...TenTapStartKit,
            CoreBridge.configureCSS(EDITOR_CSS),
            PlaceholderBridge.configureExtension({ placeholder: i18n.t('startWriting') }),
        ],
        theme: isDarkMode ? darkEditorTheme : defaultEditorTheme,
        onChange: async () => {
            const json = await editor.getJSON();
            const html = await editor.getHTML();
            const text = await editor.getText();
            updateActiveScriptSettings({
                content: JSON.stringify(json),
                html_content: html,
                plain_text: text
            });
        }
    });

    // Use bridge state for focus tracking
    const { isFocused: editorFocused } = useBridgeState(editor);

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

    // Filter save logic for reuse
    const saveScript = async (currentScript: any) => {
        if (!currentScript) return;
        try {
            // Get latest content from editor directly to ensure sync before save
            const json = await editor.getJSON();
            const content = JSON.stringify(json);

            if (currentScript.id) {
                await db.runAsync(
                    'UPDATE scripts SET title = ?, content = ?, plain_text = ?, html_content = ?, last_modified = CURRENT_TIMESTAMP WHERE id = ?',
                    [currentScript.title, content, currentScript.plain_text || '', currentScript.html_content || '', currentScript.id]
                );
                setToastMessage(i18n.t('scriptSaved'));
            } else {
                // Only insert if there is some content or title to avoid saving empty spam
                if (!currentScript.title && !content) {
                    return;
                }

                const result = await db.runAsync(
                    'INSERT INTO scripts (title, content, plain_text, html_content, font_size, margin, speed, is_mirrored_h, is_mirrored_v, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        currentScript.title || i18n.t('untitled'),
                        content || '',
                        currentScript.plain_text || '',
                        currentScript.html_content || '',
                        currentScript.font_size,
                        currentScript.margin,
                        currentScript.speed,
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
    };

    // Use ref to keep track of latest activeScript for cleanup
    const activeScriptRef = useRef(activeScript);
    useEffect(() => {
        activeScriptRef.current = activeScript;
    }, [activeScript]);

    // Save on unmount (e.g. back button)
    useEffect(() => {
        return () => {
            if (activeScriptRef.current) {
                // Fire and forget save on unmount - relying on store state for this one since effect can't await editor easily
                // or we can try best effort if we want to risk it. 
                // Better to rely on the onChange updates to the store for this unmount save.
                saveScript(activeScriptRef.current);
            }
        };
    }, []);

    const handleNext = async () => {
        if (activeScript) {
            await saveScript(activeScript);
        }
        router.push('/setup');
    };

    const handleDone = () => {
        Keyboard.dismiss();
        editor.blur();
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
        <>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : (isKeyboardVisible ? 'height' : undefined)}
                style={{ flex: 1 }}
                className="bg-white dark:bg-zinc-950"
                keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 35}
            >
                <View
                    className="flex-1"
                    style={{ paddingHorizontal: isLandscape ? 60 : 24, paddingTop: 24 }}
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
                        <RichText
                            editor={editor}
                            style={{ flex: 1, backgroundColor: isDarkMode ? '#18181b' : '#ffffff' }}
                            scrollEnabled={true}
                            focusable={true}
                        />
                    </View>

                    {/* Navigation Button */}
                    {!isKeyboardVisible && (
                        <TouchableOpacity
                            className="bg-blue-600 p-5 rounded-2xl items-center shadow-lg mt-4 mb-6"
                            onPress={handleNext}
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
        </>
    );
}
