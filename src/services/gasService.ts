import axiosLib from 'axios';

// Optimized Cache for GAS Proxy
const gasCache = new Map<string, { data: any, headers: any, status: number, expiry: number }>();
const CACHE_TTL = 120000; // 2 Minutes for Matrix/Admin data to reduce GAS load
const REGIONS_TTL = 3600000; // 1 Hour for regions

// Request Queue for GAS Proxy with Limited Concurrency
let activeRequests = 0;
const MAX_CONCURRENT = 10; // Increased concurrency to prevent long queues
let backoffMultiplier = 1;
const gasQueue: { config: any, resolve: any, reject: any, skipCache?: boolean }[] = [];

async function processGasQueue() {
  if (gasQueue.length === 0 || activeRequests >= MAX_CONCURRENT) return;

  const item = gasQueue.shift();
  if (!item) return;

  activeRequests++;
  const { config, resolve, reject } = item;

  try {
    console.log(`[GAS Queue] Executing [${config.method}] ${new URL(config.url).searchParams.get('action')} (${activeRequests}/${MAX_CONCURRENT})`);
    
    // Enforce a strict timeout at the axios level
    const response = await axiosLib({
      ...config,
      timeout: 45000 // 45s timeout for individual GAS requests
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
    console.error(`[GAS Queue] Request failed: ${err.message}`);
    reject(err);
  } finally {
    activeRequests--;
    
    // Minimal delay between slots to avoid overwhelming GAS, but scaled by backoff
    const delay = Math.floor(100 * backoffMultiplier);
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
    gasQueue.push({ config, resolve, reject, skipCache });
    processGasQueue();
  }).then((response: any) => {
    // Populate Cache
    if (!skipCache && cacheKey && response.status === 200) {
      const dataStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      if (!dataStr.includes('error') && !dataStr.includes('Rate exceeded')) {
        // Use longer TTL for regions (normalize case for check)
        const ttl = config.url.toLowerCase().includes('action=getregions') ? REGIONS_TTL : CACHE_TTL;
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
