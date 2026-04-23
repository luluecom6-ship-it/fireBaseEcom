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
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

      // Clean private key
      privateKey = privateKey.trim();
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.substring(1, privateKey.length - 1);
      }
      privateKey = privateKey.replace(/\\n/g, '\n');

      if (!projectId || !clientEmail || !privateKey) {
        throw new Error('No Firebase configuration found (PROJECT_ID, CLIENT_EMAIL, or PRIVATE_KEY missing)');
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        databaseURL: `https://${projectId}.firebaseio.com`
      });
      console.log('[API Monitor] Firebase Admin initialized');
    }

    const FIRESTORE_DB_ID = process.env.FIREBASE_DATABASE_ID || 'ai-studio-589cf723-ab60-4b6f-a2cd-f84f8c8c1b48';
    const db = getFirestore(admin.app(), FIRESTORE_DB_ID);
    const messaging = admin.messaging();

    // 3. Run the Monitor Logic
    console.log('[API Monitor] Running monitor tick on DB:', FIRESTORE_DB_ID);
    console.log('[API Monitor] GAS_API_URL:', process.env.GAS_API_URL ? 'SET' : 'NOT SET (Check Vercel env)');
    
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
