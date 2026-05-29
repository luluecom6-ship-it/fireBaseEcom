# Project Context: Version 8.0 (Operator Role & Driver Info Upgrades)

Whenever the user refers to **Version 8.0**, it refers to the application state as of May 29, 2026, with the following enhancements:

## Core Enhancements (v8.0)
1. **Operator Role Integration**:
   - Implemented a brand new full-visibility privileged role `operator`.
   - Operators possess access levels identical to `admin` across all critical operational pages (MatrixV2, Alerts, Orders, Search, OOS History, and Admin Control tables/dashboards).
   - Strict privilege boundary added: Operators are explicitly **prohibited** from accessing the `Settings` tab inside Admin Control, preserving system safety and segregation of duties.
2. **Order Hover Distance Accent (KM)**:
   - Added automated calculated geographic distance representation (`KM(distance)`) inside the Matrix order details tooltip popups.
   - Computes distance from geographic coordinate vectors dynamically and exposes it inline next to SKU/Item counts.
3. **Advanced Driver Timeline Progression**:
   - Replaced old generic "Driver Start Time (Going to Origin - Actual start)" with concrete granular actual progression parameters:
     - **Driver Reached Store**: Derived from `goingToOriginEnd`.
     - **Driver Collected Order**: Derived from `transferToDeliveryEnd`.
     - **Driver Reach to Customer**: Derived from `goingToDestinationEnd`.

## Previous Enhancements (v7.5 preserved)
1. **FCM Push Notifications & Service Worker**:
   - Implemented Firebase Cloud Messaging Service Worker (`public/sw.js`) for background native OS notifications.
   - Enhanced backend (`server.ts`) with robust API endpoints (`/api/admin/send-oos-push`) to securely broadcast FCM push alerts based on permissions ('admin', 'supervisor').
2. **OOS History Upgrades**:
   - Upgraded the Out-Of-Stock History UI (`OOSHistory.tsx`).
   - Integrated a direct action button inline for admin and supervisor users to trigger manual FCM push notifications for specific OOS items to targeted regional staff.

## Previous Enhancements (v7.3 preserved)
1. **Connectivity & Routing Integrity**:
   - **V1/V2 URL Separation**: Re-established strict separation between V1 and V2 Google Apps Script endpoints. Standard pages (Admin, Alerts, Attendance) are pinned to the stable V1 URL, while Matrix V2 utilizes both streams for superior data density.
   - **Proxy Error Shielding**: Enhanced `server.ts` and `/api/index.ts` with HTML detection logic to intercept "goog-script-error" or login-redirect pages, preventing frontend JSON parsing crashes.
   - **Service Resilience**: Updated `monitorService` and `proxy-gas` fallbacks to ensure zero-downtime during backend deployment shifts.

2. **Parsing & Data Safety**:
   - **JSON Sanitization**: Implemented robust text-to-JSON validation in `useAlerts` and `AttendanceHistory` hooks. The system now gracefully handles and logs malformed responses instead of breaking the UI.
   - **Intelligent Deduplication**: Refined the merging logic for V1/V2 data in the background monitor, ensuring V2 data updates take priority without losing legacy storefront visibility.

3. **Maintenance & Cleanup**:
   - Fixed the "Unexpected token '<'" error caused by backend HTML output.
   - Restored original timezone-aware logic for Admin filtering as per user preference.

## Previous Enhancements (v7.2 preserved)
1. **Critical System Recovery**:
   - **Structural Alignment**: Restored missing structural files (`/src/lib/utils.ts`, `/src/utils/imageUtils.ts`, `/src/components/Matrix/MatrixTable.tsx`).
   - **Import Integrity**: Fixed broken relative imports across numerous pages.

## Previous Enhancements (v7.1 preserved)
1. **Regional Mapping Intelligence**:
   - **Unified Store-Region Mapping**: Integrated data from Admin Control to map stores to their respective regions.
   - **Regional Filtering & Badges**: Added region-specific filtering logic and visual badges.

2. **Temporal Alignment**:
   - **Regional UTC Offsets**: Implemented intelligent timezone offsets for Scheduled Commerce slots.

## Technical Architecture
- **Frontend**: React 18+, Vite, Tailwind CSS, Framer Motion.
- **Backend**: Hybrid Google Apps Script + Firebase Firestore.
- **Proxy Layer**: Robust Node.js Express proxy with HTML-intercept capability.

## Persistence Instruction
This file serves as the definitive reference for Version 7.5. All future modifications should build upon this baseline unless otherwise specified.
