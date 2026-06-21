import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
dotenv.config();

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  })
});

const db = getFirestore(app);

async function check() {
  const adminSnap = await db.collection('app_config').doc('admin_control').get();
  console.log('admin_control regions:', JSON.stringify(adminSnap.data()?.regions, null, 2));

  const sysSnap = await db.collection('system').doc('config').get();
  console.log('system config whatsapp mappings:', JSON.stringify(sysSnap.data()?.whatsappRegionMappings, null, 2));
}

check().catch(console.error);
