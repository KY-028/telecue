import { TextStyle } from 'react-native';

export interface StyledWord {
    word: string;
    style: TextStyle;
}

/**
 * Parses simple HTML content from TenTap editor into a list of words with their associated styles.
 * Supports: <b>, <strong>, <i>, <em>, <u>, <span style="color:...">
 */
export function parseHtmlToStyledWords(html: string): StyledWord[] {
    if (!html) return [];

    // 1. Tokenize HTML by tags
    // Regex matches: tags (<...>) or text content
    const tokens = html.split(/(<[^>]+>)/g).filter(t => t.length > 0);

    const words: StyledWord[] = [];
    let currentStyle: TextStyle = {};
    const styleStack: TextStyle[] = [];

    // Track if we just added a newline to avoid duplicate newlines if multiple block tags end
    let justAddedNewline = false;

    // Helper to parse style string "color: red; font-weight: bold"
    const parseInlineStyle = (styleStr: string): TextStyle => {
        const style: TextStyle = {};
        const rules = styleStr.split(';');
        for (const rule of rules) {
            const [key, value] = rule.split(':').map(s => s.trim());
            if (!key || !value) continue;

            if (key === 'color') style.color = value;
            if (key === 'font-weight' && (value === 'bold' || value === '700')) style.fontWeight = 'bold';
            if (key === 'font-style' && value === 'italic') style.fontStyle = 'italic';
            if (key === 'text-decoration' && value.includes('underline')) style.textDecorationLine = 'underline';
        }
        return style;
    };

    for (const token of tokens) {
        if (token.startsWith('<')) {
            // It's a tag
            const isCloseTag = token.startsWith('</');
            const tagName = token.replace(/[</>]/g, '').split(' ')[0].toLowerCase();

            if (isCloseTag) {
                // Pop style
                if (styleStack.length > 0) {
                    styleStack.pop();
                    currentStyle = styleStack.length > 0 ? { ...styleStack[styleStack.length - 1] } : {};
                }

                // Block level elements (p, div, br)
                if (tagName === 'p' || tagName === 'div' || tagName === 'br') {
                    // Check if we should insert a newline
                    // Logic: </p> usually implies a line break.
                    if (!justAddedNewline) {
                        words.push({ word: '\n', style: {} });
                        justAddedNewline = true;
                    }
                }
            } else {
                // Push style
                let newStyle: TextStyle = { ...currentStyle };

                if (tagName === 'b' || tagName === 'strong') {
                    newStyle.fontWeight = '900';
                } else if (tagName === 'i' || tagName === 'em') {
                    newStyle.fontStyle = 'italic';
                } else if (tagName === 'u') {
                    newStyle.textDecorationLine = 'underline';
                } else if (tagName === 'span') {
                    // Extract style attribute
                    const match = token.match(/style="([^"]+)"/);
                    if (match && match[1]) {
                        const spanStyle = parseInlineStyle(match[1]);
                        newStyle = { ...newStyle, ...spanStyle };
                    }
                }

                // <br> is a self-closing tag often sent as <br> or <br/>
                // If it's <p>, we might perform a newline on *start*? 
                // Tiptap sends <p>...</p>. The newline is between Ps.
                // We'll handle it on close of P.
                // But if it's <br> explicitly:
                if (tagName === 'br') {
                    words.push({ word: '\n', style: {} });
                    justAddedNewline = true;
                }

                styleStack.push(newStyle);
                currentStyle = newStyle;
            }
        } else {
            // It's text content
            justAddedNewline = false; // Reset newline flag when we encounter text

            // Decode entities (basic ones)
            const decodedText = token
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"');

            // Split text into words/chunks
            // Keep newlines if they are in the text content itself (rare in HTML but possible)
            const rawWords = decodedText.split(/(\s+)/).filter(w => w.length > 0);

            for (const w of rawWords) {
                if (w.trim().length > 0 || w === ' ') {
                    words.push({
                        word: w,
                        style: { ...currentStyle }
                    });
                    justAddedNewline = false;
                } else if (w.includes('\n')) {
                    // Count how many newlines are in this whitespace chunk
                    const newlineCount = (w.match(/\n/g) || []).length;
                    for (let i = 0; i < newlineCount; i++) {
                        words.push({ word: '\n', style: {} });
                    }
                    justAddedNewline = true;
                }
            }
        }
    }

    // Trim trailing newlines
    while (words.length > 0 && words[words.length - 1].word === '\n') {
        words.pop();
    }

    return words;
}
