/**
 * Estimates the vertical scroll position (Y) for a given character index in the plain text script.
 * This accounts for:
 * - Line wrapping based on font size and container width
 * - Newline characters forcing new lines
 * - Margins/padding
 */
export function estimateScrollY(
    charIndex: number,
    plainText: string,
    contentHeight: number,
    layoutConfig: {
        fontSize: number;
        windowWidth: number;
        isLandscape: boolean;
        scriptMargin: number;
    }
): number {
    // Normalize newlines
    const normalizedText = plainText?.replace(/\r\n/g, '\n') || '';

    if (!normalizedText || contentHeight <= 0) return 0;

    const { fontSize, windowWidth, isLandscape, scriptMargin } = layoutConfig;

    // Layout constants matching the renderer
    const sidePadding = isLandscape ? 60 : 24;
    const totalHorizontalPadding = (sidePadding * 2) + (scriptMargin * 2);
    const availableWidth = windowWidth - totalHorizontalPadding;

    // Approximate char width (0.32 is empirically tuned to match widely used rendering metrics)
    const effectiveFontSize = fontSize * 8 + 16;
    const charWidth = effectiveFontSize * 0.32;
    const charsPerLine = Math.max(10, availableWidth / charWidth);

    const lines = normalizedText.split('\n');

    // FIRST PASS: Calculate total visual lines
    let totalVisualLines = 0;
    for (const line of lines) {
        const lineLength = line.length;
        const visualLinesInSegment = Math.max(1, Math.ceil(lineLength / charsPerLine));
        totalVisualLines += visualLinesInSegment;
    }

    if (totalVisualLines === 0) return 0;

    // SECOND PASS: Find target line for charIndex
    let currentLineCount = 0;
    let targetLineCount = 0;
    let currentCharCount = 0;
    let foundMatch = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineLength = line.length;
        const visualLinesInSegment = Math.max(1, Math.ceil(lineLength / charsPerLine));
        const segmentEnd = currentCharCount + lineLength + 1;

        if (charIndex >= currentCharCount && charIndex < segmentEnd) {
            const offsetInLine = Math.max(0, charIndex - currentCharCount);
            const effectiveOffset = Math.min(offsetInLine, lineLength);
            const linesBeforeInSegment = Math.floor(effectiveOffset / charsPerLine);
            targetLineCount = currentLineCount + linesBeforeInSegment;
            foundMatch = true;
            break;
        }

        currentLineCount += visualLinesInSegment;
        currentCharCount = segmentEnd;
    }

    // If charIndex is past the end (and we didn't find it), point to last line
    if (!foundMatch && charIndex >= currentCharCount) {
        targetLineCount = totalVisualLines - 1;
    }

    // Calculate progress using TOTAL visual lines (not partial count)
    const estimatedProgress = Math.min(1, targetLineCount / totalVisualLines);
    return -(estimatedProgress * contentHeight);
}

/**
 * Reverse of estimateScrollY: Given a scroll position, estimates the character index at that position.
 * This is useful for finding which word is at the center of the screen after manually scrolling.
 */
export function estimateCharFromScrollY(
    scrollY: number,
    plainText: string,
    contentHeight: number,
    layoutConfig: {
        fontSize: number;
        windowWidth: number;
        isLandscape: boolean;
        scriptMargin: number;
    }
): number {
    // Normalize newlines
    const normalizedText = plainText?.replace(/\r\n/g, '\n') || '';

    if (!normalizedText || contentHeight <= 0) return 0;

    const { fontSize, windowWidth, isLandscape, scriptMargin } = layoutConfig;

    // Layout constants matching the renderer
    const sidePadding = isLandscape ? 60 : 24;
    const totalHorizontalPadding = (sidePadding * 2) + (scriptMargin * 2);
    const availableWidth = windowWidth - totalHorizontalPadding;

    // Approximate char width
    const effectiveFontSize = fontSize * 8 + 16;
    const charWidth = effectiveFontSize * 0.32;
    const charsPerLine = Math.max(10, availableWidth / charWidth);

    // Calculate target visual line from scroll position
    const scrollProgress = Math.abs(scrollY) / contentHeight;

    const lines = normalizedText.split('\n');
    let totalVisualLines = 0;

    // First pass: count total visual lines
    for (const line of lines) {
        const visualLinesInSegment = Math.max(1, Math.ceil(line.length / charsPerLine));
        totalVisualLines += visualLinesInSegment;
    }

    const targetVisualLine = Math.floor(scrollProgress * totalVisualLines);

    // Second pass: find the character at that visual line
    let currentVisualLine = 0;
    let currentCharIndex = 0;

    for (const line of lines) {
        const lineLength = line.length;
        const visualLinesInSegment = Math.max(1, Math.ceil(lineLength / charsPerLine));

        if (currentVisualLine + visualLinesInSegment > targetVisualLine) {
            // Target is in this segment
            const linesIntoSegment = targetVisualLine - currentVisualLine;
            const charOffset = linesIntoSegment * charsPerLine;
            return currentCharIndex + Math.min(charOffset, lineLength);
        }

        currentVisualLine += visualLinesInSegment;
        currentCharIndex += lineLength + 1; // +1 for newline
    }

    return normalizedText.length;
}
