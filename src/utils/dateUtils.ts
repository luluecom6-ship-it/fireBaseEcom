/**
 * Shared date utilities — pure functions, no browser APIs.
 * Safe to import from both frontend and backend/serverless contexts.
 */

/**
 * Parses a date string from the server, ensuring it's treated as UTC if no timezone is present.
 */
export function parseServerDate(dateStr: any): Date {
  if (!dateStr) return new Date();

  // Coerce to string safely
  const str = String(dateStr);

  // If it's already a valid ISO string with timezone, just parse it
  if (str.includes('Z') || str.includes('+')) {
    return new Date(str);
  }

  // Handle M/D/YYYY or MM/DD/YYYY HH:mm:ss
  if (str.includes('/')) {
    const parts = str.split(/[\s,T]+/);
    const datePart = parts[0];
    const timePart = parts[1] || "00:00:00";
    const [m, d, y] = datePart.split('/');
    // Create a normalized string and treat as LOCAL time (removed Z)
    const localIsoStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${timePart}`;
    const date = new Date(localIsoStr);
    if (!isNaN(date.getTime())) return date;
  }

  // If it's a simple YYYY-MM-DD HH:mm:ss format, assume LOCAL and replace space with T
  const trimmed = str.trim();
  const localIsoStr = trimmed.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(localIsoStr)) {
    return new Date(localIsoStr);
  }

  const finalDate = new Date(str);
  return isNaN(finalDate.getTime()) ? new Date() : finalDate;
}
