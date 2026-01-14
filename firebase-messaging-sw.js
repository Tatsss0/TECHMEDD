/* Firebase Cloud Messaging service worker */

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// IMPORTANT: Keep in sync with your firebase-init.js config
firebase.initializeApp({
  apiKey: "AIzaSyCwCjmcUTTz8S34svqAxmhHmhO8QNnz5t8",
  authDomain: "t-echmed.firebaseapp.com",
  databaseURL: "https://t-echmed-default-rtdb.firebaseio.com",
  projectId: "t-echmed",
  storageBucket: "t-echmed.appspot.com",
  messagingSenderId: "290352510024",
  appId: "1:290352510024:web:c9e2fbdec8d36f35ca547d"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const title = notification.title || 'Notification';
  const options = {
    body: notification.body || '',
    icon: notification.icon || '/logo512.png',
    data: payload.data || {},
    tag: (payload.data && payload.data.appointmentId) || undefined,
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = '/' ;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    })
  );
});


