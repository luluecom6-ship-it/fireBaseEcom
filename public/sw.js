importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  "projectId": "myecomlulu",
  "appId": "1:38939626534:web:a404455dd600fab9bfeae7",
  "apiKey": "AIzaSyA7PoNtBzgg1gW0w6giXk-YwOYHf0Ev9pQ",
  "authDomain": "myecomlulu.firebaseapp.com",
  "messagingSenderId": "38939626534"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || 'Matrix Alert';
  const notificationOptions = {
    body: payload.notification?.body || 'New alert triggered',
    icon: payload.data?.image || 'https://placehold.co/192x192.png?text=OOS'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Open the app when notification is clicked
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
