import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { detectAlerts } from "./src/utils/alertLogic";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { runMonitorTick } from "./src/services/monitorService";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing bodies (Must be before proxy)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // GAS Proxy Route - Top priority to avoid interception
  app.all("/api/proxy-gas", async (req, res) => {
    let gasUrl = (process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "").trim();
    
    // Fallback to the known working URL if env is missing or invalid
    if (!gasUrl || gasUrl === "undefined" || !gasUrl.startsWith("http")) {
      gasUrl = "https://script.google.com/macros/s/AKfycbxUVldHO9dPY9uTfuCc-A_RZUhkyngPQvMDpMC31nrjZV-SXWH2ZzXWIyDh3HDD_Zom/exec";
    }

    try {
      // Construction of target URL
      let target;
      try {
        target = new URL(gasUrl);
      } catch (e) {
        console.error(`[Proxy] Invalid GAS URL: ${gasUrl}`);
        return res.status(500).json({ status: "error", message: "Invalid GAS URL configured" });
      }

      for (const [key, value] of Object.entries(req.query)) {
        target.searchParams.set(key, String(value));
      }

      const requestId = Math.random().toString(36).substring(7);
      console.log(`[Proxy][${requestId}] ${req.method} -> ${target.origin}${target.pathname}?action=${req.query.action || 'none'}`);
      
      const config: any = {
        method: req.method,
        url: target.toString(),
        timeout: 45000,
        maxRedirects: 15,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
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

      const response = await axios(config);
      
      if (response.headers['content-type']) {
        res.setHeader('Content-Type', response.headers['content-type']);
      }
      
      // DETECTION: Google Apps Script error pages (even with 200 OK)
      if (typeof response.data === 'string' && (
          response.data.includes('<title>Fehler</title>') || 
          response.data.includes('<title>Error</title>') ||
          response.data.includes('goog-script-error') ||
          (response.data.includes('<!DOCTYPE html>') && response.status === 200 && req.query.action)
      )) {
        console.error(`[Proxy] GAS returned an HTML error page. Status: ${response.status}`);
        return res.status(502).json({ 
          status: "error", 
          message: "Google Apps Script returned an error page instead of data. Please check script deployment and permissions.",
          debug: response.data.substring(0, 100)
        });
      }

      res.status(response.status).send(response.data);
    } catch (error: any) {
      console.error("[Proxy] CRITICAL ERROR:", error.message);
      res.status(500).json({ 
        status: "error", 
        message: "Proxy failed to reach Google Apps Script",
        details: error.message 
      });
    }
  });

  // Initialize Firebase Admin
  let serviceAccount = null;
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      let raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1) {
        raw = raw.substring(firstBrace, lastBrace + 1);
      }

      try {
        serviceAccount = JSON.parse(raw);
      } catch (e) {
        if (raw.startsWith('"') && raw.endsWith('"')) {
          const unquoted = JSON.parse(raw);
          serviceAccount = typeof unquoted === 'string' ? JSON.parse(unquoted) : unquoted;
        } else {
          throw e;
        }
      }
    }
  } catch (err) {
    console.error("CRITICAL: FIREBASE_SERVICE_ACCOUNT parsing failed.");
    console.error("Error:", err instanceof Error ? err.message : String(err));
    console.error("Please ensure you pasted the ENTIRE JSON object starting with { and ending with }.");
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });
    console.log("Firebase Admin initialized with Service Account.");
  } else {
    console.warn("FIREBASE_SERVICE_ACCOUNT not found. Backend push notifications will be disabled.");
  }

  const db = serviceAccount ? getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId) : null;
  const messaging = serviceAccount ? admin.messaging() : null;

  // Background Monitor Logic
  if (db && messaging) {
    console.log("Starting Background Monitor (5m interval)...");
    setInterval(() => runMonitorTick(db, messaging).catch(console.error), 300000);
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
