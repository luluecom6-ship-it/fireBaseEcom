export interface User {
  empId: string;
  name: string;
  role: 'picker' | 'supervisor' | 'driver' | 'admin' | 'user';
  storeId: string;
  status: string;
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
  cycleCount?: number;
}
