import axiosLib from 'axios';

// Optimized Cache for GAS Proxy
const gasCache = new Map<string, { data: any, headers: any, status: number, expiry: number }>();
const LOGS_TTL = 30000; // 30 seconds for logs
const CACHE_TTL = 120000; // 2 Minutes for Matrix/Admin data
const REGIONS_TTL = 3600000; // 1 Hour for regions

// Request Queue for GAS Proxy with Limited Concurrency
let activeRequests = 0;
const MAX_CONCURRENT = 5; // Increased to 5 for better throughput
let backoffMultiplier = 1;
const gasQueue: { config: any, resolve: any, reject: any, skipCache?: boolean, startTime: number }[] = [];

async function processGasQueue() {
  if (gasQueue.length === 0 || activeRequests >= MAX_CONCURRENT) return;

  const item = gasQueue.shift();
  if (!item) return;

  // Check if item has been in queue too long (e.g. 2 minutes)
  if (Date.now() - item.startTime > 120000) {
    item.reject(new Error("Request timed out in queue"));
    processGasQueue();
    return;
  }

  activeRequests++;
  const { config, resolve, reject } = item;

  try {
    let action = "unknown";
    try {
      const urlObj = new URL(config.url);
      action = urlObj.searchParams.get('action') || "no-action";
    } catch (e) {}

    console.log(`[GAS Queue] Executing [${config.method}] ${action} (${activeRequests}/${MAX_CONCURRENT}) QSize: ${gasQueue.length}`);
    
    // Enforce a strict timeout at the axios level
    const response = await axiosLib({
      ...config,
      timeout: 60000 // 60s timeout for individual GAS requests
    });
    
    const dataStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    if (dataStr.includes('Rate exceeded')) {
      console.warn("[GAS Queue] Rate limit detected at GAS level, increasing backoff.");
      backoffMultiplier = Math.min(backoffMultiplier * 1.5, 5);
    } else {
      backoffMultiplier = Math.max(1, backoffMultiplier * 0.9);
    }

    resolve(response);
  } catch (err: any) {
    console.error(`[GAS Queue] Request failed: ${err.message} [URL: ${config.url.substring(0, 70)}...]`);
    reject(err);
  } finally {
    activeRequests--;
    
    // Enhanced delay to avoid overwhelming GAS, scaled aggressively by backoff
    const delay = Math.floor(500 * backoffMultiplier);
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
    
    // Always trigger next check
    processGasQueue();
  }
}

export async function executeGasRequest(config: any, options: { skipCache?: boolean, cacheKey?: string } = {}) {
  const { skipCache = false, cacheKey } = options;

  // Cache Lookup (success responses ONLY)
  if (!skipCache && cacheKey) {
    const cached = gasCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return { data: cached.data, headers: cached.headers, status: cached.status, fromCache: true };
    }
  }

  return new Promise((resolve, reject) => {
    gasQueue.push({ config, resolve, reject, skipCache, startTime: Date.now() });
    processGasQueue();
  }).then((response: any) => {
    // Populate Cache
    if (!skipCache && cacheKey && response.status === 200) {
      const dataStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      if (!dataStr.includes('error') && !dataStr.includes('Rate exceeded')) {
        // Use longer TTL for regions or logs
        const urlLower = config.url.toLowerCase();
        let ttl = CACHE_TTL;
        if (urlLower.includes('action=getregions')) {
          ttl = REGIONS_TTL;
        } else if (urlLower.includes('action=getalertlogs')) {
          ttl = LOGS_TTL;
        }
        
        gasCache.set(cacheKey, {
          data: response.data,
          headers: response.headers,
          status: response.status,
          expiry: Date.now() + ttl
        });
      }
    }
    return response;
  });
}
