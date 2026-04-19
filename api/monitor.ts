import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { runMonitorTick } from '../src/services/monitorService.js';
import { readFileSync } from 'fs';
import path from 'path';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[API Monitor] Request received');

  // 0. Authentication Check
  const monitorKey = req.headers['x-monitor-key'];
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const secretKey = process.env.MONITOR_SECRET_KEY;

  if (secretKey && !isVercelCron && (!monitorKey || monitorKey !== secretKey)) {
    console.warn('[API Monitor] Unauthorized request attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Load Firebase Config
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    console.log('[API Monitor] Loading config from:', configPath);
    
    let firebaseConfig;
    try {
      const configRaw = readFileSync(configPath, 'utf8');
      firebaseConfig = JSON.parse(configRaw);
      console.log('[API Monitor] Config loaded successfully');
    } catch (configErr: any) {
      console.error('[API Monitor] Failed to load firebase-applet-config.json:', configErr);
      throw new Error(`Config Load Failed: ${configErr.message}`);
    }

    // 2. Initialize Firebase Admin (Lazy Init)
    if (!admin.apps.length) {
      console.log('[API Monitor] Initializing Firebase Admin...');
      const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!saEnv) {
        console.error('[API Monitor] FIREBASE_SERVICE_ACCOUNT is missing');
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
        console.log('[API Monitor] Service Account parsed successfully');
      } catch (parseErr: any) {
        console.error('[API Monitor] Failed to parse FIREBASE_SERVICE_ACCOUNT:', parseErr);
        throw new Error(`Service Account Parse Failed: ${parseErr.message}`);
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
    console.log('[API Monitor] GAS_API_URL:', process.env.GAS_API_URL ? 'SET' : 'NOT SET (Using fallback)');
    
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
