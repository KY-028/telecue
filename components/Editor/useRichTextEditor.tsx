
import React, { useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { RichText, useEditorBridge, useBridgeState, TenTapStartKit, CoreBridge, PlaceholderBridge, defaultEditorTheme, darkEditorTheme } from '@10play/tentap-editor';
import { FormattingToolbar as NativeFormattingToolbar } from '../FormattingToolbar';
import { EditorHookResult, RichTextEditorProps, RichTextEditorRef, RichTextEditorComponentProps, FormattingToolbarComponentProps } from './types';
import i18n from '../../utils/i18n';
import { View } from 'react-native';

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

export function useRichTextEditor(props: RichTextEditorProps): EditorHookResult {
  const { initialContent, placeholder, onChange, isDarkMode, style } = props;

  // Memoize extensions to prevent re-creation on every render
  const bridgeExtensions = React.useMemo(() => [
    ...TenTapStartKit,
    CoreBridge.configureCSS(EDITOR_CSS),
    PlaceholderBridge.configureExtension({ placeholder: placeholder || i18n.t('startWriting') }),
  ], [placeholder]);

  // Editor Bridge
  const editor = useEditorBridge({
    autofocus: false,
    avoidIosKeyboard: false,
    initialContent,
    bridgeExtensions,
    theme: isDarkMode ? darkEditorTheme : defaultEditorTheme,
    onChange: async () => {
      if (onChange) {
        // We can debounce this if needed, but per user request we stick to old logic which was direct.
        // The key fix for smoothness is memoizing bridgeExtensions so useEditorBridge doesn't re-init.
        const json = await editor.getJSON();
        const html = await editor.getHTML();
        const text = await editor.getText();
        onChange({ json, html, text });
      }
    }
  });

  const { isFocused } = useBridgeState(editor);
  const editorRef = useRef<RichTextEditorRef | null>(null);

  const focus = () => editor.focus();
  const blur = () => editor.blur();

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

  useImperativeHandle(ref, () => ({
    focus: () => editor.focus(),
    blur: () => editor.blur(),
    getHTML: () => editor.getHTML(),
    getText: () => editor.getText(),
    getJSON: () => editor.getJSON(),
  }));

  return (
    <View style={[{ flex: 1 }, style]}>
      <RichText
        editor={editor}
        style={{ flex: 1 }}
        scrollEnabled={true}
        focusable={true}
      />
    </View>
  );
});

export function FormattingToolbar(props: FormattingToolbarComponentProps) {
  return <NativeFormattingToolbar editor={props.editor} onDone={props.onDone} />;
}
