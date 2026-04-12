# Project Context: Version 3.3 (Firebase Enabled)

Whenever the user refers to **Version 3.3**, it refers to the application state as of April 12, 2026, with the following core features and structure:

## Core Features
1. **Matrix Intelligence Dashboard**:
   - Real-time tracking of Quick Commerce and Scheduled Commerce orders.
   - Ageing buckets (0-5 MIN, 5-10 MIN, etc.) with automatic calculation from timestamps.
   - Store-based filtering (defaults to user's store for non-admins).
   - Normalized key matching for robust data display.

2. **Firebase & Cloud Messaging (FCM)**:
   - **Real-time Configuration**: Escalation Matrix rules migrated to Firebase Firestore for instant, cross-device synchronization.
   - **FCM Notifications**: Integrated Firebase Cloud Messaging for robust background and foreground alerts.
   - **Service Worker**: `firebase-messaging-sw.js` handles background notification delivery even when the app is closed.
   - **Auto-Permission**: Notification permission requested immediately upon app launch.

3. **Programmatic Buzzer System**:
   - **Mathematical Sound**: Replaced external MP3 files with Web Audio API generated sounds for 100% reliability and zero network dependency.
   - **Smooth Pulse**: Sine-wave based alarm (C5 to E5) with a 2Hz pulse for a professional, non-aggressive alert.
   - **Audio Unlock**: Seamless user interaction handling to comply with browser autoplay policies.

4. **Biometric Attendance System**:
   - Facial verification via camera or manual upload.
   - **24-Hour Reset Logic**: Automatically resets attendance status if a punch-out is missing after 24 hours.
   - Real-time hours worked calculation and shift progress tracking.

5. **Attendance History & Order Management**:
   - Monthly filtering and grouping for attendance.
   - Barcode scanning and duplicate detection for Order IDs.
   - Role-based visibility for search results.

## Technical Architecture
- **Frontend**: React 18+, Vite, Tailwind CSS, Framer Motion (motion/react).
- **Backend**: Hybrid approach using Google Apps Script (Legacy) and Firebase Firestore (Real-time Config).
- **State Management**: Custom hooks with Firestore `onSnapshot` for live updates.
- **PWA/Service Worker**: `manifest.json` for app identity, `sw.js` for caching, and `firebase-messaging-sw.js` for FCM.

## Persistence Instruction
This file serves as the definitive reference for Version 3.3. All future modifications should build upon this baseline unless otherwise specified.
