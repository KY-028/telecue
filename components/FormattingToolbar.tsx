import { useState } from 'react';
import { View, TouchableOpacity, Text, ScrollView, Platform, useColorScheme } from 'react-native';
import { Bold, Italic, Underline, Palette, Type } from 'lucide-react-native';
import { EditorBridge, useBridgeState } from '@10play/tentap-editor';
import i18n from '../utils/i18n';

interface FormattingToolbarProps {
    editor: EditorBridge;
    onDone: () => void;
}

const COLORS = [
    { name: 'White', value: '#FFFFFF' },
    { name: 'Black', value: '#000000' },
    { name: 'Red', value: '#EF4444' },
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Green', value: '#22C55E' },
    { name: 'Yellow', value: '#EAB308' },
];

export function FormattingToolbar({ editor, onDone }: FormattingToolbarProps) {
    const [showColors, setShowColors] = useState(false);
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    const { isBoldActive, isItalicActive, isUnderlineActive, activeColor } = useBridgeState(editor);

    // Filter colors: White and Black are context-dependent
    const filteredColors = COLORS.filter(c => {
        if (isDarkMode && c.name === 'Black') return false;
        if (!isDarkMode && c.name === 'White') return false;
        return true;
    });

    const isBold = isBoldActive;
    const isItalic = isItalicActive;
    const isUnderline = isUnderlineActive;

    // Helper to wrap editor commands
    const toggleBold = () => editor.toggleBold();
    const toggleItalic = () => editor.toggleItalic();
    const toggleUnderline = () => editor.toggleUnderline();

    return (
        <View className="bg-zinc-100 dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700 relative">
            {showColors && (
                <View
                    style={{ position: 'absolute', bottom: 70, left: 100 }}
                    className="z-50"
                >
                    <View className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl p-3 flex-row items-center">
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            className="flex-row"
                            contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 4 }}
                        >
                            {filteredColors.map((color) => {
                                const isActive = activeColor?.toLowerCase() === color.value.toLowerCase();
                                return (
                                    <TouchableOpacity
                                        key={color.value}
                                        onPress={() => {
                                            editor.setColor(color.value);
                                            setShowColors(false);
                                        }}
                                        className="mx-2 items-center justify-center"
                                    >
                                        <View
                                            style={{ backgroundColor: color.value, borderColor: isActive ? '#60A5FA' : (isDarkMode ? '#52525b' : '#d1d1d6') }}
                                            className={`w-10 h-10 rounded-full border-2 ${isActive ? 'scale-110' : ''}`}
                                        />
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        {/* Triangle / Pointer */}
                        <View
                            style={{
                                position: 'absolute',
                                bottom: -8,
                                left: 24,
                                width: 0,
                                height: 0,
                                backgroundColor: 'transparent',
                                borderStyle: 'solid',
                                borderLeftWidth: 8,
                                borderRightWidth: 8,
                                borderTopWidth: 8,
                                borderLeftColor: 'transparent',
                                borderRightColor: 'transparent',
                                borderTopColor: isDarkMode ? '#3f3f46' : '#e4e4e7' // zinc-700 or zinc-200
                            }}
                        />
                    </View>
                </View>
            )}

            {/* Main Toolbar */}
            <View className="flex-row items-center justify-between p-2 px-4 h-14 bg-zinc-100 dark:bg-zinc-800">
                <View className="flex-row items-center gap-4">
                    <TouchableOpacity
                        onPress={toggleBold}
                        className={isBold ? "bg-zinc-200 dark:bg-zinc-700 rounded-lg p-2" : "p-2"}
                    >
                        <Bold size={20} color={isBold ? "#60A5FA" : (isDarkMode ? "#E4E4E7" : "#3f3f46")} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={toggleItalic}
                        className={isItalic ? "bg-zinc-200 dark:bg-zinc-700 rounded-lg p-2" : "p-2"}
                    >
                        <Italic size={20} color={isItalic ? "#60A5FA" : (isDarkMode ? "#E4E4E7" : "#3f3f46")} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={toggleUnderline}
                        className={isUnderline ? "bg-zinc-200 dark:bg-zinc-700 rounded-lg p-2" : "p-2"}
                    >
                        <Underline size={20} color={isUnderline ? "#60A5FA" : (isDarkMode ? "#E4E4E7" : "#3f3f46")} />
                    </TouchableOpacity>

                    <View className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                    <TouchableOpacity
                        onPress={() => setShowColors(!showColors)}
                        className={showColors ? "bg-zinc-200 dark:bg-zinc-700 rounded-lg p-2" : "p-2"}
                    >
                        <Palette size={20} color={showColors ? "#60A5FA" : (isDarkMode ? "#E4E4E7" : "#3f3f46")} />
                    </TouchableOpacity>
                </View>

                {/* Done Button - Vertically centered with toolbar items */}
                <TouchableOpacity onPress={onDone} className="p-2 flex-row items-center justify-center">
                    <Text className="text-blue-600 dark:text-blue-400 font-bold text-lg">{i18n.t('done')}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
