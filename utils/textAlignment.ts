/**
 * ============================================================================
 * TEXT ALIGNMENT UTILITY FOR AI AUTO-SCROLL
 * ============================================================================
 *
 * PURPOSE:
 * This module matches spoken words (from speech recognition) to words in a
 * script, allowing the teleprompter to automatically scroll to follow the speaker.
 *
 * HOW IT WORKS (Simple Explanation):
 * 1. The speech recognizer gives us a "transcript" of what the user said
 * 2. We take the LAST FEW WORDS from that transcript (usually 4 words)
 * 3. We search through the script to find where those words appear
 * 4. When we find a match, we return that position so the teleprompter can scroll there
 *
 * EXAMPLE:
 * - Script: "Hello everyone, welcome to our presentation today"
 * - User says: "welcome to our"
 * - We search for "welcome to our" in the script
 * - We find it at word positions 2-4 (0-indexed: hello=0, everyone=1, welcome=2...)
 * - We return position 4 so highlighting advances to "our"
 *
 * WHY WE LOOK AT THE LAST FEW WORDS:
 * Speech recognition builds up over time. If user says "Hello everyone welcome",
 * the transcript grows: "Hello" -> "Hello everyone" -> "Hello everyone welcome"
 * By looking at the LAST few words, we track where the user currently IS, not where they started.
 *
 * ============================================================================
 */

/**
 * Normalizes text for comparison by:
 * - Converting to lowercase (so "Hello" matches "hello")
 * - Removing punctuation (so "Hello!" matches "Hello")
 * - Trimming whitespace
 *
 * @param text - The text to normalize
 * @returns Cleaned text ready for comparison
 */
export function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')  // Remove anything that's not a letter, number, or space
        .trim();
}

/**
 * MAIN MATCHING FUNCTION
 *
 * Finds where in the script the user is currently speaking.
 *
 * @param scriptWords - Array of words from the script (e.g., ["Hello", "everyone", "welcome", ...])
 * @param transcript - What the speech recognizer heard (e.g., "welcome to our")
 * @param lastMatchIndex - Where we matched last time (to avoid jumping backwards accidentally)
 * @returns The index of the word the user is currently at
 *
 * ALGORITHM OVERVIEW:
 * 1. Take the last 4 words from the transcript
 * 2. Starting from lastMatchIndex (minus a small buffer for corrections), search forward
 * 3. For each position, compare the transcript words with script words at that position
 * 4. When we find a good enough match (>60% similarity), that's our new position
 */
export function findBestMatchIndex(
    scriptWords: string[],
    transcript: string,
    lastMatchIndex: number = 0,
    expandedSearch: boolean = false  // Set to true when user scrolled - search wider area
): number {
    // SAFETY: Handle empty array
    if (scriptWords.length === 0) return 0;

    // Step 1: Clean and split the transcript into words
    const normalizedTranscript = normalizeText(transcript);
    if (!normalizedTranscript) return lastMatchIndex;

    const transcriptWords = normalizedTranscript.split(/\s+/);

    // SAFETY: Don't match with fewer than 3 words - prevents jumping to wrong spots
    // when saying common words like "the" that appear multiple times
    if (transcriptWords.length < 3) {
        return lastMatchIndex;
    }

    // Step 2: Take only the LAST 4 words (this is our "search window")
    const searchWindow = transcriptWords.slice(-4);
    const searchString = searchWindow.join(' ');

    // Step 3: Define where to search in the script
    // - Normal mode: search 10 words ahead (prevents jumping to far positions)
    // - Expanded mode (after scroll): search 50 words to find where user is reading
    const SEARCH_AHEAD_LIMIT = expandedSearch ? 50 : 10;
    const startIndex = lastMatchIndex;
    const endIndex = Math.min(scriptWords.length, lastMatchIndex + SEARCH_AHEAD_LIMIT);

    // Step 4: Threshold
    // - Normal mode: 75% (strict matching)
    // - Expanded mode: 60% (more lenient to find the user after scroll)
    const isShortSearch = searchWindow.length < 3;
    const threshold = isShortSearch ? 0.95 : (expandedSearch ? 0.6 : 0.75);

    // Step 5: Slide through the LIMITED search window
    const actualWindowSize = Math.min(searchWindow.length, endIndex - startIndex);

    if (actualWindowSize <= 0) {
        return Math.min(lastMatchIndex, scriptWords.length - 1);
    }

    // Track best match within our limited window
    let bestIndex = lastMatchIndex;
    let bestScore = 0;

    for (let i = startIndex; i <= endIndex - actualWindowSize; i++) {
        const sliceLength = Math.min(searchWindow.length, scriptWords.length - i);
        const scriptSlice = scriptWords.slice(i, i + sliceLength).join(' ');
        const normalizedScriptSlice = normalizeText(scriptSlice);

        const similarity = compareStrings(searchString, normalizedScriptSlice);

        // Add proximity bonus: matches closer to current position get a boost
        // This helps prefer position 10 over position 25 when both match
        const distance = i - lastMatchIndex;
        const proximityBonus = Math.max(0, (SEARCH_AHEAD_LIMIT - distance) / SEARCH_AHEAD_LIMIT * 0.1);
        const finalScore = similarity + proximityBonus;

        if (similarity >= threshold && finalScore > bestScore) {
            bestScore = finalScore;
            bestIndex = i + sliceLength - 1;
        }
    }

    // SAFETY: Ensure return value is within bounds
    return Math.max(0, Math.min(bestIndex, scriptWords.length - 1));
}

/**
 * SIMILARITY COMPARISON
 *
 * Compares two strings to see how similar they are.
 * Returns a number between 0 (completely different) and 1 (identical).
 *
 * HOW IT WORKS:
 * - Split both strings into words
 * - For each word in string1, check if it appears in string2
 * - Exact position match = 1 point
 * - Present but wrong position = 0.4 points
 * - Missing = 0 points
 * - Final score = total points / number of words
 *
 * EXAMPLE:
 * s1 = "welcome to our presentation"
 * s2 = "welcome to our"
 * - "welcome" at position 0, matches s2 position 0 -> 1 point
 * - "to" at position 1, matches s2 position 1 -> 1 point
 * - "our" at position 2, matches s2 position 2 -> 1 point
 * - "presentation" at position 3, not in s2 -> 0 points
 * Score = 3/4 = 0.75
 */
function compareStrings(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0;

    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);

    let matches = 0;
    words1.forEach((word, idx) => {
        if (words2[idx] === word) {
            // Word is in the exact same position - full point
            matches += 1;
        } else if (words2.includes(word)) {
            // Word exists but in different position - partial credit
            // This handles minor word order variations
            matches += 0.4;
        }
        // If word doesn't exist at all, we add 0 (implicit)
    });

    return matches / words1.length;
}
