import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { runMonitorTick } from '../src/services/monitorService';
import { readFileSync } from 'fs';
import path from 'path';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[API Monitor] Request received');

  try {
    // 1. Load Firebase Config
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    const firebaseConfig = JSON.parse(readFileSync(configPath, 'utf8'));

    // 2. Initialize Firebase Admin (Lazy Init)
    if (!admin.apps.length) {
      console.log('[API Monitor] Initializing Firebase Admin...');
      const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!saEnv) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is missing');
      }

      let serviceAccount;
      try {
        // Handle potential double-quoting or escaped characters
        let raw = saEnv.trim();
        if (raw.startsWith('"') && raw.endsWith('"')) {
          raw = JSON.parse(raw);
        }
        serviceAccount = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (parseErr) {
        console.error('[API Monitor] Failed to parse FIREBASE_SERVICE_ACCOUNT:', parseErr);
        throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT format. Ensure it is a valid JSON string.');
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
      });
      console.log('[API Monitor] Firebase Admin initialized');
    }

    const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
    const messaging = admin.messaging();

    // 3. Run the Monitor Logic
    console.log('[API Monitor] Running monitor tick...');
    await runMonitorTick(db, messaging);
    console.log('[API Monitor] Monitor tick completed successfully');

    return res.status(200).json({ status: 'success', message: 'Monitor tick completed' });
  } catch (error: any) {
    console.error('[API Monitor] Fatal Error:', error);
    return res.status(500).json({ 
      status: 'error', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
}
