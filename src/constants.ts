// Environment-aware API URL
const getApiUrl = () => {
  // 0. If we are in the browser, use the local proxy to avoid CORS issues with Google Apps Script
  if (typeof window !== 'undefined') {
    return "/api/proxy-gas";
  }

  const fallback = "https://script.google.com/macros/s/AKfycbxUVldHO9dPY9uTfuCc-A_RZUhkyngPQvMDpMC31nrjZV-SXWH2ZzXWIyDh3HDD_Zom/exec";
  
  // 1. Check Vite env (Client-side - though usually handled by window check above)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const viteGas = import.meta.env.VITE_GAS_API_URL;
    const gas = import.meta.env.GAS_API_URL;
    if (viteGas) return viteGas;
    if (gas) return gas;
  }
  
  // 2. Check process.env (Server-side or polyfilled)
  if (typeof process !== 'undefined' && process.env) {
    const viteGas = process.env.VITE_GAS_API_URL;
    const gas = process.env.GAS_API_URL;
    if (viteGas) return viteGas;
    if (gas) return gas;
  }
  
  return fallback;
};

const detectedUrl = getApiUrl();
console.log(`[Constants] API_URL: ${detectedUrl ? (detectedUrl.substring(0, 40) + '...') : 'NONE'}`);

export const API_URL = (detectedUrl || "").trim();

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
