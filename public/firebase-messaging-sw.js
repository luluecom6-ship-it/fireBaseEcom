importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
firebase.initializeApp({
  apiKey: "AIzaSyA7PoNtBzgg1gW0w6giXk-YwOYHf0Ev9pQ",
  authDomain: "myecomlulu.firebaseapp.com",
  projectId: "myecomlulu",
  storageBucket: "myecomlulu.firebasestorage.app",
  messagingSenderId: "38939626534",
  appId: "1:38939626534:web:fcab3b22d010d58dbfeae7"
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
