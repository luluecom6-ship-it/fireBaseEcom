# Project Context: Version 4.1 (Granular Alert Configuration)

Whenever the user refers to **Version 4.1**, it refers to the application state as of April 16, 2026, with the following core features and structure:

## Core Features
1. **Matrix Intelligence Dashboard**:
   - Real-time tracking of Quick Commerce and Scheduled Commerce orders.
   - Ageing buckets (0-5 MIN, 5-10 MIN, etc.) with automatic calculation from timestamps.
   - Store-based filtering (defaults to user's store for non-admins).
   - Normalized key matching for robust data display.

2. **Advanced Alerting System**:
   - **Quick Commerce**: Continuous alerting that re-triggers on ageing bucket transitions if status remains unchanged. Supports "at least" bucket matching thresholds and region-wise selection.
   - **Scheduled Commerce**: Enhanced logic for past slots (instant alert) and running slots (prep/delivery alerts). 
   - **Configurable Toggles**: Admins can now independently enable/disable "Past Slot" and "Running Slot" alert conditions.
   - **Regional Filtering**: Added region-wise selection for scheduled alerts, ensuring alerts are only broadcasted for configured areas (e.g., KSA-CR, KSA-ER).
   - **Visual Distinction**: Indigo theme for Scheduled alerts, Amber for Quick alerts, and Red for Escalated alerts.

3. **Backend Monitor & FCM**:
   - **System Supervisor**: A 24/7 background worker running in the cloud (Express server) that polls the Google Sheet every 60 seconds.
   - **Independent Alerting**: Detects alerts using the same logic as the frontend, ensuring notifications are triggered even if no user has the app open.
   - **Real Push Notifications**: Uses Firebase Admin SDK to send FCM push notifications to all registered devices.
   - **FCM Tokens**: Automatically registers and updates device tokens in the `fcm_tokens` Firestore collection.

4. **Programmatic Buzzer System**:
   - **Mathematical Sound**: Web Audio API generated sounds for 100% reliability.
   - **Audio Unlock**: Aggressive visual overlay to prompt user interaction for browser autoplay compliance.

5. **Biometric Attendance & Admin Control**:
   - **Supervisor Access**: Supervisors can now access the Admin Control page to view daily orders, active staff, and reset attendance.
   - **Facial Verification**: Facial verification via camera or manual upload.
   - **24-Hour Reset**: Automatic reset of attendance status if punch-out is missing after 24 hours.

## Technical Architecture
- **Frontend**: React 18+, Vite, Tailwind CSS, Framer Motion (motion/react).
- **Backend**: Hybrid approach using Google Apps Script (Legacy) and Firebase Firestore (Real-time Config).
- **State Management**: Custom hooks with Firestore `onSnapshot` for live updates.
- **PWA/Service Worker**: `manifest.json` for app identity, `sw.js` for caching, and `firebase-messaging-sw.js` for FCM.
- **Deployment**: Configured for Vercel (Project: `fire-base-ecom`, ID: `prj_tz4mVBUk0Lbrz0KxK190eWmOqIKQ`).

## Persistence Instruction
This file serves as the definitive reference for Version 4.1. All future modifications should build upon this baseline unless otherwise specified.
