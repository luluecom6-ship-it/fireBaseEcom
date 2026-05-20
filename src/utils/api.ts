/**
 * Robust fetch utility with retry logic and better error handling
 */
export async function robustFetch(
  url: string, 
  options: RequestInit = {}, 
  retries = options.method === 'POST' ? 1 : 3, 
  backoff = 1000
): Promise<Response> {
  const cleanUrl = url.trim();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout for slow GAS

  console.log(`[Fetch] Requesting: ${cleanUrl} (Retries left: ${retries})`);
  
  // Convert absolute URL to relative if it's on the same origin
  let finalUrl = cleanUrl;
  try {
    const parsed = new URL(cleanUrl, window.location.origin);
    if (parsed.origin === window.location.origin) {
      finalUrl = parsed.pathname + parsed.search + parsed.hash;
      console.log(`[Fetch] Normalized to relative: ${finalUrl}`);
    }
  } catch (e) {
    // Stick with original if parsing fails (likely already relative or malformed)
  }

  try {
    const response = await fetch(finalUrl, {
      ...options,
      signal: controller.signal,
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
        const retryBackoff = response.status === 429 ? backoff * 3 : backoff;
        console.warn(`[Fetch] Server error ${response.status}. Retrying in ${retryBackoff}ms... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, retryBackoff));
        return robustFetch(url, options, retries - 1, backoff * 2);
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isAbort = error.name === 'AbortError' || errorMsg.includes('aborted');
    
    console.error(`[Fetch] FAILED: ${cleanUrl} | Type: ${isAbort ? 'TIMEOUT/ABORT' : 'NETWORK'} | Error: ${errorMsg}`);
    
    if (retries > 0) {
      const retryDelay = isAbort ? backoff * 2 : backoff;
      console.warn(`[Fetch] ${isAbort ? 'Timeout' : 'Network error'}. Retrying in ${retryDelay}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return robustFetch(url, options, retries - 1, backoff * 2);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
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
