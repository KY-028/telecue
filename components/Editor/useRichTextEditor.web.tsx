
import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { EditorHookResult, RichTextEditorProps, RichTextEditorRef, EditorState, RichTextEditorComponentProps, FormattingToolbarComponentProps } from './types';
import i18n from '../../utils/i18n';
import { Bold, Italic, Underline, Palette } from 'lucide-react-native';

const FONT_FAMILY = '-apple-system, Roboto, "Helvetica Neue", system-ui, sans-serif';

// Basic color palette matching native
const COLORS = [
    { name: 'White', value: '#FFFFFF' },
    { name: 'Black', value: '#000000' },
    { name: 'Red', value: '#EF4444' },
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Green', value: '#22C55E' },
    { name: 'Yellow', value: '#EAB308' },
];

function useRichTextEditorInternal(props: RichTextEditorProps): EditorHookResult {
    const { onChange } = props;

    // Internal ref for the div
    const internalRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<RichTextEditorRef | null>(null);

    const [isFocused, setIsFocused] = useState(false);

    // Track toggle states for Toolbar
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);

    const checkState = () => {
        if (document.activeElement === internalRef.current) {
            setIsBold(document.queryCommandState('bold'));
            setIsItalic(document.queryCommandState('italic'));
            setIsUnderline(document.queryCommandState('underline'));
        }
    };

    const editor = {
        internalRef,
        isBold,
        isItalic,
        isUnderline,
        checkState,
        setIsFocused,
        bind: {
            onFocus: () => setIsFocused(true),
            onBlur: () => setIsFocused(false),
            onInput: () => {
                if (internalRef.current && onChange) {
                    const html = internalRef.current.innerHTML;
                    const text = internalRef.current.innerText;
                    onChange({ html, text, json: { content: html } });
                }
                checkState();
            }
        },
        // Mimic Native Editor API
        getJSON: async () => ({ content: internalRef.current?.innerHTML || '' }),
        getHTML: async () => internalRef.current?.innerHTML || '',
        getText: async () => internalRef.current?.innerText || '',
        focus: () => internalRef.current?.focus(),
        blur: () => internalRef.current?.blur(),

        // Props for component consumption
        initialContent: props.initialContent,
        placeholder: props.placeholder,
        isDarkMode: props.isDarkMode
    };

    // Sync Toolbar state on selection change
    useEffect(() => {
        const handleSelectionChange = () => checkState();
        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, []);

    const focus = () => internalRef.current?.focus();
    const blur = () => internalRef.current?.blur();

    return {
        editor,
        editorRef,
        focus,
        blur,
        isFocused
    };
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorComponentProps>((props, ref) => {
    const { editor, style } = props;
    const { internalRef } = editor;

    useImperativeHandle(ref, () => ({
        focus: () => internalRef.current?.focus(),
        blur: () => internalRef.current?.blur(),
        getHTML: async () => internalRef.current?.innerHTML || '',
        getText: async () => internalRef.current?.innerText || '',
        getJSON: async () => ({ content: internalRef.current?.innerHTML || '' }),
    }));

    useEffect(() => {
        if (internalRef.current && editor.initialContent) {
            let contentToSet = '';
            if (typeof editor.initialContent === 'string') {
                if (editor.initialContent.trim().startsWith('{')) {
                    contentToSet = editor.initialContent;
                } else {
                    contentToSet = editor.initialContent;
                }
            }
            if (internalRef.current.innerHTML !== contentToSet) {
                internalRef.current.innerHTML = contentToSet;
            }
        }
    }, [editor.initialContent]);

    return (
        <View style={[{ flex: 1 }, style]}>
            <div
                ref={internalRef}
                contentEditable
                onInput={editor.bind.onInput}
                onFocus={editor.bind.onFocus}
                onBlur={editor.bind.onBlur}
                style={{
                    height: '100%',
                    outline: 'none',
                    padding: '24px',
                    fontSize: '18px',
                    fontFamily: FONT_FAMILY,
                    color: editor.isDarkMode ? '#ffffff' : '#000000',
                    overflowY: 'auto',
                    userSelect: 'text',
                    cursor: 'text',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'break-word'
                }}
                dangerouslySetInnerHTML={undefined}
                suppressContentEditableWarning={true}
                data-placeholder={editor.placeholder}
            />
            <style>{`
                [contenteditable]:empty:before {
                    content: attr(data-placeholder);
                    color: ${editor.isDarkMode ? '#52525b' : '#a1a1aa'};
                    pointer-events: none;
                    display: block;
                }
            `}</style>
        </View>
    );
});

export function FormattingToolbar(props: FormattingToolbarComponentProps) {
    const { editor, onDone } = props;
    const { internalRef, checkState, isBold, isItalic, isUnderline, isDarkMode } = editor;
    const [showColors, setShowColors] = useState(false);
    const [activeColor, setActiveColor] = useState('#000000');

    const exec = (cmd: string, val?: string) => {
        document.execCommand(cmd, false, val);
        internalRef.current?.focus();
        checkState();
    };

    return (
        <View className="bg-zinc-100 dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700 relative">
            {showColors && (
                <View style={{ position: 'absolute', bottom: 60, left: 100, zIndex: 100 }}>
                    <View className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl p-3 flex-row items-center">
                        {COLORS.map((color) => {
                            if (isDarkMode && color.name === 'Black') return null;
                            if (!isDarkMode && color.name === 'White') return null;
                            const isActive = activeColor === color.value;
                            return (
                                <TouchableOpacity
                                    key={color.value}
                                    // @ts-ignore - Web only prop
                                    onMouseDown={(e: any) => e.preventDefault()}
                                    onPress={() => {
                                        exec('foreColor', color.value);
                                        setActiveColor(color.value);
                                        setShowColors(false);
                                    }}
                                    style={{ marginHorizontal: 6 }}
                                >
                                    <View
                                        style={{
                                            backgroundColor: color.value,
                                            width: 32, height: 32, borderRadius: 16,
                                            borderWidth: 2,
                                            borderColor: isActive ? '#60A5FA' : (isDarkMode ? '#52525b' : '#d1d1d6')
                                        }}
                                    />
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                </View>
            )}

            <View className="flex-row items-center justify-between p-2 px-4 h-14 bg-zinc-100 dark:bg-zinc-800">
                <View className="flex-row items-center gap-4">
                    <TouchableOpacity
                        // @ts-ignore - Web only prop
                        onMouseDown={(e: any) => e.preventDefault()}
                        onPress={() => exec('bold')}
                        className={isBold ? "bg-zinc-200 dark:bg-zinc-700 rounded-lg p-2" : "p-2"}
                    >
                        <Bold size={20} color={isBold ? "#60A5FA" : (isDarkMode ? "#E4E4E7" : "#3f3f46")} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        // @ts-ignore - Web only prop
                        onMouseDown={(e: any) => e.preventDefault()}
                        onPress={() => exec('italic')}
                        className={isItalic ? "bg-zinc-200 dark:bg-zinc-700 rounded-lg p-2" : "p-2"}
                    >
                        <Italic size={20} color={isItalic ? "#60A5FA" : (isDarkMode ? "#E4E4E7" : "#3f3f46")} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        // @ts-ignore - Web only prop
                        onMouseDown={(e: any) => e.preventDefault()}
                        onPress={() => exec('underline')}
                        className={isUnderline ? "bg-zinc-200 dark:bg-zinc-700 rounded-lg p-2" : "p-2"}
                    >
                        <Underline size={20} color={isUnderline ? "#60A5FA" : (isDarkMode ? "#E4E4E7" : "#3f3f46")} />
                    </TouchableOpacity>
                    <View className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />
                    <TouchableOpacity
                        // @ts-ignore - Web only prop
                        onMouseDown={(e: any) => e.preventDefault()}
                        onPress={() => setShowColors(!showColors)}
                        className={showColors ? "bg-zinc-200 dark:bg-zinc-700 rounded-lg p-2" : "p-2"}
                    >
                        <Palette size={20} color={showColors ? "#60A5FA" : (isDarkMode ? "#E4E4E7" : "#3f3f46")} />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    // @ts-ignore - Web only prop
                    onMouseDown={(e: any) => e.preventDefault()}
                    onPress={onDone}
                    className="p-2 flex-row items-center justify-center"
                >
                    <Text className="text-blue-600 dark:text-blue-400 font-bold text-lg">{i18n.t('done')}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

// Update the hook to attach the necessary props to the 'editor' object
function useRichTextEditorWithProps(props: RichTextEditorProps) {
    const res = useRichTextEditorInternal(props);
    res.editor.initialContent = props.initialContent;
    res.editor.placeholder = props.placeholder;
    res.editor.isDarkMode = props.isDarkMode;
    return res;
}
// Exporting the refined hook as main
export { useRichTextEditorWithProps as useRichTextEditor };