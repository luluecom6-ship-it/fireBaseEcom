export const API_URL = "https://script.google.com/macros/s/AKfycbxpbVk5iClMEXaTPB7lGNhPY4eXg_GHrKd-_mCSZgD5zNk1vz0gthVdIZxFwTz2kjQJ/exec";

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
