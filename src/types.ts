export interface User {
  empId: string;
  name: string;
  role: 'picker' | 'supervisor' | 'driver' | 'admin' | 'user' | 'store' | 'manager';
  storeId: string;
  status: string;
  profileImage?: string;
  email?: string;
  region?: string;
  lastSeen?: any;
  soundAlertsEnabled?: boolean;
  shiftStart?: number;   // e.g. 6 = 6 AM
  shiftHours?: number;   // e.g. 8 | 10 | 12 (duration)
  weekOffDay?: string;   // e.g. "Friday"
}

// ─── Staff Dashboard Types ───────────────────────────────────────────────────

export interface StaffDashboardData {
  summary: {
    totalStores: number;
    totalStaff: number;
    activeNow: number;
    weekOff: number;
    notLoggedIn: number;
  };
  hourlyBreakdown: HourlySlot[];
  storeBreakdown: StoreSummary[];
  lastUpdated: string;
}

export interface HourlySlot {
  hour: number;
  label: string;
  active: number;
  weekOff: number;
  notStarted: number;
}

export interface StoreSummary {
  storeId: string;
  totalStaff: number;
  activeNow: number;
  weekOff: number;
  notStarted: number;
  staffTimeline: StaffTimeline[];
}

export interface StaffTimeline {
  empId: string;
  name: string;
  role: string;
  shiftStart: number;
  shiftHours: number;
  isActive: boolean;
  isWeekOff: boolean;
  punchedIn: boolean;
}

export interface AlertLog {
  id: string;
  timestamp: string;
  orderId: string;
  eventType: string;
  storeId: string;
  userId: string;
  notificationTime: string;
  storeStaffName: string;
  status: string; // Pending / Acknowledged
  escalation: string; // TRUE / FALSE
  managerName: string;
  statusTrigger: string;
  managerStatus: string; // Pending / Accepted
  orderCreatedAt: string;
  // UI Helpers
  triggeredAt: string; // mapped from timestamp
  bucket: string; // mapped from statusTrigger
}

export interface ActiveAlert extends AlertLog {
  buzzerStarted: boolean;
  managerBuzzerStarted: boolean;
}

export interface AttendanceRecord {
  empId: string;
  name: string;
  type: 'In' | 'Out';
  timestamp: string;
  imageUrl: string;
  storeId: string;
}

export interface OrderRecord {
  orderId: string;
  storeId: string;
  pickerName: string;
  uploadedBy: string;
  timestamp: string;
  imageUrl: string; // Keep for compatibility, can be a delimited string
  allImages?: string; // comma-separated all images from GAS column 7
  imageUrls?: string[]; // Optional array for easier frontend handling
}

export interface RegionMapping {
  storeId: string;
  region: string;
}

export interface AdminData {
  users: User[];
  attendance: AttendanceRecord[];
  orders: OrderRecord[];
  regions?: RegionMapping[];
}

export interface MatrixItem {
  status: string;
  storeID: string;
  bucket: string;
  slot: string;
  orderID: string;
  timestamp?: string;
}

export interface MatrixData {
  quick: MatrixItem[];
  schedule: MatrixItem[];
  timestamp?: string;
  syncTime?: string;
  cycleCount?: number;
}

export interface EscalationRule {
  id: string;
  status: string;
  bucket: string;
  region: string;
  escalationUser: string;
  isActive: boolean;
}

export interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
  id: number;
}

export interface AttendanceStatus {
  inTime: string | null;
  outTime: string | null;
  missingPunchOut?: boolean;
}

export interface MatrixDetail {
  title: string;
  stat: string;
  key: string;
  orders: MatrixItem[];
}
