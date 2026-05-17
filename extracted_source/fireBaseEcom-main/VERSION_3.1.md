# Matrix Intelligence & Attendance System - Version 3.1

This document summarizes the complete feature set and technical specifications of Version 3.1.

## 1. Dashboard & Navigation
- **Role-Based UI**: Dynamic action tiles based on user roles (Admin, Supervisor, Manager, Store, Picker, Driver).
- **Real-Time Clock**: Synchronized time display for operational accuracy.
- **Shift Tracking**: Live display of hours worked and progress towards shift targets.

## 2. Attendance Module
- **Biometric Verification**: Camera-based selfie capture with fallback for manual upload.
- **Smart Punch Logic**:
  - Detects current state (In/Out) and toggles accordingly.
  - **24h Auto-Reset**: Prevents users from being stuck in "Punched In" state if they forget to clock out.
  - **Missing Punch Warning**: Notifies users when a session was reset due to a missing punch-out.
- **History View**: Dedicated page for users to audit their own attendance logs, images, and durations.

## 3. Matrix Intelligence
- **Data Aggregation**: Combines Quick and Scheduled commerce data into a unified grid.
- **Dynamic Ageing**: Orders are automatically bucketed into time slots (0-5m, 5-10m, etc.) based on their creation time.
- **Deep Dive**: Ability to click any cell in the matrix to see the specific orders contributing to that metric.

## 4. Order Evidence
- **Upload**: Fast upload with barcode validation.
- **Duplicate Prevention**: Real-time check against existing orders to prevent double-processing.
- **Search**: Robust search by Order ID with image verification.

## 5. Alerts & Admin
- **Escalation Engine**: Automatically triggers alerts based on order ageing.
- **Buzzer System**: Visual and auditory (simulated) cues for urgent alerts.
- **Admin Panel**: Centralized control for staff management, attendance resets, and system configuration.

## 6. Technical Specifications
- **Framework**: React (TypeScript)
- **Styling**: Tailwind CSS (Utility-first)
- **Animations**: Framer Motion (Fluid transitions)
- **API**: GAS/Web App backend integration via `robustFetch`.
- **Date Handling**: UTC-normalized parsing via `parseServerDate`.

---
*End of Version 3.1 Specification*
