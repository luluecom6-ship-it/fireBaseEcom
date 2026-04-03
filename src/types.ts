export interface User {
  empId: string;
  name: string;
  role: 'user' | 'admin';
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
