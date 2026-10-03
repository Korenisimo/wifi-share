# 📡 WiFi Share

A simple Android app that turns your phone into a WiFi file server. Share and stream media files to any device on the same network — no cloud, no accounts, no setup.

## How it works

1. Open the app on your Android phone
2. Tap **Start Server**
3. Open the displayed URL on any device (laptop, tablet, another phone)
4. Browse, stream, and download your files

## Requirements

- Android minimum SDK / target: as set by the Expo SDK version in package.json (`expo: ~57.0.9`) — app.json does not declare them explicitly
- Expo SDK: `~57.0.9` (from `dependencies.expo` in package.json)
- Both devices must be on the same Wi-Fi network

## Features

- 🎬 Stream videos directly in the browser
- 🖼️ View photos
- 🎵 Play audio
- ⬇️ Download any file
- 🔍 Filter by media type (video/photo/audio)
- 🌙 Dark theme

## Build

```bash
# Install deps
npm install

# Build APK locally
./build-local.sh

# Push to GitHub + build + distribute
./push.sh
```

## Tech

- Expo / React Native
- expo-http-server (embedded HTTP server)
- expo-media-library (access device media)
- expo-network (get WiFi IP)
