# TeleCue Development Plan

This document outlines the development roadmap for TeleCue, focusing on stability improvements, new recording features, and advanced prompter capabilities.

## 1. Stability & Core Improvements

### 1.1. Fix Portrait Mode Orientation

**Feature Name:** `OrientationLockFix`
**Description:**
Ensure the app correctly switches between Portrait (for Phone Mode) and Landscape (for Monitor/Teleprompter Mode) without getting stuck or crashing.
**Resources:**

- [Expo Screen Orientation Documentation](https://docs.expo.dev/versions/latest/sdk/screen-orientation/)
  **Implementation Plan:**
- Verify `app.json` allows `default` or `all` orientations, not just `portrait`.
- In `prompter.tsx`, ensure `ScreenOrientation.lockAsync()` is awaited and wrapped in a `try-catch` block.
- Add a cleanup function in `useEffect` to reset orientation to `PORTRAIT_UP` when leaving the prompter.

**Estimated Time:** 1-2 Hours

### 1.2. Fix Text Truncation Issue

**Feature Name:** `InfiniteScrollLayout`
**Description:**
Fix the issue where long scripts are cut off or "float" incorrectly in the prompter view. This usually happens because standard `View` components have rendering limits or `onLayout` doesn't capture the full scrollable height of very long text.
**Implementation Plan:**

- Replace the outer `View` container for the text with a `ScrollView` (even if we drive scrolling programmatically via Reanimated).
- Ensure the `contentContainerStyle` of the ScrollView allows for infinite growth.
- Verify `onLayout` is attached to the inner text container to calculate the exact scroll distance required.

**Estimated Time:** 2-3 Hours

### 1.3. "Done" / Home Button

**Feature Name:** `QuickExitNav`
**Description:**
Add a clear "Done" or "Home" button in the prompter view to allow users to quickly exit the session and return to the main script list.
**Implementation Plan:**

- Add a `TouchableOpacity` with a "Home" or "Check" icon in the top-right or bottom control bar.
- Use `router.dismissAll()` or `router.replace('/')` to reset the navigation stack.

**Estimated Time:** 30 Minutes

---

## 2. UI/UX Enhancements

### 2.1. Enhanced Floating Control Bar

**Feature Name:** `HUDControls`
**Description:**
Redesign the bottom floating bar in `prompter.tsx` to be less intrusive but more functional. It should include playback progress, speed control, and quick toggles (mirror, font size) without blocking the text.
**Implementation Plan:**

- Create a collapsible panel using Reanimated.
- **Collapsed State:** Shows only Play/Pause and Progress Bar.
- **Expanded State:** Shows Speed Slider, Font Size, and Mirror Toggles.
- Use a semi-transparent blur background (`expo-blur` if available, or semi-transparent black).

**Estimated Time:** 4-6 Hours

---

## 3. Recording Features ("Record with this phone")

### 3.1. Camera Setup & Permissions

**Feature Name:** `CameraSetupFlow`
**Description:**
In `setup.tsx`, allow the user to preview the camera, grant permissions, and select which camera to use (Front/Back) before entering the prompter.
**Resources:**

- [Expo Camera Documentation](https://docs.expo.dev/versions/latest/sdk/camera/)
  **Implementation Plan:**
- Add a "Test Camera" section in `setup.tsx` when "Phone Mode" is selected.
- Check and request `Camera` and `Microphone` permissions.
- Store the preferred camera facing (front/back) in the store.

**Estimated Time:** 2-3 Hours

### 3.2. In-Prompter Recording UI

**Feature Name:** `PrompterRecorder`
**Description:**
Implement the actual video recording functionality inside `prompter.tsx`. The text should overlay the camera feed, and the user should be able to start/stop recording.
**Resources:**

- [Expo Media Library](https://docs.expo.dev/versions/latest/sdk/media-library/) (for saving videos)
  **Implementation Plan:**
- Use `useCameraRef` to access the camera instance.
- Add a "Record" button (distinct from "Play Script").
- **Logic:**
  1. User presses "Record" -> Camera starts recording.
  2. Script automatically starts scrolling (optional setting).
  3. User presses "Stop" -> Camera stops -> Video is saved to gallery.
- Handle audio permissions and ensure audio is recorded.

**Estimated Time:** 5-8 Hours

---

## 4. Advanced Teleprompter Features

### 4.1. Advanced Speed Modes

**Feature Name:** `SmartPacing`
**Description:**
Allow users to define speed not just by an arbitrary slider (1-10), but by:

- **WPM (Words Per Minute):** Calculate scroll speed based on word count.
- **Total Time:** User sets "I want to read this in 2 minutes", app calculates speed.
  **Implementation Plan:**
- **Math:**
  - $Time = \frac{WordCount}{WPM}$
  - $ScrollSpeed (px/sec) = \frac{TotalHeight}{Time}$
- Add a UI selector in `setup.tsx` or the floating bar to switch between "Slider", "WPM", and "Timer" modes.

**Estimated Time:** 3-4 Hours

### 4.2. Automatic Speed (Voice Activated)

**Feature Name:** `VoiceFlow`
**Description:**
The prompter listens to the user's voice and scrolls automatically as they read.
**Complexity Warning:** This is a complex feature.
**Resources:**

- **Option A (Native):** `@react-native-voice/voice` (Requires Development Build / Prebuild).
- **Option B (Cloud):** OpenAI Whisper (High latency, not suitable for real-time scrolling).
  **Implementation Plan (MVP):**
- **Phase 1 (Voice Activity Detection):** Use `expo-av` to detect volume levels. If volume > threshold, scroll. If silent, pause. This is easier and works in Expo Go.
- **Phase 2 (Speech Recognition):** Requires ejecting to a Development Build to use native speech recognition libraries.

**Estimated Time:** 10-15 Hours (for MVP)

### 4.3. AI Script Generation

**Feature Name:** `ScriptGenie`
**Description:**
Generate scripts based on a topic and tone using an LLM (e.g., OpenAI).
**Implementation Plan:**

- Create a simple modal: "Topic", "Tone" (Professional, Funny, Casual), "Length".
- Call OpenAI API (`POST https://api.openai.com/v1/chat/completions`).
- Populate the script editor with the result.

**Estimated Time:** 3-4 Hours

---

## Summary of Estimates

| Feature                          | Complexity | Est. Time  |
| :------------------------------- | :--------- | :--------- |
| **Fixes (Portrait/Truncation)**  | Low        | 3-5 Hours  |
| **UI Polish (Done Button, HUD)** | Medium     | 5-7 Hours  |
| **Recording (Setup + Prompter)** | High       | 7-11 Hours |
| **Advanced Speed (WPM/Timer)**   | Medium     | 3-4 Hours  |
| **Voice Flow (Auto Scroll)**     | Very High  | 10+ Hours  |
| **AI Generation**                | Medium     | 3-4 Hours  |

**Total Estimated Time:** ~30-40 Hours
