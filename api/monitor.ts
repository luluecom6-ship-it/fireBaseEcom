import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { runMonitorTick } from '../src/services/monitorService.js';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Security Check (Optional but recommended)
  // You can add a secret key in your GAS script and check it here
  // if (req.headers['x-monitor-key'] !== process.env.MONITOR_SECRET_KEY) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

  try {
    // 2. Initialize Firebase Admin (Lazy Init)
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
      });
    }

    const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
    const messaging = admin.messaging();

    // 3. Run the Monitor Logic
    await runMonitorTick(db, messaging);

    return res.status(200).json({ status: 'success', message: 'Monitor tick completed' });
  } catch (error: any) {
    console.error('API Monitor Error:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
}
