/**
 * Robust fetch utility with retry logic and better error handling
 */
export async function robustFetch(
  url: string, 
  options: RequestInit = {}, 
  retries = options.method === 'POST' ? 0 : 3, 
  backoff = 1000
): Promise<Response> {
  const cleanUrl = url.trim();
  console.log(`[Fetch] Requesting: ${cleanUrl}`);
  try {
    const response = await fetch(cleanUrl, {
      ...options,
      // Default to follow redirects as GAS uses them heavily
      redirect: 'follow',
      // Ensure CORS is handled correctly
      mode: options.mode || 'cors',
      // Avoid caching issues
      cache: 'no-store',
    });

    if (!response.ok && response.status !== 0) {
      // Log the body for debugging if it's not JSON
      const text = await response.text();
      const contentType = response.headers.get('content-type') || 'unknown';
      console.error(`[Fetch] SERVER ERROR ${response.status} (${contentType}): ${text.substring(0, 500)}`);
      
      // Detailed error detection for Google Apps Script HTML errors
      if (text.includes('<!DOCTYPE html>') || text.includes('goog-script-error') || text.includes('Fehler')) {
        console.error(`[Fetch] DETECTED: Google Apps Script HTML error page returned. Status: ${response.status}`);
      }

      // If the proxy returns our JSON error message about GAS error pages
      if (text.includes('"message"') && text.includes('Google Apps Script')) {
        try {
          const errData = JSON.parse(text);
          throw new Error(errData.message);
        } catch (e) {
          // Fall through
        }
      }

      if ((response.status === 429 || response.status >= 500) && retries > 0) {
        console.warn(`[Fetch] Server error ${response.status}. Retrying in ${backoff}ms... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return robustFetch(url, options, retries - 1, backoff * 2);
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Fetch] FAILED: ${cleanUrl}`, error);
    
    if (retries > 0) {
      console.warn(`[Fetch] Network error: ${errorMsg}. Retrying in ${backoff}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return robustFetch(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

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
    // Create a normalized ISO string and treat as UTC
    const isoStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${timePart}Z`;
    const date = new Date(isoStr);
    if (!isNaN(date.getTime())) return date;
  }
  
  // If it's a simple YYYY-MM-DD HH:mm:ss format, assume UTC and add 'Z'
  const isoStr = str.replace(' ', 'T');
  if (isoStr.includes('T') && !isoStr.includes('Z')) {
    return new Date(isoStr + 'Z');
  }
  
  return new Date(str);
}
