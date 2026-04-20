import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
console.log("Initializing Firebase with Project ID:", firebaseConfig.projectId);
const app = initializeApp(firebaseConfig);

// Use initializeFirestore with forceLongPolling to fix "unavailable" errors in sandboxed environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const messaging = getMessaging(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signOut, onAuthStateChanged, signInWithCustomToken };

export const VAPID_KEY = "BIfz7B7xUnczef2e5t97PyyLu9fTxFvRyFd0or6ofND7tsKoSwNMkAW6xY2izQexaZepObIjGU5v5u8yYagMyHs";

export const requestForToken = async () => {
  if (!("Notification" in window)) {
    console.log("This browser does not support notifications.");
    return null;
  }

  // Proactively request permission if it's currently "default"
  if (Notification.permission === "default") {
    console.log("[Firebase] Requesting notification permission...");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
  }

  if (Notification.permission === "denied") {
    console.log("Notification permission denied. Please enable it in browser settings.");
    return null;
  }

  try {
    // Get the consolidated service worker registration
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    
    const currentToken = await getToken(messaging, { 
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration 
    });
    if (currentToken) {
      console.log('FCM Token:', currentToken);
      // In a real app, you would send this token to your backend (Google Apps Script)
      // so you can target this specific device for notifications.
      return currentToken;
    } else {
      console.log('No registration token available. Request permission to generate one.');
      return null;
    }
  } catch (err) {
    console.log('An error occurred while retrieving token. ', err);
    return null;
  }
};

export const onForegroundMessage = (callback: any) => {
  return onMessage(messaging, (payload) => {
    console.log("Foreground message received: ", payload);
    callback(payload);
  });
};
