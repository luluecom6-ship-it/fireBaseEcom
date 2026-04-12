# Project Context: Version 3.1

Whenever the user refers to **Version 3.1**, it refers to the application state as of April 12, 2026, with the following core features and structure:

## Core Features
1. **Matrix Intelligence Dashboard**:
   - Real-time tracking of Quick Commerce and Scheduled Commerce orders.
   - Ageing buckets (0-5 MIN, 5-10 MIN, etc.) with automatic calculation from timestamps.
   - Store-based filtering (defaults to user's store for non-admins).
   - Normalized key matching for robust data display.

2. **Biometric Attendance System**:
   - Facial verification via camera or manual upload.
   - **24-Hour Reset Logic**: Automatically resets attendance status if a punch-out is missing after 24 hours or if a new calendar day starts after a 16h shift.
   - Real-time hours worked calculation and shift progress tracking.
   - Automatic redirect to home page after successful punch.

3. **Attendance History**:
   - Available for all roles (Picker, Store, Manager, Supervisor, Admin).
   - Monthly filtering and grouping by date.
   - Detailed view of punch images and verification timestamps.

4. **Order Management**:
   - Barcode scanning/manual entry for Order IDs.
   - Duplicate detection with detailed "Existing Order" information.
   - Search functionality with role-based visibility.

5. **Alert & Escalation System**:
   - Real-time alert logs with buzzer notifications.
   - Manager acknowledgment workflow.
   - Configurable escalation rules and system parameters.

## Technical Architecture
- **Frontend**: React 18+, Vite, Tailwind CSS, Framer Motion (motion/react).
- **State Management**: Custom hooks (`useAuth`, `useAttendance`, `useMatrixData`, `useOrders`, `useAlerts`, `useAdmin`).
- **API Integration**: `robustFetch` utility with retry logic and `parseServerDate` for cross-platform date handling.
- **Navigation**: State-based routing within `App.tsx`.

## Persistence Instruction
This file serves as the definitive reference for Version 3.1. All future modifications should build upon this baseline unless otherwise specified.
