import { Dimensions } from 'react-native';

export const breakText = (text: string, fontSize: number, containerWidth: number) => {
    // Heuristic: Average character width is ~0.6 of the font size for standard sans-serif fonts
    // This is an approximation. For perfect results, a monospace font is recommended.
    const CHAR_WIDTH_RATIO = 0.55; 
    const charWidth = fontSize * CHAR_WIDTH_RATIO;
    const maxCharsPerLine = Math.floor(containerWidth / charWidth);

    if (maxCharsPerLine <= 0) return [text];

    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
        const word = words[i];

        // If it's the first word of the line
        if (currentLine.length === 0) {
            if (word.length <= maxCharsPerLine) {
                currentLine = word;
            } else {
                // Word is longer than the line, need to split it
                let remainingWord = word;
                while (remainingWord.length > maxCharsPerLine) {
                    // Take as much as fits
                    const chunk = remainingWord.slice(0, maxCharsPerLine);
                    lines.push(chunk);
                    remainingWord = '-' + remainingWord.slice(maxCharsPerLine);
                }
                currentLine = remainingWord;
            }
        } else {
            // Check if word fits in current line (plus space)
            if (currentLine.length + 1 + word.length <= maxCharsPerLine) {
                currentLine += ' ' + word;
            } else {
                // Push current line and start new one
                lines.push(currentLine);
                
                // Now handle the word for the new line
                if (word.length <= maxCharsPerLine) {
                    currentLine = word;
                } else {
                    // Word is longer than the line, split it
                    let remainingWord = word;
                    while (remainingWord.length > maxCharsPerLine) {
                        const chunk = remainingWord.slice(0, maxCharsPerLine);
                        lines.push(chunk);
                        remainingWord = '-' + remainingWord.slice(maxCharsPerLine);
                    }
                    currentLine = remainingWord;
                }
            }
        }
    }

    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    return lines;
};
