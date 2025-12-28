/**
 * Normalizes text for comparison (lowercase, alphanumeric only)
 */
export function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim();
}

/**
 * Finds the index of the word in the "words" array that best matches the end of the "transcript"
 */
export function findBestMatchIndex(
    scriptWords: string[],
    transcript: string,
    lastMatchIndex: number = 0
): number {
    const normalizedTranscript = normalizeText(transcript);
    if (!normalizedTranscript) return lastMatchIndex;

    const transcriptWords = normalizedTranscript.split(/\s+/);
    // Take the last 4 words of transcript to find our current position
    const searchWindow = transcriptWords.slice(-4);
    const searchString = searchWindow.join(' ');

    // We look ahead from lastMatchIndex to avoid jumping backwards too much
    // but we allow some backtracking for corrections (e.g., -10 words)
    const startIndex = Math.max(0, lastMatchIndex - 5);
    const windowSize = 100; // Search window in the script
    const endIndex = Math.min(scriptWords.length, startIndex + windowSize);

    let bestIndex = lastMatchIndex;
    let maxSimilarity = 0;

    // Minimum window size to avoid jumping on single words like "a" or "the"
    const isShortSearch = searchWindow.length < 3;
    const threshold = isShortSearch ? 0.95 : 0.6;

    for (let i = startIndex; i < endIndex - searchWindow.length + 1; i++) {
        const scriptSlice = scriptWords.slice(i, i + searchWindow.length).join(' ');
        const similarity = compareStrings(searchString, scriptSlice);

        // Recency Bias: tie-break by preferring the match that is further along in the script
        if (similarity >= threshold && similarity >= maxSimilarity) {
            maxSimilarity = similarity;
            bestIndex = i + searchWindow.length - 1;
        }
    }

    return bestIndex;
}

/**
 * Similarity check based on word overlap
 */
function compareStrings(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0;

    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);

    let matches = 0;
    words1.forEach((w, idx) => {
        // Strict order match gets 1 point
        if (words2[idx] === w) {
            matches += 1;
        }
        // Present but out of order gets 0.4 points
        else if (words2.includes(w)) {
            matches += 0.4;
        }
    });

    return matches / words1.length;
}
