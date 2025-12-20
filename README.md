# TeleCue

**TeleCue** is a mobile-first teleprompter application that helps creators, presenters, and content creators deliver scripts flawlessly. Generate AI-powered scripts or use your own, then use the intelligent teleprompter to read smoothly on camera—available on iOS, Android, and web.

## Features

### 📝 Script Management

- **Manual Input**: Write or paste your own scripts
- **AI-Powered Script Generation** (Coming Soon): Generate scripts using customizable formats and tones

### 🎬 Teleprompter Modes

- **Phone Recording Mode**: Read directly from your device while recording
- **External Rig Mode**: Use with professional teleprompter setups
  - 5 font families
  - 5 font size levels
  - Adjustable margins (left/right)
  - Mirror text (horizontal/vertical flip)

### 🔄 Scrolling Options

- **Auto Scroll**: Speech recognition that syncs scrolling to your voice
- **Fixed Speed Scroll**: 5-speed manual control

### 🚀 Coming Soon

- **AI-Powered Script Generation**: Create scripts instantly with customizable formats (Speech, TikTok/Reels, YouTube Shorts, Ads, Sales Pitches) and tone of voice options

## Tech Stack

- **React Native** – Cross-platform development for iOS, Android, and web
- **Tailwind/Nativewind CSS** – Styling
- **SQLite** – Local storage for recent scripts

## Installation

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Xcode (for iOS) / Android Studio (for Android)

### Setup

```bash
git clone https://github.com/ky-028/TeleCue.git
cd TeleCue
npm install
# or yarn install

# Run on iOS
npx react-native run-ios

# Run on Android
npx react-native run-android

# Run on web
npm run web
```

## Usage

1. **Create a Script**: Create your script by writing or pasting text
2. **Configure Your Setup**: Choose phone recording or teleprompter rig
3. **Customize Display**: Adjust font, size, margins, and mirroring
4. **Start Presenting**: Use auto-scroll (voice-triggered) or fixed-speed scroll

## License

MIT License

## Support

Have questions or found a bug? [Open an issue](https://github.com/ky-028/TeleCue/issues)
