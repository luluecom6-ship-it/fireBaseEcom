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
  }
}

const db = getFirestore(admin.app(), FIRESTORE_DB_ID);

function mapUsernameToEmail(username: string) {
  return `${username.toLowerCase().trim()}@lulu.com`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  try {
    // 1. Fetch users from GAS
    const baseUrl = (process.env.GAS_API_URL || "https://script.google.com/macros/s/AKfycbziSK-a3_zBsoEPHBe1Yaz-pTEYtnZyuHdTPhziDSlB3Vhn8DZ0qaPLICnb9eY_ptj5/exec").trim();
    const gasRes = await axios.get(`${baseUrl}?action=getAdminData&role=admin`);
    const users = gasRes.data.data?.users || gasRes.data.users || [];

    console.log(`[Vercel Migrate] Starting migration for ${users.length} users...`);
    const results = [];

    for (const user of users) {
      try {
        const uid = String(user.empId || user.EmpId || "").trim();
        const username = String(user.username || "").trim();
        const password = String(user.password || "").trim();
        if (!uid || !username) continue;

        const email = mapUsernameToEmail(username);

        // Create in Auth
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
            await admin.auth().updateUser(uid, { email, displayName: user.name });
          } else throw e;
        }

        // Create in Firestore
        await db.collection('users').doc(uid).set({
          ...user,
          empId: uid,
          role: String(user.role || "picker").toLowerCase(),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        results.push({ username, status: "migrated" });
      } catch (err: any) {
        results.push({ username: user.username, status: "failed", error: err.message });
      }
    }

    res.status(200).json({ status: "success", count: results.length, details: results });
  } catch (error: any) {
    const errorMsg = error.message || "Unknown server error";
    const isCryptoError = errorMsg.includes('DECODER') || errorMsg.includes('PEM');
    res.status(500).json({ 
      error: errorMsg + (isCryptoError ? " (Firebase Private Key format issue)" : ""),
      code: error.code || 'UNKNOWN'
    });
  }
}
