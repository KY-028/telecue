# TeleCue Project Instructions

## 1. Project Overview
**TeleCue** is a professional-grade mobile teleprompter application built for modern creators. It enables users to write scripts, configure display settings (speed, margins, minoring), and record directly from their device or use it with an external mirror rig.

### Core Philosophy
- **Privacy-First**: All data is stored locally using SQLite.
- **Performance**: High frame-rate scrolling using Reanimated.
- **Native-Feel**: Uses native components and gestures for a premium iOS/Android experience.

## 2. Technology Stack
- **Framework**: Expo (SDK 54) & React Native (0.81) via New Architecture.
- **Router**: Expo Router (File-based routing).
- **Styling**: NativeWind v4 (Tailwind CSS for React Native).
- **State Management**: Zustand.
- **Persistence**: Expo SQLite.
- **Animation**: React Native Reanimated.
- **Icons**: Lucide React Native.

## 3. Key Features & Implementation Status

### ✅ Teleprompter 2.0 (Live)
The prompter screen (`app/prompter.tsx`) has been completely overhauled:
- **Smart Orientation**: 
  - **Phone Mode**: The user records as the text appears on top of the camera view.
  - **Rig Mode**: Only the text is visible to the user.
- **Dynamic Scrolling Engine**: Measures full content height to ensure text scrolls 100% off-screen without truncation.
- **Floating Controls**: 
  - Transparent overlay that sits *above* text.
  - **Speed Slider**: Real-time adjustment (1.0x - 10.0x).
  - **Progress Bar**: Orange indicator mapping actual read percentage.
  - **Media Keys**: Rewind (Start), Play/Pause, Forward (End).
- **Navigation**: Dedicated "Back" (Top-Left) and "Done" (Bottom-Right) buttons.

### ✅ Editor & Persistence
- **Script Management**: `new script` resets session; `recents` loads from DB.
- **Auto-Save**: Scripts are auto-saved to SQLite when navigating away (Back button).
- **Interactive Setup**: Full-width preview with visual margin indicators (`app/setup.tsx`).

## 4. Setup & Running
1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Start Development Server**:
   ```bash
   npx expo start -c
   ```
   *Note: `-c` clears cache, recommended when changing NativeWind/Babel configs.*

## 5. Directory Structure
```
/app                 # Expo Router Screens
  ├── index.tsx      # Home
  ├── editor.tsx     # Script Editor
  ├── setup.tsx      # Configuration & Preview
  ├── recents.tsx    # Saved Scripts List
  └── prompter.tsx   # Main Teleprompter Screen (Logic + UI)
/src
  ├── db             # SQLite Schema & Init
  └── store          # Zustand Stores (useScriptStore)
/components          # Reusable UI Components
```

## 6. Known "Gotchas"
- **Expo Camera**: Requires permissions. If testing on Simulator, the camera view will be black but controls still work.
- **Orientation**: The app explicitly locks orientation in the prompter. It attempts to *unlock* before locking to avoid state conflicts.
- **Reanimated**: If you see crash on reload, it's often due to shared value re-initialization. Hot reload usually works fine.

## 7. Next Steps (Roadmap)
- [ ] **Voice Activation**: Scroll based on speech recognition.
- [ ] **Cloud Sync**: Optional backup for scripts.
- [ ] **Themes**: Dark/Light mode toggles (currently Dark-first).
