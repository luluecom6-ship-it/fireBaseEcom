# Project Context: Version 7.2 (System Stability & Structural Integrity)

Whenever the user refers to **Version 7.2**, it refers to the application state as of May 17, 2026, with the following enhancements:

## Core Enhancements (v7.2)
1. **Critical System Recovery**:
   - **Structural Alignment**: Restored missing structural files (`/src/lib/utils.ts`, `/src/utils/imageUtils.ts`, `/src/components/Matrix/MatrixTable.tsx`) that were causing build failures and loading issues.
   - **Import Integrity**: Fixed broken relative imports across numerous pages (Matrix, Admin, Alerts, etc.) to ensure reliable module resolution.

2. **Regional Mapping Intelligence (v7.1 baseline)**:
   - **Unified Store-Region Mapping**: Integrated data from Admin Control to map stores to their respective regions (UAE, KSA, India, etc.).
   - **Regional Filtering & Badges**: Added region-specific filtering logic to the Management view and visual region badges to store cards for instant geographic context.

3. **Temporal Alignment (Timezone Precision)**:
   - **Regional UTC Offsets**: Implemented intelligent timezone offsets for Scheduled Commerce delivery slots (UTC+4 for UAE/Oman, UTC+3 for KSA/Qatar, UTC+5.5 for India).
   - **Source-Corrected Bucketing**: Fixed "slot shifting" where orders appeared in incorrect time buckets due to UTC/Local time mismatches.

4. **UI Accessibility & Reliability**:
   - **Dark-Mode Contrast Fix**: Optimized filter dropdown styling with high-contrast backgrounds and visible text for selection menus.
   - **Dynamic Source Tagging**: Corrected "Order Source" logic in Recent Orders lists, using dynamic, color-coded tags (Emerald for EXPRESS, Blue for SCHEDULE) that accurately reflect real-time order data.
   - **Navigation Integrity**: Restored functional back-linkage from Store Detail views to the primary Management dashboard.

## Previous Enhancements (v7.1 preserved)
1. **High-Fidelity Order Lifecycle**:
   - **12-Box Breakdown**: Comprehensive lifecycle matrix tracking from Order Created to Multi-stage Delivery.
   - **Wait-Time Intelligence**: Calculation of Picker vs. Driver wait times using synchronized timestamps.
   - **Personnel Metrics**: Real-time integration of Picker and Driver fleet info with instant status mapping.

2. **Intelligent Item Intelligence**:
   - **Phase-Aware Rendering**: Product photos are shown during active picking statuses (Created, Picking, Packing) to support live verification.
   - **Performance Switch**: Once picking is complete, images are hidden from the primary list to optimize load speed but remain accessible via a "View Image" clickable link on the item name.
   - **Unified Photo Mapping**: Robust detection across `photo_url`, `image_url`, and legacy source keys for 100% item visibility.

3. **Modernized Store Operations (v2)**:
   - **Three-Tier Navigation**: Unified header with breadcrumbs and active state tabs for "Management", "Store Level", and "Operations".
   - **Metric Dashboard**: High-contrast tiles for Quick Commerce, Scheduled Commerce, and Total volume summary.
   - **Interactive Distribution**: Status distribution bars now serve as primary filters for the "Recent Orders" list within the store detail view.

4. **Matrix & Grid Intelligence**:
   - **Cross-Link Navigation**: Integrated `onOrderClick` functionality across all distribution views (Quick Commerce Store View, Delivery Slot View, etc.), allowing direct deep-linking from popups into the high-detail Order Modal.

## Legacy Enhancements (v6.0 preserved)
1. **Unified Workforce Intelligence**:
   - **Real-time Verification**: "Staff Detail Modal" for viewing punch-in/out verification images and timestamps.
   - **Roster-Aware Attendance**: Synchronization between Roster Planner and Attendance logs for accurate KPI reporting.
   - **Store Coverage Intelligence**: Live "Off Today" counts alongside active and absent staff metrics.

## Technical Architecture
- **Frontend**: React 18+, Vite, Tailwind CSS, Framer Motion (motion/react).
- **Backend**: Hybrid approach using Google Apps Script (Legacy) and Firebase Firestore (Real-time Config).
- **Precision Styling**: Custom CSS scope (`.matrix-v2-scope`) for the Indigo/Slate "High-Tech Dashboard" aesthetic.

## Persistence Instruction
This file serves as the definitive reference for Version 7.2. All future modifications should build upon this baseline unless otherwise specified.
