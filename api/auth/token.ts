import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// ✅ The Firestore named database ID — must match frontend's firebase-applet-config.json
const FIRESTORE_DB_ID = 'ai-studio-589cf723-ab60-4b6f-a2cd-f84f8c8c1b48';

// Lazy-initialize Firebase Admin once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Replace literal \n in env var
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { empId, user } = req.body;
    if (!empId) return res.status(400).json({ error: 'empId required' });

    // ✅ FIX: Use getFirestore(app, databaseId) to target the NAMED database
    // The frontend client uses initializeFirestore(app, {...}, "ai-studio-...")
    // Without this, Admin SDK writes to (default) and client never sees the data
    if (user) {
      const app = admin.app();
      const db = getFirestore(app, FIRESTORE_DB_ID);
      await db.collection('users').doc(String(empId)).set({
        ...user,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    // Create custom auth token for this empId
    const token = await admin.auth().createCustomToken(String(empId));
    return res.status(200).json({ token });
  } catch (err: any) {
    console.error('[auth/token] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
