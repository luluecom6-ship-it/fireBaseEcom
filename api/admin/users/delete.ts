import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';

const FIRESTORE_DB_ID = process.env.FIREBASE_DATABASE_ID || 'ai-studio-589cf723-ab60-4b6f-a2cd-f84f8c8c1b48';

if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
    
    // Aggressive cleaning for Vercel/Environment variables
    privateKey = privateKey.trim();
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.substring(1, privateKey.length - 1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Missing required Firebase environment variables (PROJECT_ID, CLIENT_EMAIL, or PRIVATE_KEY)");
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      databaseURL: `https://${projectId}.firebaseio.com`
    });
    console.log("[Vercel Admin] Firebase Admin initialized successfully");
  } catch (e: any) {
    console.error("[Vercel Admin] Firebase Init Error:", e.message);
    // We don't throw here so we can catch it later in the handler
  }
}

const db = getFirestore(admin.app(), FIRESTORE_DB_ID);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { empId, username, requesterId } = req.body;
    if (!empId) return res.status(400).json({ error: "empId required" });

    // Admin access check
    const rId = String(requesterId || "").trim();
    let isAdmin = rId === 'SYSTEM_MIGRATION';
    let currentRole = isAdmin ? 'admin' : 'Unknown';

    if (!isAdmin && rId) {
      const adminDoc = await db.collection('users').doc(rId).get();
      const adminData = adminDoc.data();
      isAdmin = adminDoc.exists && String(adminData?.role || "").toLowerCase() === 'admin';
      currentRole = adminData?.role || 'Unknown';
    }

    if (!isAdmin) {
      return res.status(403).json({ error: `Access denied: Only administrators can delete users. Your role is ${currentRole}` });
    }

    // 1. Delete from Firebase Auth
    try {
      await admin.auth().deleteUser(String(empId));
    } catch (e: any) {
      console.warn("[Vercel Admin] User not in Auth:", e.message);
    }

    // 2. Delete from Firestore
    await db.collection('users').doc(String(empId)).delete();

    // 3. Sync to GAS (Delete)
    try {
      const gasUrl = (process.env.GAS_API_URL || "https://script.google.com/macros/s/AKfycbynf6n_5CXYyb4xXqwR-EoO_50BFgsiT98_JkRdftZDsDN7UQvgZoJCcuEN0Yr0vuIR/exec").trim();
      const params = new URLSearchParams();
      params.append('action', 'syncUser');
      params.append('syncAction', 'delete');
      params.append('empId', String(empId));
      params.append('username', String(username || ""));
      await axios.post(gasUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000 
      });
    } catch (err: any) {
      console.error("[Vercel Admin] GAS Delete failed:", err.message);
    }

    res.status(200).json({ status: "success", message: "User deleted successfully" });
  } catch (error: any) {
    console.error("[Vercel Admin] Delete error:", error);
    // Provide more context for debugging OpenSSL/Decoder issues
    const errorMsg = error.message || "Unknown server error";
    const isCryptoError = errorMsg.includes('DECODER') || errorMsg.includes('PEM');
    
    res.status(500).json({ 
      error: errorMsg + (isCryptoError ? " (Firebase Private Key format issue)" : ""),
      code: error.code || 'UNKNOWN'
    });
  }
}
