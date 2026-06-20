import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Reads the named Firestore database ID from:
 *   1. FIRESTORE_DATABASE_ID env var (set this in Vercel → most reliable)
 *   2. firebase-applet-config.json (fallback, works locally and in Vercel if file is present)
 *   3. "(default)" if neither is available
 */
function getDatabaseId(): string | undefined {
  if (process.env.FIRESTORE_DATABASE_ID) {
    return process.env.FIRESTORE_DATABASE_ID;
  }
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return config.firestoreDatabaseId || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Initializes (or retrieves) the Firebase Admin app.
 * IMPORTANT: This is called INSIDE the handler, not at module level.
 * Module-level init throws before the handler's try/catch can catch it,
 * causing unrecoverable 500s when env vars are missing.
 */
function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.app();

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  // Validate all required env vars upfront so the error message is actionable
  const missing: string[] = [];
  if (!projectId)   missing.push('FIREBASE_PROJECT_ID');
  if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
  if (!privateKey)  missing.push('FIREBASE_PRIVATE_KEY');

  if (missing.length > 0) {
    const msg = `[auth/token] Missing Vercel env vars: ${missing.join(', ')}. ` +
      'Add them in Vercel Dashboard → Project → Settings → Environment Variables.';
    console.error(msg);
    throw new Error(msg);
  }

  // Validate private key format (common issue: copied without -----BEGIN----- header)
  if (!privateKey.includes('-----BEGIN')) {
    const msg = '[auth/token] FIREBASE_PRIVATE_KEY appears malformed (missing -----BEGIN PRIVATE KEY----- header). ' +
      'Ensure the value includes the full key with literal \\n for newlines.';
    console.error(msg);
    throw new Error(msg);
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Initialize admin INSIDE the handler so errors are caught and returned as JSON
    const app = getAdminApp();

    const { empId, user } = req.body;
    if (!empId) return res.status(400).json({ error: 'empId required' });

    const databaseId = getDatabaseId();
    console.log(`[auth/token] Request for empId="${empId}" using database="${databaseId || '(default)'}"`);

    // Sync user profile to the CORRECT named Firestore database.
    // Previously admin.firestore() was used which targets (default), meaning
    // the profile was written to the wrong DB and every client-side listener
    // returned permission-denied because the document didn't exist where expected.
    if (user) {
      const db = databaseId
        ? getFirestore(app, databaseId)
        : admin.firestore();

      await db.collection('users').doc(String(empId)).set({
        ...user,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      console.log(`[auth/token] Profile synced for "${empId}" → database "${databaseId || '(default)'}"`);
    }

    // Issue a custom Firebase auth token bound to this empId.
    // The client calls signInWithCustomToken(auth, token) which satisfies
    // isAuthenticated() in Firestore rules, allowing all listeners to start.
    const token = await admin.auth(app).createCustomToken(String(empId));
    console.log(`[auth/token] Custom token issued for "${empId}"`);

    return res.status(200).json({ token, databaseId: databaseId || '(default)' });

  } catch (err: any) {
    // Return a structured JSON error so the client can log a meaningful message
    // instead of treating the 500 body as opaque.
    const message = err?.message || String(err);
    console.error('[auth/token] Handler error:', message);
    return res.status(500).json({
      error: message,
      hint: message.includes('env var') || message.includes('FIREBASE_')
        ? 'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in Vercel Environment Variables.'
        : 'Check Vercel function logs for details.',
    });
  }
}
