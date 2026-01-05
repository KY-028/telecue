
import { MutableRefObject } from 'react';

export interface EditorState {
    html: string;
    text: string;
    json: any;
}

export interface RichTextEditorProps {
    initialContent?: string | any;
    placeholder?: string;
    onChange?: (state: EditorState) => void;
    editable?: boolean;
    style?: any;
    isDarkMode?: boolean;
}

export interface RichTextEditorRef {
    focus: () => void;
    blur: () => void;
    getHTML: () => Promise<string>;
    getText: () => Promise<string>;
    getJSON: () => Promise<any>;
}

export interface EditorHookResult {
    editor: any; // Platform specific editor object
    editorRef: MutableRefObject<RichTextEditorRef | null>;
    focus: () => void;
    blur: () => void;
    isFocused: boolean;
}

export interface RichTextEditorComponentProps {
    editor: any;
    style?: any;
}

export interface FormattingToolbarComponentProps {
    editor: any;
    onDone: () => void;
}

