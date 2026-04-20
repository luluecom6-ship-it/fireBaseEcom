import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import path from 'path';

// Read named database ID from the same config the client uses (mirrors monitor.ts pattern)
let firestoreDatabaseId: string | undefined;
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  firestoreDatabaseId = config.firestoreDatabaseId || undefined;
  console.log('[auth/token] Using Firestore database:', firestoreDatabaseId || '(default)');
} catch (e) {
  console.warn('[auth/token] Could not read firebase-applet-config.json — falling back to (default) database');
}

// Lazy-initialize Firebase Admin once per Vercel function instance
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Env vars encode literal \n — replace with real newlines
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

    // CRITICAL FIX: Write to the SAME named database the client reads from.
    // Previously this used admin.firestore() which targets (default), causing
    // every client-side Firestore listener to fail with permission-denied because
    // the user profile never existed in the named database the client queried.
    if (user) {
      const db = firestoreDatabaseId
        ? getFirestore(admin.app(), firestoreDatabaseId)
        : admin.firestore();

      await db.collection('users').doc(String(empId)).set({
        ...user,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      console.log(`[auth/token] Synced profile for ${empId} to database: ${firestoreDatabaseId || '(default)'}`);
    }

    // Issue a custom auth token — client calls signInWithCustomToken() with this
    const token = await admin.auth().createCustomToken(String(empId));
    return res.status(200).json({ token });
  } catch (err: any) {
    console.error('[auth/token] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
