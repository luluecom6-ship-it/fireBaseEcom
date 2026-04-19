import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import cors from "cors";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import { runMonitorTick } from "./src/services/monitorService";
import { executeGasRequest } from "./src/services/gasService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  let serviceAccount = null;
  try {
    const saVar = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (saVar) {
      let raw = String(saVar).trim();
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        raw = raw.substring(firstBrace, lastBrace + 1);
      }
      try {
        serviceAccount = JSON.parse(raw);
      } catch (parseErr) {
        if (raw.startsWith('"') && raw.endsWith('"')) {
          try {
            const unquoted = JSON.parse(raw);
            serviceAccount = typeof unquoted === 'string' ? JSON.parse(unquoted) : unquoted;
          } catch (e) { throw parseErr; }
        } else { throw parseErr; }
      }
    }
  } catch (err) {
    console.error("CRITICAL: FIREBASE_SERVICE_ACCOUNT parsing failed.", err);
  }

  if (serviceAccount && !admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
      });
      console.log("Firebase Admin initialized successfully.");
    } catch (initErr) {
      console.error("Firebase Admin initialization error:", initErr);
    }
  }

  const db = serviceAccount ? getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId) : null;
  const messaging = serviceAccount ? admin.messaging() : null;

  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // GAS Proxy Route
  app.all("/api/proxy-gas", async (req, res) => {
    let rawUrl = (process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "").trim();
    const queryGasUrl = req.query.gasUrl;
    if (queryGasUrl) rawUrl = String(queryGasUrl).trim();
    
    // Consistent fallback across all environments
    if (!rawUrl || rawUrl === "undefined" || !rawUrl.startsWith("http")) {
      rawUrl = "https://script.google.com/macros/s/AKfycbyyN9uR3twJmu1zo5_yjw1wIiP6IgGRZLdctZ31DBnVsvpBguq1XUyh42Ro8k7x48es/exec";
    }

    let urlObj: URL;
    try {
      urlObj = new URL(rawUrl);
    } catch (e) {
      return res.status(400).json({ error: "Invalid GAS URL configuration" });
    }

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
      timeout: 60000,
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

    try {
      const skipCache = req.method !== 'GET' || req.query.cache === 'skip' || req.query._skipCache === 'true';
      const response = await executeGasRequest(config, { skipCache, cacheKey });
      if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);
      
      const dataStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      if (dataStr.includes('goog-script-error') || dataStr.includes('Rate exceeded')) {
        const isRate = dataStr.includes('Rate exceeded');
        return res.status(isRate ? 429 : 502).json({ 
          status: "error", 
          message: isRate ? "Rate limit reached" : "GAS Error",
          debug: dataStr.substring(0, 100) 
        });
      }
      res.status(response.status).send(response.data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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

  // Monitor Logic
  if (db && messaging) {
    console.log("Monitor started (10m interval)");
    // Increase to 10 minutes to save quota
    setInterval(() => runMonitorTick(db, messaging).catch(e => console.error(e)), 600000);
  }

  // Vite
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server on :${PORT}`));
}

startServer().catch(err => {
  console.error("Startup error:", err);
  process.exit(1);
});
