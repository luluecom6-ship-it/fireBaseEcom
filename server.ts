import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import cors from "cors";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import { executeGasRequest } from "./src/services/gasService.ts";
import { runMonitorTick } from "./src/services/monitorService.ts";

const FIRESTORE_DB_ID = process.env.FIREBASE_DATABASE_ID || 'ai-studio-589cf723-ab60-4b6f-a2cd-f84f8c8c1b48';


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
      rawUrl = "https://script.google.com/macros/s/AKfycbynf6n_5CXYyb4xXqwR-EoO_50BFgsiT98_JkRdftZDsDN7UQvgZoJCcuEN0Yr0vuIR/exec";
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
      if (response.headers && response.headers['content-type']) {
        res.setHeader('Content-Type', response.headers['content-type']);
      }
      
      const dataStr = response.data 
        ? (typeof response.data === 'string' ? response.data : JSON.stringify(response.data)) 
        : "";
        
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

  // --- ADMIN USER MANAGEMENT ---

  const mapUsernameToEmail = (username: string) => `${username.toLowerCase().trim()}@lulu.com`;

  // Helper for one-way sync to GAS
  const syncUserToGas = async (user: any, action: 'upsert' | 'delete') => {
    try {
      const baseUrl = (process.env.GAS_API_URL || "https://script.google.com/macros/s/AKfycbynf6n_5CXYyb4xXqwR-EoO_50BFgsiT98_JkRdftZDsDN7UQvgZoJCcuEN0Yr0vuIR/exec").trim();
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
      if (user.password) params.append('password', user.password);

      console.log(`[Sync] Triggering GAS sync for ${user.username} (${action})...`);
      await axios.post(baseUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000 // 10 second timeout
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
          isAdmin = adminDoc.exists && String(adminData?.role || "").toLowerCase() === 'admin';
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
          isAdmin = adminDoc.exists && String(adminData?.role || "").toLowerCase() === 'admin';
          currentRole = adminData?.role || 'Unknown';
        }

        if (!isAdmin) {
          console.warn(`[Admin Check] Access denied for ${rId}. Role found: ${currentRole}`);
          return res.status(403).json({ error: `Access denied: Only administrators can delete users. Your role is ${currentRole}` });
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
          isAdmin = adminDoc.exists && String(adminData?.role || "").toLowerCase() === 'admin';
          currentRole = adminData?.role || 'Unknown';
        }

        if (!isAdmin) {
          console.warn(`[Admin Check] Access denied for ${rId}. Role found: ${currentRole}`);
          return res.status(403).json({ error: `Access denied: Admin role required. Your role is ${currentRole}` });
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
      const baseUrl = (process.env.GAS_API_URL || "https://script.google.com/macros/s/AKfycbynf6n_5CXYyb4xXqwR-EoO_50BFgsiT98_JkRdftZDsDN7UQvgZoJCcuEN0Yr0vuIR/exec").trim();
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
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server on :${PORT}`);
    
    // Start background monitor (wait 10s for stability, then recursively schedule)
    if (db && messaging) {
      const runTick = async () => {
        try {
          await runMonitorTick(db, messaging);
        } catch (e) {
          console.error("[Monitor] Tick failed:", e);
        } finally {
          setTimeout(runTick, 60000); // Schedule next tick 60s after previous one finished
        }
      };
      setTimeout(runTick, 10000);
    }
  });
}

startServer().catch(err => {
  console.error("Startup error:", err);
  process.exit(1);
});
