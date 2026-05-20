import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, initializeFirestore, collection, getDocs, limit, query } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {});

async function test() {
  try {
    const q = query(collection(db, 'oos_history'), limit(5));
    const snap = await getDocs(q);
    console.log("Success! size: ", snap.size);
    process.exit(0);
  } catch (e) {
    console.error("Error: ", e.code, e.message);
    process.exit(1);
  }
}

test();
