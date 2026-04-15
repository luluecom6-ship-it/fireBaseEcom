// Environment-aware API URL
const getApiUrl = () => {
  // Check for Vite environment
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GAS_API_URL) {
    return import.meta.env.VITE_GAS_API_URL;
  }
  // Check for Node.js environment
  if (typeof process !== 'undefined' && process.env && process.env.GAS_API_URL) {
    return process.env.GAS_API_URL;
  }
  // Fallback
  return "https://script.google.com/macros/s/AKfycbwBGYyEjem9_3js7D4uDlFU85pgwZgJ1XFkkmN5cdKRB7utGUsdlf3_ybIHqknlWJzC/exec";
};

export const API_URL = getApiUrl();

export const STATUSES = [
  "CREATED",
  "PICKING",
  "PICKING WITH PACKING",
  "PICKING WITH UNASSIGNED ZONE",
  "STORING",
  "STORED",
  "PARKED",
  "AUDITING",
  "TRANSFERRING",
  "GOING TO ORIGIN",
  "GOING TO DESTINATION",
  "IN ROUTE",
  "DELIVERING"
];

export const AGE_BUCKETS = [
  "0-5MIN",
  "5-10MIN",
  "10-15MIN",
  "15-20MIN",
  "20-25MIN",
  "25-30MIN",
  "30-35MIN",
  "35-40MIN",
  "40-45MIN",
  "45-50MIN",
  "50-55MIN",
  "55-60MIN",
  "60MIN+"
];

export const QUICK_STATUSES = [...STATUSES];
export const SCHEDULE_STATUSES = [...STATUSES];
