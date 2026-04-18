import axiosLib from 'axios';

// Optimized Cache for GAS Proxy
const gasCache = new Map<string, { data: any, headers: any, status: number, expiry: number }>();
const CACHE_TTL = 120000; // 2 Minutes for Matrix/Admin data to reduce GAS load
const REGIONS_TTL = 3600000; // 1 Hour for regions

// Request Queue for GAS Proxy with Limited Concurrency
let activeRequests = 0;
const MAX_CONCURRENT = 3;
let backoffMultiplier = 1;
const gasQueue: { config: any, resolve: any, reject: any, skipCache?: boolean }[] = [];

async function processGasQueue() {
  if (activeRequests >= MAX_CONCURRENT || gasQueue.length === 0) return;

  while (activeRequests < MAX_CONCURRENT && gasQueue.length > 0) {
    const { config, resolve, reject, skipCache } = gasQueue.shift()!;
    activeRequests++;

    // Execute in an async IIFE to allow the loop to continue for other concurrent slots
    (async () => {
      try {
        // Enforce a strict timeout at the axios level
        const response = await axiosLib({
          ...config,
          timeout: 30000 // 30s timeout for individual GAS requests
        });
        
        const dataStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        if (dataStr.includes('Rate exceeded')) {
          console.warn("[GAS Queue] Rate limit detected at GAS level, increasing backoff.");
          backoffMultiplier = Math.min(backoffMultiplier * 2, 10);
        } else {
          // Slowly recover backoff if successful
          backoffMultiplier = Math.max(1, backoffMultiplier * 0.8);
        }

        resolve(response);
      } catch (err) {
        reject(err);
      } finally {
        activeRequests--;
        
        // Base delay 300ms between slots, but scales up if we hit rate limits
        const delay = 300 * backoffMultiplier;
        if (delay > 0) {
          await new Promise(r => setTimeout(r, delay));
        }
        
        // Trigger next if queue not empty
        processGasQueue();
      }
    })();
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
    gasQueue.push({ config, resolve, reject, skipCache });
    processGasQueue();
  }).then((response: any) => {
    // Populate Cache
    if (!skipCache && cacheKey && response.status === 200) {
      const dataStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      if (!dataStr.includes('error') && !dataStr.includes('Rate exceeded')) {
        // Use longer TTL for regions
        const ttl = config.url.includes('action=getRegions') ? REGIONS_TTL : CACHE_TTL;
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
