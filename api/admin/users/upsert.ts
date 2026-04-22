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

async function syncUserToGas(user: any, action: 'upsert' | 'delete') {
  try {
    const gasUrl = (process.env.GAS_API_URL || "https://script.google.com/macros/s/AKfycbynf6n_5CXYyb4xXqwR-EoO_50BFgsiT98_JkRdftZDsDN7UQvgZoJCcuEN0Yr0vuIR/exec").trim();
    const params = new URLSearchParams();
    params.append('action', 'syncUser');
    params.append('syncAction', action);
    params.append('username', user.username || "");
    params.append('empId', user.empId || "");
    params.append('name', user.name || "");
    params.append('storeId', user.storeId || "");
    params.append('role', user.role || "");
    params.append('region', user.region || "");
    params.append('status', user.status || "Active");
    if (user.password) params.append('password', user.password);

    console.log(`[Vercel Admin] Syncing ${user.username} to GAS...`);
    await axios.post(gasUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000 
    });
  } catch (err: any) {
    console.error("[Vercel Admin] GAS Sync failed:", err.message);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user: userData, password, requesterId } = req.body;
    if (!userData || !userData.username) return res.status(400).json({ error: "User data required" });

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

    const uid = String(userData.empId || userData.username).trim();
    const email = `${userData.username.toLowerCase()}@lulu.com`;

    // 1. Auth Management
    try {
      await admin.auth().getUser(uid);
      await admin.auth().updateUser(uid, {
        email,
        displayName: userData.name,
        ...(password ? { password } : {})
      });
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        await admin.auth().createUser({
          uid,
          email,
          displayName: userData.name,
          password: password || "Lulu@123"
        });
      } else throw e;
    }

    // 2. Firestore Sync
    await db.collection('users').doc(uid).set({
      ...userData,
      empId: uid,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // 3. One-way sync to GAS (non-blocking in serverless is tricky, but we await it with timeout)
    await syncUserToGas({ ...userData, password }, 'upsert');

    res.status(200).json({ status: "success", message: "User upserted successfully" });
  } catch (error: any) {
    console.error("[Vercel Admin] Upsert error:", error);
    res.status(500).json({ error: error.message });
  }
}
