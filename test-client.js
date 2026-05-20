import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, initializeFirestore } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    const d = doc(db, 'oos_history', "test");
    const snap = await getDoc(d);
    console.log("Success! exists: ", snap.exists());
  } catch (e) {
    console.error("Error: ", e.code, e.message);
  }
}

test();
