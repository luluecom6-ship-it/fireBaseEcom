import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import admin from "firebase-admin";
import { detectAlerts } from "./src/utils/alertLogic.js";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { runMonitorTick } from "./src/services/monitorService.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  const db = serviceAccount ? admin.firestore() : null;
  const messaging = serviceAccount ? admin.messaging() : null;

  // Background Monitor Logic
  if (db && messaging) {
    console.log("Starting Background Monitor...");
    setInterval(() => runMonitorTick(db, messaging).catch(console.error), 60000);
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
