import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';

const FIRESTORE_DB_ID = 'ai-studio-589cf723-ab60-4b6f-a2cd-f84f8c8c1b48';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
  });
}

const db = getFirestore(admin.app(), FIRESTORE_DB_ID);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { empId, newPassword, requesterId } = req.body;
    if (!empId || !newPassword) return res.status(400).json({ error: "empId and newPassword required" });

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
      return res.status(403).json({ error: `Access denied: Admin role required. Your role is ${currentRole}` });
    }

    // 1. Update Firebase Auth
    await admin.auth().updateUser(String(empId).trim(), {
      password: newPassword
    });

    // 2. Fetch user to sync password back to GAS
    const snap = await db.collection('users').doc(String(empId).trim()).get();
    if (snap.exists) {
      const userData = snap.data();
      try {
        const gasUrl = (process.env.GAS_API_URL || "https://script.google.com/macros/s/AKfycbynf6n_5CXYyb4xXqwR-EoO_50BFgsiT98_JkRdftZDsDN7UQvgZoJCcuEN0Yr0vuIR/exec").trim();
        const params = new URLSearchParams();
        params.append('action', 'syncUser');
        params.append('syncAction', 'upsert');
        params.append('username', userData?.username || "");
        params.append('empId', String(empId));
        params.append('password', newPassword);
        await axios.post(gasUrl, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000 
        });
      } catch (err: any) {
        console.error("[Vercel Admin] GAS Password Sync failed:", err.message);
      }
    }

    res.status(200).json({ status: "success", message: "Password reset successfully" });
  } catch (error: any) {
    console.error("[Vercel Admin] Reset Password error:", error);
    res.status(500).json({ error: error.message });
  }
}
