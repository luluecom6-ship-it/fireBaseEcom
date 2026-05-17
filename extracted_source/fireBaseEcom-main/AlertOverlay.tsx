const CACHE_NAME = 'jee-ecom-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn-icons-png.flaticon.com/512/3081/3081559.png'
];

// Firebase Scripts for Service Worker
importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-messaging-compat.js');

// Initialize Firebase in Service Worker
firebase.initializeApp({
  projectId: "myecomlulu",
  appId: "1:38939626534:web:a404455dd600fab9bfeae7",
  apiKey: "AIzaSyA7PoNtBzgg1gW0w6giXk-YwOYHf0Ev9pQ",
  authDomain: "myecomlulu.firebaseapp.com",
  storageBucket: "myecomlulu.firebasestorage.app",
  messagingSenderId: "38939626534"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'Alert';
  const notificationOptions = {
    body: payload.notification?.body || 'New alert received',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.data?.alertId || 'alert',
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache assets individually so one failure doesn't block the whole SW
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(asset => cache.add(asset))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Network-first strategy for the root and index.html to ensure latest version
  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clonedResponse);
          });
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for other static assets
  if (ASSETS_TO_CACHE.some(asset => event.request.url.includes(asset))) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const data = event.notification.data || {};
      const targetUrl = typeof data === 'string' ? data : (data.click_action || data.url || '/');

      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { 
      title: 'Matrix Alert', 
      body: event.data ? event.data.text() : 'New notification' 
    };
  }
  
  const title = data.title || 'Matrix Alert';
  const options = {
    body: data.body || 'New alert triggered',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'alert',
    requireInteraction: true,
    data: data.url || '/'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
