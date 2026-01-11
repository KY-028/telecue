import { TextStyle } from 'react-native';

export interface StyledSegment {
    text: string;           // The exact text (preserving all spacing)
    style: TextStyle;
    startIndex: number;     // Start index in the plain text
    endIndex: number;       // End index in the plain text (exclusive)
}

// Legacy interface for backward compatibility with AI scrolling
export interface StyledWord {
    word: string;
    style: TextStyle;
    startIndex: number;
    endIndex: number;
}

/**
 * Parses simple HTML content from TenTap editor into a list of styled segments.
 * IMPORTANT: This preserves EXACT text content including all whitespace.
 * Supports: <b>, <strong>, <i>, <em>, <u>, <span style="color:...">
 */
export function parseHtmlToStyledSegments(html: string): { segments: StyledSegment[]; plainText: string } {
    if (!html) return { segments: [], plainText: '' };

    // 1. Tokenize HTML by tags
    const tokens = html.split(/(<[^>]+>)/g).filter(t => t.length > 0);

    const segments: StyledSegment[] = [];
    let currentStyle: TextStyle = {};
    const styleStack: TextStyle[] = [];
    let plainText = '';
    let currentIndex = 0;

    // Track if we need to add a newline for block elements
    let pendingNewline = false;

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

    // Helper to add a segment
    const addSegment = (text: string, style: TextStyle) => {
        if (text.length === 0) return;
        segments.push({
            text,
            style: { ...style },
            startIndex: currentIndex,
            endIndex: currentIndex + text.length
        });
        plainText += text;
        currentIndex += text.length;
    };

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

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

                // Block level elements (p, div) - add newline after closing
                if (tagName === 'p' || tagName === 'div') {
                    pendingNewline = true;
                }
            } else {
                // Opening Tag

                // If this is a block tag (p, div, br) and we are not at start, 
                // ensure we have a newline separator if one isn't pending.
                // This fixes "Line 1<div>Line 2</div>" merging.
                const isBlockStart = tagName === 'p' || tagName === 'div';
                if (isBlockStart && currentIndex > 0 && !pendingNewline) {
                    addSegment('\n', {});
                }

                // Add pending newline before new content (but not at start)
                if (pendingNewline && currentIndex > 0) {
                    addSegment('\n', {});
                    pendingNewline = false;
                }

                // Push style
                let newStyle: TextStyle = { ...currentStyle };

                if (tagName === 'b' || tagName === 'strong') {
                    newStyle.fontWeight = '900';
                } else if (tagName === 'i' || tagName === 'em') {
                    newStyle.fontStyle = 'italic';
                } else if (tagName === 'u') {
                    newStyle.textDecorationLine = 'underline';
                } else if (tagName === 'font') {
                    const match = token.match(/color="([^"]+)"/);
                    if (match && match[1]) {
                        newStyle.color = match[1];
                    }
                } else if (tagName === 'span') {
                    const match = token.match(/style="([^"]+)"/);
                    if (match && match[1]) {
                        const spanStyle = parseInlineStyle(match[1]);
                        newStyle = { ...newStyle, ...spanStyle };
                    }
                }

                // Handle <br> as self-closing newline
                if (tagName === 'br') {
                    // Check lookahead: if <br> is followed by closing block tag, ignore it
                    let ignoreBr = false;
                    if (i + 1 < tokens.length) {
                        const nextToken = tokens[i + 1];
                        if (nextToken.startsWith('</')) {
                            const nextTagName = nextToken.replace(/[</>]/g, '').split(' ')[0].toLowerCase();
                            if (nextTagName === 'p' || nextTagName === 'div') {
                                ignoreBr = true;
                            }
                        }
                    }

                    if (!ignoreBr) {
                        addSegment('\n', {});
                    }
                }

                styleStack.push(newStyle);
                currentStyle = newStyle;
            }
        } else {
            // Text Content

            // Check if text is just whitespace
            const isWhitespace = !token.trim();

            // If we have a pending newline from a previous block close,
            // and this text is just whitespace (e.g. pretty-printed HTML indentation),
            // IGNORE IT. Don't flush pendingNewline yet.
            if (pendingNewline && isWhitespace) {
                continue;
            }

            // Add pending newline before real text content
            if (pendingNewline && currentIndex > 0) {
                addSegment('\n', {});
                pendingNewline = false;
            }

            // Decode entities - preserve ALL whitespace exactly
            const decodedText = token
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"');

            // Add the text as a single segment with current style
            if (decodedText.length > 0) {
                addSegment(decodedText, currentStyle);
            }
        }
    }

    // Trim trailing newlines from segments
    while (segments.length > 0 && segments[segments.length - 1].text === '\n') {
        const removed = segments.pop()!;
        plainText = plainText.slice(0, -removed.text.length);
    }

    return { segments, plainText };
}

/**
 * Legacy function for backward compatibility with AI scrolling.
 * This extracts words (for matching purposes) while still preserving styling info.
 */
export function parseHtmlToStyledWords(html: string): StyledWord[] {
    const { segments } = parseHtmlToStyledSegments(html);
    const words: StyledWord[] = [];

    for (const segment of segments) {
        // Split segment text into words, preserving each word's style
        // For AI matching, we need individual words
        const segmentWords = segment.text.split(/(\s+)/);
        let currentOffset = 0;

        for (const w of segmentWords) {
            const wordLen = w.length;
            if (w.length > 0 && w.trim().length > 0) {
                words.push({
                    word: w,
                    style: segment.style,
                    startIndex: segment.startIndex + currentOffset,
                    endIndex: segment.startIndex + currentOffset + wordLen
                });
            } else if (w === '\n' || (w.includes('\n'))) {
                words.push({
                    word: '\n',
                    style: {},
                    startIndex: segment.startIndex + currentOffset,
                    endIndex: segment.startIndex + currentOffset + wordLen
                });
            }
            currentOffset += wordLen;
        }
    }

    return words;
}
