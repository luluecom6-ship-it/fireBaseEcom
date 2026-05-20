import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

const config = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
};

admin.initializeApp({
  credential: admin.credential.cert(config)
});

const FIRESTORE_DB_ID = process.env.FIREBASE_DATABASE_ID || 'ai-studio-589cf723-ab60-4b6f-a2cd-f84f8c8c1b48';
const db = getFirestore(admin.app(), FIRESTORE_DB_ID);

async function check() {
  const snap = await db.collection("oos_history").limit(5).get();
  console.log(`Found ${snap.size} records in ${FIRESTORE_DB_ID}`);
  snap.forEach(d => console.log(d.id, d.data().timestamp));
}
check().catch(console.error);
