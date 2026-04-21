import type { VercelRequest, VercelResponse } from '@vercel/node';
// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: Use the modular firebase-admin API (firebase-admin/app etc.) NOT
// the legacy namespace import (import * as admin from 'firebase-admin').
//
// This project has "type": "module" in package.json (ESM). With firebase-admin
// v11+ in ESM, `import * as admin from 'firebase-admin'` resolves to the module
// namespace object, NOT the compat Admin instance — so admin.apps, admin.auth()
// etc. are undefined and the function crashes with a non-descriptive error before
// our validation code even runs. The modular API has no such ambiguity.
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import path from 'path';

const APP_NAME = 'lulu-admin';

/**
 * Reads the named Firestore database ID.
 * Priority: FIRESTORE_DATABASE_ID env var → firebase-applet-config.json → undefined (default)
 */
function getDatabaseId(): string | undefined {
  if (process.env.FIRESTORE_DATABASE_ID) return process.env.FIRESTORE_DATABASE_ID;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    return cfg.firestoreDatabaseId || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Initialises (or retrieves) the Firebase Admin app using the MODULAR API.
 * Called inside the handler so any init error is caught and returned as JSON.
 */
function getAdminApp(): App {
  const existing = getApps().find(a => a.name === APP_NAME);
  if (existing) return existing;

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Vercel stores literal \n — replace with real newlines.
  const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  const missing: string[] = [];
  if (!projectId)   missing.push('FIREBASE_PROJECT_ID');
  if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
  if (!privateKey)  missing.push('FIREBASE_PRIVATE_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Missing Vercel env vars: ${missing.join(', ')}. ` +
      'Go to Vercel Dashboard → your project → Settings → Environment Variables and add them.'
    );
  }

  if (!privateKey.includes('-----BEGIN')) {
    throw new Error(
      'FIREBASE_PRIVATE_KEY is malformed (missing -----BEGIN PRIVATE KEY----- header). ' +
      'Paste the complete private key from the Firebase service-account JSON, ' +
      'including the header/footer lines, with literal \\n for newlines.'
    );
  }

  return initializeApp(
    { credential: cert({ projectId: projectId!, clientEmail: clientEmail!, privateKey }) },
    APP_NAME
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const app = getAdminApp();

    const { empId, user } = req.body;
    if (!empId) return res.status(400).json({ error: 'empId required' });

    const databaseId = getDatabaseId();
    console.log(`[auth/token] empId="${empId}" role="${user?.role}" db="${databaseId || '(default)'}"`);

    // Write the user profile to the CORRECT named Firestore database.
    if (user) {
      const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
      await db.collection('users').doc(String(empId)).set(
        { ...user, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      console.log(`[auth/token] Profile synced for "${empId}"`);
    }

    // Embed the role as a custom claim so Firestore rules can check
    // request.auth.token.role == 'admin' without doing a document lookup.
    const roleClaim = user?.role ? { role: String(user.role).toLowerCase().trim() } : {};
    const token = await getAuth(app).createCustomToken(String(empId), roleClaim);
    console.log(`[auth/token] Custom token issued for "${empId}" with role="${user?.role}"`);

    return res.status(200).json({ token, databaseId: databaseId || '(default)' });

  } catch (err: any) {
    const message = err?.message || String(err);
    console.error('[auth/token] Error:', message);

    const isConfigError = message.includes('env var') || message.includes('FIREBASE_') || message.includes('malformed');
    return res.status(500).json({
      error: message,
      hint: isConfigError
        ? 'Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (and optionally FIRESTORE_DATABASE_ID) in Vercel Dashboard → Project → Settings → Environment Variables, then redeploy.'
        : 'Check Vercel function logs for the full stack trace.',
    });
  }
}
