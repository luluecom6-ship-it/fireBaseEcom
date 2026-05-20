import fs from 'fs';
import axios from 'axios';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

async function testREST() {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/oos_history`;
    const res = await axios.get(url);
    console.log("Success:", res.data);
  } catch (e) {
    console.log("Error:", e.response?.status, e.response?.data);
  }
}

testREST();
