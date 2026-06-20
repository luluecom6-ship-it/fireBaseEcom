import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import cors from "cors";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import { runMonitorTick } from "../src/services/monitorService.js";

// Optimized Cache for GAS Proxy (Inlined for standalone serverless function deployment)
const gasCache = new Map<string, { data: any, headers: any, status: number, expiry: number }>();
const LOGS_TTL = 30000; // 30 seconds for logs
const CACHE_TTL = 120000; // 2 Minutes for Matrix/Admin data
const REGIONS_TTL = 3600000; // 1 Hour for regions

// Request Queue for GAS Proxy with Limited Concurrency
let activeRequests = 0;
const MAX_CONCURRENT = 40; // Increased to 40 to prevent queue clogging and Failed to fetch errors while loading multiple tabs/resources
let backoffMultiplier = 1;
const gasQueue: { config: any, resolve: any, reject: any, skipCache?: boolean, startTime: number }[] = [];

// Coalescing map for in-flight requests to same action
const inFlightRequests = new Map<string, Promise<any>>();

async function processGasQueue() {
  if (gasQueue.length === 0 || activeRequests >= MAX_CONCURRENT) return;

  const item = gasQueue.shift();
  if (!item) return;

  // Check if item has been in queue too long (e.g. 5 minutes)
  if (Date.now() - item.startTime > 300000) {
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
    const response = await axios({
      ...config,
      timeout: 45000 // 45s timeout to avoid keeping connection slots occupied indefinitely
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

async function executeGasRequest(config: any, options: { skipCache?: boolean, cacheKey?: string } = {}) {
  const { skipCache = false, cacheKey } = options;

  // Cache Lookup (success responses ONLY)
  if (!skipCache && cacheKey) {
    const cached = gasCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return { data: cached.data, headers: cached.headers, status: cached.status, fromCache: true };
    }
  }

  // Request Coalescing: Only for GET requests with same action
  const method = config.method || 'GET';
  const urlObj = new URL(config.url);
  const action = urlObj.searchParams.get('action') || 'default';
  const coalescingKey = `${method}:${action}:${JSON.stringify(config.data || "")}`;

  if (method === 'GET' && inFlightRequests.has(coalescingKey)) {
    console.log(`[GAS Queue] Coalescing request for action=${action}`);
    return inFlightRequests.get(coalescingKey);
  }

  const requestPromise = new Promise((resolve, reject) => {
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
  }).finally(() => {
    inFlightRequests.delete(coalescingKey);
  });

  if (method === 'GET') {
    inFlightRequests.set(coalescingKey, requestPromise);
  }

  return requestPromise;
}

const FIRESTORE_DB_ID = process.env.FIREBASE_DATABASE_ID || 'ai-studio-589cf723-ab60-4b6f-a2cd-f84f8c8c1b48';


// Global Error Handlers to prevent process crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught Exception:', error);
});

// Load firebase config safely
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
} catch (e) {
  console.error("Failed to load firebase-applet-config.json:", e);
}

async function startServer() {
  // Initialize Firebase Admin
  if (!admin.apps.length) {
    try {
      const saVar = process.env.FIREBASE_SERVICE_ACCOUNT;
      let config: any = null;

      if (saVar) {
        console.log("[Server] Using FIREBASE_SERVICE_ACCOUNT string");
        let raw = String(saVar).trim();
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          raw = raw.substring(firstBrace, lastBrace + 1);
        }
        try {
          config = JSON.parse(raw);
        } catch (e) {
          if (raw.startsWith('"') && raw.endsWith('"')) {
            const unquoted = JSON.parse(raw);
            config = typeof unquoted === 'string' ? JSON.parse(unquoted) : unquoted;
          }
        }
      } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL) {
        console.log("[Server] Reconstructing Service Account from individual components");
        config = {
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        };
      }

      if (config) {
        admin.initializeApp({
          credential: admin.credential.cert(config),
          databaseURL: `https://${config.projectId || config.project_id}.firebaseio.com`
        });
        console.log("Firebase Admin initialized successfully.");
      } else {
        console.error("CRITICAL: No Firebase Service Account configuration found.");
      }
    } catch (err) {
      console.error("CRITICAL: FIREBASE_SERVICE_ACCOUNT initialization failed.", err);
    }
  }

  const db = admin.apps.length ? getFirestore(admin.app(), FIRESTORE_DB_ID) : null;
  const messaging = admin.apps.length ? admin.messaging() : null;

  const normalizeStoreId = (id: string | number | null | undefined): string => {
    if (id === null || id === undefined) return "";
    const s = String(id).trim().toLowerCase();
    if (/^0+[1-9]\d*$/.test(s)) {
      return s.replace(/^0+/, "");
    }
    return s;
  };

  const normalizeRole = (role: string | null | undefined): string => {
    return String(role || "").toLowerCase().trim();
  };

  const normalizeRegion = (region: string | null | undefined): string => {
    return String(region || "").toLowerCase().trim();
  };

  const isStoreMatch = (uStore: string, tStore: string): boolean => {
    const userStoreId = normalizeStoreId(uStore);
    const targetStoreId = normalizeStoreId(tStore);
    if (userStoreId === 'all' || userStoreId === 'all stores' || userStoreId === 'all_stores' || userStoreId === '') return true;
    if (targetStoreId === 'all' || targetStoreId === 'all stores' || targetStoreId === 'all_stores' || targetStoreId === '') return true;
    return userStoreId === targetStoreId;
  };

  const isRegionMatch = (uRegion: string, tRegion: string): boolean => {
    const userRegion = normalizeRegion(uRegion);
    const targetRegion = normalizeRegion(tRegion);
    if (userRegion === 'all' || userRegion === 'all regions' || userRegion === 'all_regions' || userRegion === '') return true;
    if (targetRegion === 'all' || targetRegion === 'all regions' || targetRegion === 'all_regions' || targetRegion === '') return true;
    return userRegion === targetRegion || userRegion.includes(targetRegion) || targetRegion.includes(userRegion);
  };

  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check with diagnostics
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      time: new Date().toISOString(), 
      env: process.env.NODE_ENV,
      vercel: !!process.env.VERCEL,
      firebase: admin.apps.length > 0 ? "ready" : "missing",
      hasGasUrl: !!(process.env.GAS_API_URL || process.env.VITE_GAS_API_URL),
      hasV2Url: !!(process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL)
    });
  });

  app.get("/api/oos-debug", async (req, res) => {
    try {
      if (!admin.apps.length) return res.status(500).json({ error: "No DB" });
      const snap = await getFirestore().collection("oos_history").get();
      res.json({ count: snap.size, data: snap.docs.map(d => d.data()) });
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/oos-trigger", async (req, res) => {
    try {
      if (!db || !messaging) return res.status(500).json({ error: "Missing Firebase features" });
      await runMonitorTick(db, messaging);
      res.json({ status: "Tick completed" });
    } catch(e: any) {
      console.error(e);
      res.status(500).json({ error: e.stack || e.message });
    }
  });

  app.get("/api/monitor", async (req, res) => {
    try {
      if (!db || !messaging) return res.status(500).json({ status: "error", message: "Firebase features missing" });
      const monKey = req.headers["x-monitor-key"] || req.query.key;
      console.log(`[Monitor Trigger] Hitting monitor manually from Vercel/GAS. Key: ${!!monKey}`);
      await runMonitorTick(db, messaging);
      res.json({ status: "success", message: "Monitor tick completed successfully" });
    } catch (e: any) {
      console.error("[api/monitor] Error:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.post("/api/admin/test-oos-push", async (req, res) => {
    try {
      if (!db || !messaging) return res.status(500).json({ error: "Missing Firebase features" });
      const tokensSnap = await db.collection('fcm_tokens').where('role', 'in', ['admin', 'supervisor', 'operator', 'manager']).get();
      const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);
      if (tokens.length === 0) return res.json({ status: "success", successCount: 0 });
      
      const payload = {
          title: `🧪 TEST OUT OF STOCK DETECTED`,
          body: `Test Item Strawberry (SKU: 99999) at Store TEST.`,
          icon: 'https://placehold.co/100x100.png?text=OOS+ICON',
          image: 'https://placehold.co/600x400.png?text=OOS+TEST+IMAGE',
          data: { 
            orderId: 'test-order-123', 
            type: "oos", 
            storeId: 'TEST', 
            icon: 'https://placehold.co/100x100.png?text=OOS+ICON', 
            image: 'https://placehold.co/600x400.png?text=OOS+TEST+IMAGE' 
          }
      };

      const MAX_TOKENS = 500;
      let successCount = 0;
      for (let i = 0; i < tokens.length; i += MAX_TOKENS) {
        const tokenBatch = tokens.slice(i, i + MAX_TOKENS);
        const message = {
            notification: { 
              title: payload.title, 
              body: payload.body, 
              image: payload.image 
            },
            webpush: {
                notification: {
                    icon: payload.data.icon || 'https://placehold.co/192x192.png?text=OOS',
                    image: payload.data.image || 'https://placehold.co/192x192.png?text=OOS'
                }
            },
            data: {
              orderId: String(payload.data.orderId || ""),
              type: String(payload.data.type || ""),
              storeId: String(payload.data.storeId || ""),
              icon: String(payload.data.icon || ""),
              image: String(payload.data.image || "")
            },
            tokens: tokenBatch
        };

        let response;
        try {
          console.log("[FCM] Sending batch:", tokenBatch.length);
          response = await messaging.sendEachForMulticast(message);
          console.log("[FCM] Success:", response.successCount);
          console.log("[FCM] Failure:", response.failureCount);

          if (response.failureCount > 0) {
            const badTokens: string[] = [];
            response.responses.forEach((r, idx) => {
              if (!r.success) {
                console.error("[FCM TOKEN ERROR]", tokenBatch[idx], r.error);
                const errCode = r.error?.code;
                if (errCode === 'messaging/registration-token-not-registered' || errCode === 'messaging/invalid-registration-token') {
                  badTokens.push(tokenBatch[idx]);
                }
              }
            });

            if (badTokens.length > 0) {
              console.log("[FCM CleanUp] Cleaning up invalid tokens:", badTokens.length);
              for (const token of badTokens) {
                try {
                  const snap = await db.collection('fcm_tokens').where('token', '==', token).get();
                  if (!snap.empty) {
                    const cleanupBatch = db.batch();
                    snap.docs.forEach(doc => {
                      console.log(`[FCM CleanUp] Deleting unregistered token: ${doc.id}`);
                      cleanupBatch.delete(doc.ref);
                    });
                    await cleanupBatch.commit();
                  }
                } catch (cleanupErr) {
                  console.error("[FCM CleanUp ERROR]", cleanupErr);
                }
              }
            }
          }
        } catch (fcmErr: any) {
          console.error("[FCM FATAL ERROR]", fcmErr);
          return res.status(500).json({
            status: "error",
            error: fcmErr.message || "FCM send failed"
          });
        }
        successCount += response.successCount;
      }
      res.json({ status: "success", successCount });
    } catch(e: any) {
      console.error("[test-oos-push] Error:", e);
      res.json({ status: "error", error: e.message || "Unknown error occurred" });
    }
  });

  // --- WhatsApp Evolution API Proxy ---
  app.post("/api/admin/whatsapp/test", async (req, res) => {
    try {
      if (!db) return res.status(500).json({ error: "Missing Firebase features" });
      const { number } = req.body;
      if (!number) return res.status(400).json({ error: "Phone number or Group JID is required" });

      const sysConfigSnap = await db.collection("system").doc("config").get();
      const sysData = sysConfigSnap.data() || {};
      
      if (!sysData.whatsappApiUrl || !sysData.whatsappInstanceName || !sysData.whatsappApiKey) {
        return res.status(400).json({ error: "WhatsApp integration is not fully configured" });
      }

      const url = `${sysData.whatsappApiUrl.replace(/\/$/, '')}/message/sendText/${sysData.whatsappInstanceName}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': sysData.whatsappApiKey
        },
        body: JSON.stringify({
          number: number,
          options: { delay: 0, presence: "composing", linkPreview: false },
          textMessage: { text: "Hello! This is a test message from your Firebase E-commerce Admin panel. If you are seeing this, your Evolution API connection is working perfectly! 🚀" }
        })
      });

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("[WhatsApp Test Error]", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/whatsapp/groups", async (req, res) => {
    try {
      if (!db) return res.status(500).json({ error: "Missing Firebase features" });
      const sysConfigSnap = await db.collection("system").doc("config").get();
      if (!sysConfigSnap.exists) {
        return res.status(404).json({ error: "System config not found" });
      }
      const sysData = sysConfigSnap.data() || {};
      
      if (!sysData.whatsappApiUrl || !sysData.whatsappInstanceName || !sysData.whatsappApiKey) {
        return res.status(400).json({ error: "WhatsApp integration is not fully configured" });
      }

      const url = `${sysData.whatsappApiUrl.replace(/\/$/, '')}/group/fetchAllGroups/${sysData.whatsappInstanceName}?getParticipants=false`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': sysData.whatsappApiKey
        }
      });

      if (!response.ok) {
         throw new Error(`Evolution API returned ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      res.json({ status: "success", groups: data });
    } catch (e: any) {
      console.error("[WhatsApp] Proxy error fetching groups:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/send-oos-push", async (req, res) => {
    try {
      if (!db || !messaging) return res.status(500).json({ error: "Missing Firebase features" });
      
      const { item, requesterRole } = req.body;
      if (!item || (requesterRole !== 'admin' && requesterRole !== 'operator' && requesterRole !== 'supervisor')) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // Fetch region mapping
      let alertRegion = "";
      try {
        const adminSnap = await db.collection("app_config").doc("admin_control").get();
        if (adminSnap.exists) {
           const adminData = adminSnap.data() || {};
           const regions = adminData.regions || [];
           
           // Try format 1: { stores: [...], name: "..." }
           const storeRegionObj = regions.find((r: any) => Array.isArray(r.stores) && r.stores.includes(item.storeId));
           if (storeRegionObj && storeRegionObj.name) {
             alertRegion = storeRegionObj.name;
           } else {
             // Try format 2: { storeId: "...", region: "..." }
             const storeRegionMapping = regions.find((r: any) => String(r.storeId || r.StoreID || "").trim() === String(item.storeId).trim());
             if (storeRegionMapping && (storeRegionMapping.region || storeRegionMapping.Region)) {
               alertRegion = storeRegionMapping.region || storeRegionMapping.Region;
             }
           }
        }
      } catch (e) {
         console.warn("Could not fetch admin_control for region mapping", e);
      }
      
      const alertStoreId = String(item.storeId || "").trim();

      // Retrieve all tokens to prevent strict case-sensitive Firestore 'where' exclusions
      const tokensSnap = await db.collection('fcm_tokens').get();
      const allTokensData = tokensSnap.docs.map((doc: any) => doc.data());

      const tokens = allTokensData
        .filter(data => {
            if (!data.token) return false;
            const userRole = normalizeRole(data.role);
            const userStoreId = normalizeStoreId(data.storeId);
            const userRegion = normalizeRegion(data.region);

            const targetStoreId = normalizeStoreId(alertStoreId);
            const targetRegion = normalizeRegion(alertRegion);

            if (userRole === 'admin') return true;
            if (userRole === 'supervisor') {
              return isRegionMatch(data.region, alertRegion);
            }
            if (['manager', 'store', 'picker', 'driver', 'staff', 'operator'].includes(userRole)) {
              return isStoreMatch(data.storeId, alertStoreId);
            }
            return false;
        })
        .map(data => data.token);
        
      if (tokens.length === 0) return res.json({ status: "success", successCount: 0 });
      
      const getSmallThumbnailUrl = (url: string) => {
        if (!url) return "";
        const str = String(url);
        if (str.includes("drive.google.com")) {
          const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
          if (id) return `https://lh3.googleusercontent.com/d/${id}=s200`;
        }
        return str;
      };

      const getLargeImageUrl = (url: string) => {
        if (!url) return "";
        const str = String(url);
        if (str.includes("drive.google.com")) {
          const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
          if (id) return `https://lh3.googleusercontent.com/d/${id}=s1000`;
        }
        return str;
      };

      const payload = {
          title: `⚠️ OUT OF STOCK DETECTED`,
          body: `Item ${item.itemName} (SKU: ${item.sku}) at Store ${item.storeId}.`,
          icon: getSmallThumbnailUrl(item.photoUrl),
          image: getLargeImageUrl(item.photoUrl),
          data: { 
            orderId: String(item.orderId || ""), 
            type: "oos", 
            storeId: String(item.storeId || ""), 
            icon: getSmallThumbnailUrl(item.photoUrl),
            image: getLargeImageUrl(item.photoUrl) 
          }
      };

      // FCM has a 500 token limit per call
      const MAX_TOKENS = 500;
      let successCount = 0;

        // --- WhatsApp Evolution API Dispatch ---
        try {
          const sysConfigSnap = await db.collection("system").doc("config").get();
          if (sysConfigSnap.exists) {
            const sysData = sysConfigSnap.data() || {};
            
            if (sysData.whatsappOosEnabled && sysData.whatsappApiUrl && sysData.whatsappInstanceName && sysData.whatsappApiKey) {
              const mappings = sysData.whatsappRegionMappings || [];
              const mapping = mappings.find((m: any) => String(m.region).trim().toLowerCase() === String(alertRegion).trim().toLowerCase());
              
              if (mapping && mapping.groupJid) {
                const waMessage = `*Out of Stock Alert!*\nStore: ${item.storeId}\nOrder No: ${item.orderId || 'N/A'}\nSKU: ${item.sku}\nItem Name: ${item.itemName}\nQty: 0`;
                
                let url = `${sysData.whatsappApiUrl.replace(/\/$/, '')}/message/sendText/${sysData.whatsappInstanceName}`;
                let bodyParams: any = {
                  number: mapping.groupJid,
                  options: {
                    delay: 0,
                    presence: "composing",
                    linkPreview: false
                  },
                  textMessage: {
                    text: waMessage
                  }
                };

                if (payload.image) {
                  url = `${sysData.whatsappApiUrl.replace(/\/$/, '')}/message/sendMedia/${sysData.whatsappInstanceName}`;
                  bodyParams = {
                    number: mapping.groupJid,
                    options: {
                      delay: 0,
                      presence: "composing"
                    },
                    mediaMessage: {
                      mediatype: "image",
                      caption: waMessage,
                      media: payload.image
                    }
                  };
                }
                
                await fetch(url, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'apikey': sysData.whatsappApiKey
                  },
                  body: JSON.stringify(bodyParams)
                }).catch(e => console.error("[WhatsApp] Error calling Evolution API:", e));
              }
            }
          }
        } catch (waErr) {
          console.error("[WhatsApp] Internal Error:", waErr);
        }
        // ----------------------------------------

      for (let i = 0; i < tokens.length; i += MAX_TOKENS) {
        const tokenBatch = tokens.slice(i, i + MAX_TOKENS);
        const message = {
            notification: { 
              title: payload.title, 
              body: payload.body, 
              image: payload.image 
            },
            webpush: {
                notification: {
                    icon: payload.data.icon || 'https://placehold.co/192x192.png?text=OOS',
                    image: payload.data.image || 'https://placehold.co/192x192.png?text=OOS'
                }
            },
            data: {
              orderId: String(payload.data.orderId || ""),
              type: String(payload.data.type || ""),
              storeId: String(payload.data.storeId || ""),
              icon: String(payload.data.icon || ""),
              image: String(payload.data.image || "")
            },
            tokens: tokenBatch
        };

        let response;
        try {
          console.log("[FCM] Sending batch:", tokenBatch.length);
          response = await messaging.sendEachForMulticast(message);
          console.log("[FCM] Success:", response.successCount);
          console.log("[FCM] Failure:", response.failureCount);

          if (response.failureCount > 0) {
            const badTokens: string[] = [];
            response.responses.forEach((r, idx) => {
              if (!r.success) {
                console.error("[FCM TOKEN ERROR]", tokenBatch[idx], r.error);
                const errCode = r.error?.code;
                if (errCode === 'messaging/registration-token-not-registered' || errCode === 'messaging/invalid-registration-token') {
                  badTokens.push(tokenBatch[idx]);
                }
              }
            });

            if (badTokens.length > 0) {
              console.log("[FCM CleanUp] Cleaning up invalid tokens:", badTokens.length);
              for (const token of badTokens) {
                try {
                  const snap = await db.collection('fcm_tokens').where('token', '==', token).get();
                  if (!snap.empty) {
                    const cleanupBatch = db.batch();
                    snap.docs.forEach(doc => {
                      console.log(`[FCM CleanUp] Deleting unregistered token: ${doc.id}`);
                      cleanupBatch.delete(doc.ref);
                    });
                    await cleanupBatch.commit();
                  }
                } catch (cleanupErr) {
                  console.error("[FCM CleanUp ERROR]", cleanupErr);
                }
              }
            }
          }
        } catch (fcmErr: any) {
          console.error("[FCM FATAL ERROR]", fcmErr);
          return res.status(500).json({
            status: "error",
            error: fcmErr.message || "FCM send failed"
          });
        }
        successCount += response.successCount;
      }
      
      res.json({ status: "success", successCount: successCount });
    } catch(e: any) {
      console.error("[send-oos-push] Error:", e);
      res.json({ status: "error", error: e.message || "Unknown error occurred" });
    }
  });
  app.get("/api/oos-history", async (req, res) => {
    try {
      if (!db) return res.status(500).json({ error: "No DB" });
      const limitParam = parseInt((req.query.limit as string) || "500", 10);
      const snap = await db.collection("oos_history").limit(limitParam).get();
      const items = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      res.json({ status: "success", data: items });
    } catch(e: any) {
      res.status(500).json({ status: "error", error: e.message });
    }
  });

  app.post("/api/admin/archive-logs", async (req, res) => {
    try {
      if (!db) return res.status(500).json({ error: "No DB" });

      // Calculate 48 hours ago
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const logsToArchive: any[] = [];
      
      // 1. Get old OOS History
      const oosSnap = await db.collection("oos_history").where("timestamp", "<", fortyEightHoursAgo).get();
      const oosBatch = db.batch();
      oosSnap.docs.forEach(doc => {
        logsToArchive.push({ type: 'oos', id: doc.id, ...doc.data() });
        oosBatch.delete(doc.ref);
      });

      // 2. Get old Alerts
      const alertsSnap = await db.collection("alerts").where("triggeredAt", "<", fortyEightHoursAgo).get();
      const alertsBatch = db.batch();
      alertsSnap.docs.forEach(doc => {
        logsToArchive.push({ type: 'alert', id: doc.id, ...doc.data() });
        alertsBatch.delete(doc.ref);
      });

      if (logsToArchive.length === 0) {
        return res.json({ status: "success", archivedCount: 0, message: "No logs older than 48 hours found." });
      }

      // 3. Push to Google Sheet V2
      const V2_FALLBACK = "https://script.google.com/macros/s/AKfycbxGr0rRSmIuutAd80GfkVO4lYZ-ObJ4WY9hr-xfLim1Is_t1gUBKStJ7nb7LoepIEA_IA/exec";
      const rawUrl = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || V2_FALLBACK).trim();
      
      const syncParams = new URLSearchParams();
      syncParams.append('action', 'archiveOldLogs');
      syncParams.append('payload', JSON.stringify(logsToArchive));

      await axios.post(rawUrl, syncParams.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 60000
      });

      // 4. Delete from Firestore to save space
      if (!oosSnap.empty) await oosBatch.commit();
      if (!alertsSnap.empty) await alertsBatch.commit();

      res.json({ status: "success", archivedCount: logsToArchive.length });
    } catch (e: any) {
      console.error("[archive-logs] Error:", e);
      res.status(500).json({ status: "error", error: e.message });
    }
  });

  // GAS Proxy Route
    app.all(["/api/proxy-gas", "/proxy-gas"], async (req, res) => {
    const start = Date.now();
    const action = req.query.action || "unknown";
    console.log(`[Proxy] >>> Incoming Request: ${req.method} ${req.url} (Path: ${req.path})`);
    try {
      console.log(`[Proxy] >>> START ${req.method} action=${action}`);
      
      // Hierarchy: 1. Specialized V2 env (PRIORITY), 2. query param, 3. general GAS env, 4. Hardcoded fallback
      const V1_FALLBACK = "https://script.google.com/macros/s/AKfycbziSK-a3_zBsoEPHBe1Yaz-pTEYtnZyuHdTPhziDSlB3Vhn8DZ0qaPLICnb9eY_ptj5/exec";
      const V2_FALLBACK = "https://script.google.com/macros/s/AKfycbxGr0rRSmIuutAd80GfkVO4lYZ-ObJ4WY9hr-xfLim1Is_t1gUBKStJ7nb7LoepIEA_IA/exec";
      
      let rawUrl = (typeof req.query.gasUrl === 'string' ? req.query.gasUrl : "").trim();
      
      // Automatic routing logic if no specific gasUrl provided
      if (!rawUrl || rawUrl === "undefined" || !rawUrl.startsWith("http")) {
        if (action === "getMatrixDataV2" || req.headers['x-use-v2-gas'] === 'true') {
           rawUrl = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || V2_FALLBACK).trim();
        } else {
           rawUrl = (process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || V1_FALLBACK).trim();
        }
      }
      
      // Final sanity check
      if (!rawUrl || rawUrl === "undefined" || !rawUrl.startsWith("http")) {
        rawUrl = V1_FALLBACK;
      }

      let urlObj: URL;
      try {
        urlObj = new URL(rawUrl);
      } catch (e) {
        return res.status(400).json({ status: "error", message: "Invalid GAS URL configuration" });
      }

      console.log(`[Proxy] Incoming request: ${req.method} action=${action}`);

      const cacheKey = req.method + ":" + rawUrl + ":" + JSON.stringify(Object.keys(req.query).sort().reduce((acc: any, k) => {
        if (k !== '_t' && k !== 'gasUrl') acc[k] = req.query[k];
        return acc;
      }, {}));

      for (const [key, value] of Object.entries(req.query)) {
        if (key !== 'gasUrl') urlObj.searchParams.set(key, String(value));
      }

      const config: any = {
        method: req.method,
        url: urlObj.toString(),
        timeout: 45000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
        },
        validateStatus: () => true,
        maxRedirects: 15
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams();
          for (const key in req.body) params.append(key, req.body[key]);
          config.data = params.toString();
          config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        } else {
          config.data = req.body;
          config.headers['Content-Type'] = req.headers['content-type'] || 'application/json';
        }
      }

      const skipCache = req.method !== 'GET' || req.query.cache === 'skip' || req.query._skipCache === 'true';
      const response = await executeGasRequest(config, { skipCache, cacheKey });
      
      if (res.headersSent) {
        console.warn(`[Proxy] Response already sent for action=${action}, skipping send.`);
        return;
      }

      // Consistent content type
      const contentType = response.headers?.['content-type'] || 'application/json';
      res.setHeader('Content-Type', contentType);
      
      // OPTIMIZATION: Send data directly if it matches desired format
      const responseSize = response.data 
        ? (typeof response.data === 'string' ? response.data.length : JSON.stringify(response.data).length) 
        : 0;
      
      const mem = process.memoryUsage();
      console.log(`[Proxy] Response action=${action} size=${(responseSize / 1024).toFixed(1)}KB | Mem: RSS=${(mem.rss / 1024 / 1024).toFixed(1)}MB`);

      // Detect common GAS error indicators in the raw response
      if (typeof response.data === 'string') {
        const isHtml = response.data.includes('<!DOCTYPE html>') || response.data.includes('<html');
        const isError = response.data.includes('goog-script-error') || response.data.includes('Rate exceeded');
        
        if (isError || (isHtml && !response.data.includes('JSON'))) {
          console.error(`[Proxy] Detected INVALID Response from GAS for action=${action}: ${isHtml ? 'HTML' : 'Error Page'}`);
          const isRate = response.data.includes('Rate exceeded');
          return res.status(isRate ? 429 : 502).json({ 
            status: "error", 
            message: isRate ? "Rate limit reached" : (isHtml ? "GAS returned HTML (Login or Deployment issue?)" : "GAS Error"),
            debug: response.data.substring(0, 100)
          });
        }
      }
      
      // LOG DATA SUMMARY
      if (response.data) {
        if (Array.isArray(response.data)) {
           console.log(`[Proxy] Response action=${action} is ARRAY with ${response.data.length} items`);
        } else if (typeof response.data === 'object') {
           console.log(`[Proxy] Response action=${action} is OBJECT with keys: ${Object.keys(response.data).join(', ')}`);
        } else {
           const strPreview = String(response.data).substring(0, 150);
           console.log(`[Proxy] Response action=${action} is ${typeof response.data} (length: ${String(response.data).length}) | Preview: ${strPreview}`);
        }
      } else {
        console.warn(`[Proxy] Response action=${action} is EMPTY/NULL`);
      }
      
      res.status(response.status).send(response.data);
      console.log(`[Proxy] <<< END ${req.method} action=${action} in ${Date.now() - start}ms`);
    } catch (error: any) {
      console.error(`[Proxy] FATAL Error for ${req.query.action}:`, error.message);
      if (!res.headersSent) {
        res.status(500).json({ status: "error", error: error.message });
      }
    }
  });

  // Firebase Auth
  app.post("/api/auth/token", async (req, res) => {
    try {
      const { empId, user } = req.body;
      if (!empId || !admin.apps.length) return res.status(400).json({ error: "Auth missing" });
      
      const userId = String(empId).trim();

      // OPTIMIZATION: Sync user data to Firestore via Admin SDK BEFORE creating token.
      // This solves the race condition where onSnapshot reads stale data on the client.
      if (user && db) {
        try {
          // Normalize role for consistent storage
          const normalizedUser = { ...user };
          if (normalizedUser.role) normalizedUser.role = String(normalizedUser.role).toLowerCase();
          
          await db.collection('users').doc(userId).set({
            ...normalizedUser,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          console.log(`[Server] Profile synced for ${userId}`);
        } catch (dbErr) {
          console.warn(`[Server] Non-blocking profile sync failed for ${userId}:`, dbErr);
        }
      }

      const customToken = await admin.auth().createCustomToken(userId);
      res.json({ token: customToken });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- ADMIN USER MANAGEMENT ---

  const mapUsernameToEmail = (username: string) => `${username.toLowerCase().trim()}@lulu.com`;

  // Helper for one-way sync to GAS
  const syncUserToGas = async (user: any, action: 'upsert' | 'delete') => {
    try {
      let baseUrl = (process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "").trim();
      if (!baseUrl || baseUrl === "undefined" || !baseUrl.startsWith("http")) {
        baseUrl = "https://script.google.com/macros/s/AKfycbziSK-a3_zBsoEPHBe1Yaz-pTEYtnZyuHdTPhziDSlB3Vhn8DZ0qaPLICnb9eY_ptj5/exec";
      }
    const params = new URLSearchParams();
    params.append('action', 'syncUser');
    params.append('syncAction', action);
    params.append('username', user.username || "");
    params.append('empId', user.empId || "");
    params.append('name', user.name || "");
    params.append('role', user.role || "");
    params.append('storeId', user.storeId || "");
    params.append('region', user.region || "");
    params.append('status', user.status || "Active");
    params.append('updatedAt', user.updatedAt || new Date().toISOString());
    params.append('shiftStart', user.shiftStart !== undefined ? String(user.shiftStart) : "6");
    params.append('shiftHours', user.shiftHours !== undefined ? String(user.shiftHours) : "8");
    params.append('weekOffDay', user.weekOffDay || "");
    
    // Only sync image if it's "small" (under 50KB length for safety in Sheets)
    if (user.profileImage) {
      if (user.profileImage.length < 50000) {
        params.append('profileImage', user.profileImage);
      } else {
        console.log(`[Sync] Skipping large image sync for ${user.username} (${user.profileImage.length} chars)`);
        params.append('profileImage', "IMAGE_TOO_LARGE_IN_SHEET");
      }
    }
      if (user.password) params.append('password', user.password);

      console.log(`[Sync] Triggering GAS sync for ${user.username} (${action})...`);
      await axios.post(baseUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000 // 30 second timeout
      });
      console.log(`[Sync] GAS sync completed for ${user.username}`);
    } catch (e: any) {
      console.error(`[Sync] GAS sync failed for ${user.username}:`, e.message);
    }
  };

  // 1. Upsert User (Create or Update)
  app.post("/api/admin/users/upsert", async (req, res) => {
    try {
      const { user: userData, password, requesterId } = req.body;
      if (!userData || !userData.username || !userData.empId) {
        return res.status(400).json({ error: "Missing required user fields" });
      }
      if (!requesterId) return res.status(401).json({ error: "Requester ID required" });

      // Admin access check
      if (db) {
        const rId = String(requesterId).trim();
        let isAdmin = rId === 'SYSTEM_MIGRATION'; // Bypass for self-migration during login
        let currentRole = isAdmin ? 'admin' : 'Unknown';

        if (!isAdmin) {
          const adminDoc = await db.collection('users').doc(rId).get();
          const adminData = adminDoc.data();
          const role = String(adminData?.role || "").toLowerCase().trim();
          isAdmin = adminDoc.exists && (role === 'admin' || role === 'operator');
          currentRole = adminData?.role || 'Unknown';
        }

        console.log(`[Admin Check] Requester: ${rId}, isAdmin: ${isAdmin}, Role: ${currentRole}`);

        if (!isAdmin) {
          console.warn(`[Admin Check] Access denied for ${rId}. Role found: ${currentRole}`);
          return res.status(403).json({ error: `Access denied: Admin role required. Your role is ${currentRole}` });
        }
      }

      const email = mapUsernameToEmail(userData.username);
      const uid = String(userData.empId).trim();

      // Ensure no email collision with other UIDs
      try {
        const existingEmailUser = await admin.auth().getUserByEmail(email);
        if (existingEmailUser && existingEmailUser.uid !== uid) {
          console.log(`[Admin] Email ${email} in use by UID ${existingEmailUser.uid}. Deleting conflict.`);
          await admin.auth().deleteUser(existingEmailUser.uid);
        }
      } catch (e) {}

      // Check if user exists in Auth
      let authUser;
      try {
        authUser = await admin.auth().getUser(uid);
      } catch (e) {
        // User doesn't exist, will create below
      }

      if (authUser) {
        // Update existing
        await admin.auth().updateUser(uid, {
          email,
          displayName: userData.name,
          ...(password ? { password } : {})
        });
        console.log(`[Admin] Updated Auth for ${uid}`);
      } else {
        // Create new
        await admin.auth().createUser({
          uid,
          email,
          password: password || "Lulu@123", // Default if missing
          displayName: userData.name,
          emailVerified: true
        });
        console.log(`[Admin] Created Auth for ${uid}`);
      }

      // Sync Firestore
      if (db) {
        await db.collection('users').doc(uid).set({
          ...userData,
          role: String(userData.role || "picker").toLowerCase(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      // One-way sync to GAS (non-blocking)
      syncUserToGas({ ...userData, password }, 'upsert');

      res.json({ status: "success", message: "User upserted successfully" });
    } catch (error: any) {
      console.error("[Admin] Upsert error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Delete User
  app.post("/api/admin/users/delete", async (req, res) => {
    try {
      const { empId, username, requesterId } = req.body;
      if (!empId) return res.status(400).json({ error: "empId required" });
      if (!requesterId) return res.status(401).json({ error: "Requester ID required for security check" });

      // Admin access check
      if (db) {
        const rId = String(requesterId).trim();
        let isAdmin = rId === 'SYSTEM_MIGRATION';
        let currentRole = isAdmin ? 'admin' : 'Unknown';

        if (!isAdmin) {
          const adminDoc = await db.collection('users').doc(rId).get();
          const adminData = adminDoc.data();
          const role = String(adminData?.role || "").toLowerCase().trim();
          isAdmin = adminDoc.exists && (role === 'admin' || role === 'operator');
          currentRole = adminData?.role || 'Unknown';
        }

        if (!isAdmin) {
          console.warn(`[Admin Check] Access denied for ${rId}. Role found: ${currentRole}`);
          return res.status(403).json({ error: `Access denied: Only administrators and operators can delete users. Your role is ${currentRole}` });
        }
      }

      const uid = String(empId).trim();
      console.log(`[Admin] Deleting user ${uid} (requested by ${requesterId})`);

      // Delete from Auth
      try {
        await admin.auth().deleteUser(uid);
      } catch (e: any) {
        if (e.code === 'auth/user-not-found') {
          console.warn(`[Admin] User ${uid} not found in Auth during deletion`);
        } else {
          throw e; // Throw other auth errors
        }
      }

      // Delete from Firestore
      if (db) {
        await db.collection('users').doc(uid).delete();
      }

      // One-way sync to GAS (non-blocking)
      syncUserToGas({ empId: uid, username }, 'delete');

      res.json({ status: "success", message: "User deleted successfully" });
    } catch (error: any) {
      console.error("[Admin] Deletion error:", error);
      res.status(500).json({ error: error.message || "Failed to delete user" });
    }
  });

  // 3. Reset Password
  app.post("/api/admin/users/reset-password", async (req, res) => {
    try {
      const { empId, newPassword, requesterId } = req.body;
      if (!empId || !newPassword) return res.status(400).json({ error: "empId and newPassword required" });
      if (!requesterId) return res.status(401).json({ error: "Requester ID required" });

      // Admin access check
      if (db) {
        const rId = String(requesterId).trim();
        let isAdmin = rId === 'SYSTEM_MIGRATION';
        let currentRole = isAdmin ? 'admin' : 'Unknown';

        if (!isAdmin) {
          const adminDoc = await db.collection('users').doc(rId).get();
          const adminData = adminDoc.data();
          const role = String(adminData?.role || "").toLowerCase().trim();
          isAdmin = adminDoc.exists && (role === 'admin' || role === 'operator');
          currentRole = adminData?.role || 'Unknown';
        }

        if (!isAdmin) {
          console.warn(`[Admin Check] Access denied for ${rId}. Role found: ${currentRole}`);
          return res.status(403).json({ error: `Access denied: Admin/Operator role required. Your role is ${currentRole}` });
        }
      }

      await admin.auth().updateUser(String(empId).trim(), {
        password: newPassword
      });

      // Fetch user to sync password back to GAS
      if (db) {
        const snap = await db.collection('users').doc(String(empId).trim()).get();
        if (snap.exists) {
          await syncUserToGas({ ...snap.data(), password: newPassword }, 'upsert');
        }
      }

      res.json({ status: "success", message: "Password reset successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4. One-time Migration Utility
  app.get("/api/admin/migrate-users", async (req, res) => {
    try {
      // 1. Fetch users from GAS
      let baseUrl = (process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "").trim();
      if (!baseUrl || baseUrl === "undefined" || !baseUrl.startsWith("http")) {
        baseUrl = "https://script.google.com/macros/s/AKfycbziSK-a3_zBsoEPHBe1Yaz-pTEYtnZyuHdTPhziDSlB3Vhn8DZ0qaPLICnb9eY_ptj5/exec";
      }
      const gasRes = await axios.get(`${baseUrl}?action=getAdminData&role=admin`);
      const users = gasRes.data.data?.users || gasRes.data.users || [];

      console.log(`[Migrate] Starting migration for ${users.length} users...`);
      const results = [];

      for (const user of users) {
        try {
          const uid = String(user.empId || user.EmpId || "").trim();
          const username = String(user.username || "").trim();
          const password = String(user.password || "").trim();
          if (!uid || !username) continue;

          console.log(`[Migrate] Processing ${username} (${uid})...`);
          const email = mapUsernameToEmail(username);

          // Handle email conflicts
          try {
            const existingEmailUser = await admin.auth().getUserByEmail(email);
            if (existingEmailUser && existingEmailUser.uid !== uid) {
              console.log(`[Migrate] Email ${email} in use by UID ${existingEmailUser.uid}. Deleting conflict.`);
              await admin.auth().deleteUser(existingEmailUser.uid);
            }
          } catch (e) {}

          // Create in Auth (ignore if exists)
          try {
            await admin.auth().createUser({
              uid,
              email,
              password: password || "Lulu@123",
              displayName: user.name,
              emailVerified: true
            });
          } catch (e: any) {
            if (e.code === 'auth/uid-already-exists') {
              console.log(`[Migrate] Auth user ${uid} already exists, updating...`);
              await admin.auth().updateUser(uid, { email, displayName: user.name });
            } else { throw e; }
          }

          // Create in Firestore
          if (db) {
            await db.collection('users').doc(uid).set({
              ...user,
              empId: uid, // Normalize keys
              role: String(user.role || "picker").toLowerCase(),
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
          results.push({ username, status: "migrated" });
        } catch (err: any) {
          console.error(`[Migrate] Failed user ${user.username}:`, err.message);
          results.push({ username: user.username, status: "failed", error: err.message });
        }
      }

      res.json({ status: "success", count: results.length, details: results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite

  if (process.env.NODE_ENV !== "production") {
    // Dynamically import Vite to avoid bundling it in Vercel production functions
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  return { app, db, messaging };
}

const serverPromise = startServer();

// Vercel Serverless Function entry point
export default async (req: any, res: any) => {
  const { app } = await serverPromise;
  return app(req, res);
};

// Start server for traditional environments
if (typeof process !== 'undefined' && (!process.env.VERCEL || process.env.NODE_ENV !== 'production')) {
  serverPromise.then(({ app, db, messaging }) => {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Server] Running on port ${PORT}`);
      
      // Background monitor logic disabled for standalone API function deployment
    });
  }).catch(err => {
    console.error("[Server] Startup failed:", err);
  });
}