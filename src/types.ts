export interface User {
  empId: string;
  name: string;
  role: 'picker' | 'supervisor' | 'driver' | 'admin' | 'user' | 'store' | 'manager';
  storeId: string;
  status: string;
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
  imageUrls?: string[]; // Optional array for easier frontend handling
}

export interface AdminData {
  users: User[];
  attendance: AttendanceRecord[];
  orders: OrderRecord[];
}

export interface MatrixItem {
  status: string;
  storeID: string;
  bucket: string;
  slot: string;
  orderID: string;
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
  escalationUser: string;
  isActive: boolean;
}
