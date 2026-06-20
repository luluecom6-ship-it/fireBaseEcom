import { parseServerDate } from './utils/api';

// Order structure from Google Sheets - flat format with nested items and tasks

export interface OrderItem {
  item_name: string;
  item_status: 'ADDED' | 'PENDING' | 'REJECTED' | 'OUT_OF_STOCK' | 'REMOVED';
  quantity: number;
  found_qty: number;
  sku: string;
  location: string;
  package_ref: string;
  package_name: string;
  photo_url: string;
}

export interface TaskStep {
  step_type: string;
  step_status: 'DONE' | 'DOING' | 'PENDING';
  actual_start: string;
  actual_end: string;
}

export interface Task {
  task_type: string;
  task_status: 'FINISHED' | 'DOING' | 'PROCESSING';
  fleet_name: string;
  contact_name: string;
  contact_phone: string;
  steps: TaskStep[];
}

export interface Order {
  job_number: string;
  source: 'EXPRESS' | 'DEFAULT';
  partial_status: string;
  is_big_order: 'YES' | 'NO';
  created_at: string;
  slot_from: string;
  slot_to: string;
  origin_name: string;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  store_name: string;
  packages_count: number;
  items: OrderItem[];
  tasks: Task[];
}

// Store type for aggregation
export interface Store {
  id: string;
  name: string;
  code: string;
  timezone: string;
  region?: string;
  quickCommerceCount: number;
  scheduleCommerceCount: number;
  totalVolume: number;
}

// Status labels - expanded for new statuses
export const STATUS_LABELS: Record<string, string> = {
  CREATED: 'Created',
  PICKING: 'Picking',
  PICKING_WITH_PACKING: 'Picking with Packing',
  PICKING_WITH_UNASSIGNED_ZONE: 'Picking with Unassigned Zone',
  STORING: 'Storing',
  STORED: 'Stored',
  PARKED: 'Parked',
  AUDITING: 'Auditing',
  TRANSFERRING: 'Transferring',
  GOING_TO_ORIGIN: 'Going to Origin',
  GOING_TO_DESTINATION: 'Going to Destination',
  IN_ROUTE: 'In Route',
  DELIVERING: 'Delivering',
  DELIVERED: 'Delivered',
  TRANSFERRED: 'Transferred',
  FINISHED: 'Finished',
  PROCESSING: 'Processing',
  DOING: 'Doing',
  CHECKING_OUT: 'Checking Out',
  TRANSFERRING_TO_DELIVERY_FROM_STORAGE: 'Transferring to Delivery',
  TRANSFERRING_FROM_STORAGE_TO_DELIVERY: 'Transferring from Storage',
};

// Status order for matrix display
export const STATUS_ORDER = [
  'CREATED',
  'PICKING',
  'PICKING_WITH_PACKING',
  'STORING',
  'STORED',
  'PARKED',
  'AUDITING',
  'CHECKING_OUT',
  'TRANSFERRING',
  'GOING_TO_ORIGIN',
  'GOING_TO_DESTINATION',
  'IN_ROUTE',
  'DELIVERING',
  'DELIVERED',
  'TRANSFERRED',
  'FINISHED',
  'PROCESSING',
  'DOING',
];

// Map partial_status to display status
export const mapStatus = (status: string): string => {
  // Normalize status - replace any non-alphabetic characters with underscores, then uppercase
  const upperStatus = status.toUpperCase().replace(/[^A-Z_]/g, '_');

  // Map new statuses to standard ones
  if (upperStatus === 'DOING') return 'PICKING';
  if (upperStatus === 'PROCESSING') return 'PICKING';
  if (upperStatus === 'FINISHED') return 'DELIVERED';

  // Check if it's already a standard status
  if (STATUS_ORDER.includes(upperStatus)) return upperStatus;

  // Handle any remaining statuses by removing extra underscores
  const cleanedStatus = upperStatus.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (STATUS_ORDER.includes(cleanedStatus)) return cleanedStatus;

  // Default to PICKING for unknown statuses
  return 'PICKING';
};

// Helper to extract store code from store_name
export const extractStoreCode = (name: string): string => {
  const match = name.match(/^(\d{4})/);
  return match ? match[1] : name.slice(0, 4);
};

// Helper to extract region from store_name (city/country)
export const extractRegion = (name: string): string => {
  const parts = name.split(',');
  if (parts.length > 1) {
    // Get the last part which usually contains city/country info
    return parts[parts.length - 1].trim();
  }
  return name;
};

// Helper to check if order is Quick Commerce (EXPRESS)
export const isQuickCommerce = (order: Order): boolean => {
  return order.source === 'EXPRESS';
};

// Helper to check if order is Schedule Commerce (DEFAULT)
export const isScheduleCommerce = (order: Order): boolean => {
  return order.source === 'DEFAULT';
};

// Calculate total items in order
export const getTotalItems = (order: Order): number => {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
};

// Calculate picked items
export const getPickedItems = (order: Order): number => {
  return order.items.reduce((sum, item) => sum + item.found_qty, 0);
};

// Calculate SKU count
export const getSkuCount = (order: Order): number => {
  return order.items.length;
};

// Calculate picked SKU count
export const getPickedSkuCount = (order: Order): number => {
  return order.items.filter(item => item.item_status === 'ADDED').length;
};

// Calculate rejected items count
export const getRejectedItemsCount = (order: Order): number => {
  return order.items.filter(item => item.item_status === 'REJECTED').length;
};

// Calculate pending items count
export const getPendingItemsCount = (order: Order): number => {
  return order.items.filter(item => item.item_status === 'PENDING').length;
};

// Get age in minutes since order creation
export const getOrderAgeMinutes = (order: Order): number => {
  // Handle empty or invalid created_at
  if (!order.created_at) return 0;

  const date = parseServerDate(order.created_at);
  const createdTime = date.getTime();

  // Check if date is valid
  if (isNaN(createdTime)) return 0;

  const now = Date.now();
  return Math.floor((now - createdTime) / 60000);
};

// Get age bucket label
export const getAgeBucket = (minutes: number): string => {
  if (minutes < 5) return '0-5';
  if (minutes < 10) return '5-10';
  if (minutes < 15) return '10-15';
  if (minutes < 20) return '15-20';
  if (minutes < 30) return '20-30';
  if (minutes < 40) return '30-40';
  if (minutes < 50) return '40-50';
  if (minutes < 60) return '50-60';
  return '60+';
};

// Extract picker info from tasks
export const getPickerInfo = (order: Order) => {
  const pickingTask = order.tasks.find(t => t.task_type === 'PICKING_AND_STORAGE');
  if (pickingTask && pickingTask.contact_name) {
    return {
      name: pickingTask.contact_name,
      phone: pickingTask.contact_phone,
      fleet: pickingTask.fleet_name
    };
  }
  return null;
};

// Extract driver info from tasks
export const getDriverInfo = (order: Order) => {
  const deliveryTask = order.tasks.find(t => t.task_type === 'DELIVERY_WITH_STORAGE');
  if (deliveryTask && deliveryTask.contact_name) {
    return {
      name: deliveryTask.contact_name,
      phone: deliveryTask.contact_phone,
      fleet: deliveryTask.fleet_name
    };
  }
  return null;
};

// Get picking progress percentage
export const getPickingProgress = (order: Order): number => {
  const total = getTotalItems(order);
  if (total === 0) return 0;
  const picked = getPickedItems(order);
  return Math.round((picked / total) * 100);
};

// Calculate distance between origin and destination (in km)
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Get order distance in km
export const getOrderDistance = (order: Order): number | null => {
  if (order.origin_lat && order.origin_lng && order.dest_lat && order.dest_lng) {
    return calculateDistance(order.origin_lat, order.origin_lng, order.dest_lat, order.dest_lng);
  }
  return null;
};

// Get time slot bucket for schedule commerce
export const getTimeSlotBucket = (slotFrom: string, region?: string): string => {
  // Handle empty or invalid slot_from
  if (!slotFrom) return 'Other';

  const date = parseServerDate(slotFrom);

  // Check if date is valid
  if (isNaN(date.getTime())) return 'Other';

  let hour = date.getUTCHours();

  // Apply KSA offset (+3) as default/primary timezone as requested
  // We formerly had complex region mapping, but now prioritizing KSA for all logic.
  hour = (hour + 3) % 24;

  if (hour >= 8 && hour < 10) return '8:00 AM - 9:59 AM';
  if (hour >= 10 && hour < 12) return '10:00 AM - 11:59 AM';
  if (hour >= 12 && hour < 14) return '12:00 PM - 1:59 PM';
  if (hour >= 14 && hour < 16) return '2:00 PM - 3:59 PM';
  if (hour >= 16 && hour < 18) return '4:00 PM - 5:59 PM';
  if (hour >= 18 && hour < 20) return '6:00 PM - 7:59 PM';
  if (hour >= 20 && hour < 22) return '8:00 PM - 9:59 PM';
  if (hour >= 22 && hour < 24) return '10:00 PM - 11:59 PM';
  return 'Other';
};

// Get all time slots (including 'Other' for out-of-range slots)
export const TIME_SLOTS = [
  '8:00 AM - 9:59 AM',
  '10:00 AM - 11:59 AM',
  '12:00 PM - 1:59 PM',
  '2:00 PM - 3:59 PM',
  '4:00 PM - 5:59 PM',
  '6:00 PM - 7:59 PM',
  '8:00 PM - 9:59 PM',
  '10:00 PM - 11:59 PM',
  'Other',
];

// Time intervals for ageing matrix
export const TIME_INTERVALS = ['0-5', '5-10', '10-15', '15-20', '20-30', '30-40', '40-50', '50-60', '60+'];

// Get status color
export const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    CREATED: '#6B7280',
    PICKING: '#3B82F6',
    PICKING_WITH_PACKING: '#8B5CF6',
    PICKING_WITH_UNASSIGNED_ZONE: '#EC4899',
    STORING: '#14B8A6',
    STORED: '#10B981',
    PARKED: '#F59E0B',
    AUDITING: '#6366F1',
    TRANSFERRING: '#06B6D4',
    GOING_TO_ORIGIN: '#84CC16',
    GOING_TO_DESTINATION: '#22C55E',
    IN_ROUTE: '#0EA5E9',
    DELIVERING: '#F97316',
    DELIVERED: '#10B981',
  };
  return colors[status] || '#6B7280';
};

// ============================================
// Order Lifecycle Helper Functions
// ============================================

interface TaskStepInfo {
  stepType: string;
  actualStart: string | null;
  actualEnd: string | null;
}

// Get task step info by step type from all tasks
export const getTaskStepInfo = (order: Order, stepType: string): TaskStepInfo => {
  for (const task of order.tasks) {
    for (const step of task.steps) {
      if (step.step_type === stepType) {
        return {
          stepType: step.step_type,
          actualStart: step.actual_start || null,
          actualEnd: step.actual_end || null,
        };
      }
    }
  }
  return { stepType, actualStart: null, actualEnd: null };
};

// Calculate time difference in minutes
export const getTimeDiffMinutes = (start: string | null, end: string | null): number | null => {
  if (!start || !end) return null;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (isNaN(startTime) || isNaN(endTime)) return null;
  return Math.round((endTime - startTime) / 60000);
};

// Get order lifecycle data
export interface OrderLifecycle {
  orderCreatedAt: string | null;
  pickStart: string | null;
  pickEnd: string | null;
  storingStart: string | null;
  storingEnd: string | null;
  goingToOriginStart: string | null;
  goingToOriginEnd: string | null;
  transferToDeliveryStart: string | null;
  transferToDeliveryEnd: string | null;
  goingToDestinationStart: string | null;
  goingToDestinationEnd: string | null;
  deliveringStart: string | null;
  deliveringEnd: string | null;
  deliveredStart: string | null;
  deliveredEnd: string | null;
}

export const getOrderLifecycle = (order: Order): OrderLifecycle => {
  const lifecycle: OrderLifecycle = {
    orderCreatedAt: order.created_at || null,
    pickStart: null,
    pickEnd: null,
    storingStart: null,
    storingEnd: null,
    goingToOriginStart: null,
    goingToOriginEnd: null,
    transferToDeliveryStart: null,
    transferToDeliveryEnd: null,
    goingToDestinationStart: null,
    goingToDestinationEnd: null,
    deliveringStart: null,
    deliveringEnd: null,
    deliveredStart: null,
    deliveredEnd: null,
  };

  // Track if we need to fallback for EXPRESS orders
  let transferringStepStart: string | null = null;

  // Extract step info from tasks
  for (const task of order.tasks) {
    for (const step of task.steps) {
      switch (step.step_type) {
        case 'PICKING_WITH_PACKING':
          if (!lifecycle.pickStart && step.actual_start) {
            lifecycle.pickStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.pickEnd = step.actual_end;
          }
          break;
        case 'PICKING':
          if (!lifecycle.pickStart && step.actual_start) {
            lifecycle.pickStart = step.actual_start;
          }
          if (!lifecycle.pickEnd && step.actual_end) {
            lifecycle.pickEnd = step.actual_end;
          }
          break;
        case 'STORING':
          if (!lifecycle.storingStart && step.actual_start) {
            lifecycle.storingStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.storingEnd = step.actual_end;
          }
          break;
        case 'GOING_TO_ORIGIN':
          if (!lifecycle.goingToOriginStart && step.actual_start) {
            lifecycle.goingToOriginStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.goingToOriginEnd = step.actual_end;
          }
          break;
        case 'TRANSFERRING_TO_DELIVERY_FROM_STORAGE':
          if (!lifecycle.transferToDeliveryStart && step.actual_start) {
            lifecycle.transferToDeliveryStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.transferToDeliveryEnd = step.actual_end;
          }
          break;
        case 'TRANSFERRING_FROM_STORAGE_TO_DELIVERY':
          if (task.task_type === 'DELIVERY_WITH_STORAGE') {
            if (!lifecycle.transferToDeliveryStart && step.actual_start) {
              lifecycle.transferToDeliveryStart = step.actual_start;
            }
            if (step.actual_end) {
              lifecycle.transferToDeliveryEnd = step.actual_end;
            }
          }
          // For EXPRESS orders: capture this step's actual_start for fallback
          if (order.source === 'EXPRESS' && step.actual_start) {
            transferringStepStart = step.actual_start;
          }
          break;
        case 'GOING_TO_DESTINATION':
          if (!lifecycle.goingToDestinationStart && step.actual_start) {
            lifecycle.goingToDestinationStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.goingToDestinationEnd = step.actual_end;
          }
          break;
        case 'DELIVERING':
          if (!lifecycle.deliveringStart && step.actual_start) {
            lifecycle.deliveringStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.deliveringEnd = step.actual_end;
          }
          break;
        case 'DELIVERED':
          if (!lifecycle.deliveredStart && step.actual_start) {
            lifecycle.deliveredStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.deliveredEnd = step.actual_end;
          }
          break;
      }
    }
  }

  // For EXPRESS orders: if GOING_TO_DESTINATION has no actual_start, use TRANSFERRING_FROM_STORAGE_TO_DELIVERY
  if (order.source === 'EXPRESS' && !lifecycle.goingToDestinationStart && transferringStepStart) {
    lifecycle.goingToDestinationStart = transferringStepStart;
  }

  return lifecycle;
};

// Format duration in human readable format
export const formatDuration = (minutes: number | null): string => {
  if (minutes === null) return '—';
  if (minutes < 1) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 1) return `${minutes} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

// Calculate REMOVED items count (OOS)
export const getRemovedItemsCount = (order: Order): number => {
  return order.items.filter(item => item.item_status === 'REMOVED').length;
};

// Calculate REJECTED items count (Customer cancelled/Door Rejection)
export const getCustomerCancelledCount = (order: Order): number => {
  return order.items.filter(item => item.item_status === 'REJECTED').length;
};
