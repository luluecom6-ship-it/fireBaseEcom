importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
firebase.initializeApp({
  projectId: "project-d87150f3-9d9a-4b8c-9cc",
  appId: "1:387076740220:web:cc27e07403d215983f25f9",
  apiKey: "AIzaSyA1mwAIzM49juSc3iJ2JwPwVWtb8Am5t3E",
  authDomain: "project-d87150f3-9d9a-4b8c-9cc.firebaseapp.com",
  storageBucket: "project-d87150f3-9d9a-4b8c-9cc.firebasestorage.app",
  messagingSenderId: "387076740220"
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
