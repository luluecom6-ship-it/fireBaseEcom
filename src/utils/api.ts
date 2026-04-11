/**
 * Robust fetch utility with retry logic and better error handling
 */
export async function robustFetch(url: string, options: RequestInit = {}, retries = 3, backoff = 1000): Promise<Response> {
  const cleanUrl = url.trim();
  try {
    const response = await fetch(cleanUrl, {
      ...options,
      // Default to follow redirects as GAS uses them heavily
      redirect: 'follow',
    });

    if (!response.ok && response.status !== 0) {
      // If it's a 429 or 5xx, we might want to retry
      if ((response.status === 429 || response.status >= 500) && retries > 0) {
        console.warn(`[Fetch] Server error ${response.status}. Retrying in ${backoff}ms... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return robustFetch(url, options, retries - 1, backoff * 2);
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  } catch (error) {
    if (retries > 0) {
      console.warn(`[Fetch] Network error: ${error instanceof Error ? error.message : String(error)}. Retrying in ${backoff}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return robustFetch(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

/**
 * Parses a date string from the server, ensuring it's treated as UTC if no timezone is present.
 */
export function parseServerDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  
  // If it's already a valid ISO string with timezone, just parse it
  if (dateStr.includes('Z') || dateStr.includes('+')) {
    return new Date(dateStr);
  }
  
  // Handle M/D/YYYY or MM/DD/YYYY HH:mm:ss
  if (dateStr.includes('/')) {
    const parts = dateStr.split(/[\s,T]+/);
    const datePart = parts[0];
    const timePart = parts[1] || "00:00:00";
    const [m, d, y] = datePart.split('/');
    // Create a normalized ISO string and treat as UTC
    const isoStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${timePart}Z`;
    const date = new Date(isoStr);
    if (!isNaN(date.getTime())) return date;
  }
  
  // If it's a simple YYYY-MM-DD HH:mm:ss format, assume UTC and add 'Z'
  const isoStr = dateStr.replace(' ', 'T');
  if (isoStr.includes('T') && !isoStr.includes('Z')) {
    return new Date(isoStr + 'Z');
  }
  
  return new Date(dateStr);
}
