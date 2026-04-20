import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// ── Named database ID ──────────────────────────────────────────────────────
// Must match `firestoreDatabaseId` in firebase-applet-config.json AND the
// initializeFirestore(..., databaseId) call in the client's firebase.ts.
//
// BUG FIX: The previous code used `admin.firestore()` which targets the
// (default) database. Every profile written there was invisible to the client
// (which uses the named DB) and to Firestore security rules — so isAdmin()
// always returned false and broadcast writes were silently rejected.
const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  'ai-studio-589cf723-ab60-4b6f-a2cd-f84f8c8c1b48';

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

    // Sync user profile to the NAMED Firestore database using Admin SDK
    // (bypasses security rules). getFirestore(app, databaseId) is required
    // to target any non-default database from the Admin SDK.
    if (user) {
      const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
      await db.collection('users').doc(String(empId)).set({
        ...user,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      console.log(`[auth/token] Profile synced for ${empId} → named DB (${FIRESTORE_DATABASE_ID})`);
    }

    // Create custom auth token for this empId
    const token = await admin.auth().createCustomToken(String(empId));
    return res.status(200).json({ token });
  } catch (err: any) {
    console.error('[auth/token] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
