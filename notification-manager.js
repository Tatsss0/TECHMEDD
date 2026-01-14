// notification-manager.js - Push Notification Manager
(function() {
  'use strict';

  // Check if already initialized
  if (window.NotificationManager) return;

  class NotificationManager {
    constructor() {
      this.messaging = null;
      this.currentToken = null;
      this.vapidKey = 'BO4ldE2xSyV919YXVyl2XhOKA4Jxdtu57DTMD4fCImkDXNpPooC9-5AViyb00izdlFdA_7OqQcx7vhCqWWaVujg'; // Replace with your actual VAPID key
    }

    async initialize() {
      try {
        // Check if service worker and notifications are supported
        if (!('serviceWorker' in navigator)) {
          console.warn('Service Worker not supported');
          return false;
        }

        if (!('Notification' in window)) {
          console.warn('Notifications not supported');
          return false;
        }

        // Register unified service worker (handles both PWA and FCM)
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('✅ Unified Service Worker registered:', registration);

        // Wait for firebase to be ready
        await this.waitForFirebase();

        // Initialize Firebase Messaging
        if (firebase.messaging && firebase.messaging.isSupported()) {
          this.messaging = firebase.messaging();
          console.log('✅ Firebase Messaging initialized');
          return true;
        } else {
          console.warn('Firebase Messaging not supported in this browser');
          return false;
        }
      } catch (error) {
        console.error('❌ Notification Manager initialization failed:', error);
        return false;
      }
    }

    async waitForFirebase() {
      return new Promise((resolve) => {
        if (window.firebase && window.firebaseInitialized) {
          resolve();
        } else {
          const checkInterval = setInterval(() => {
            if (window.firebase && window.firebaseInitialized) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
        }
      });
    }

    async requestPermission() {
      try {
        const permission = await Notification.requestPermission();
        console.log('📢 Notification permission:', permission);

        if (permission === 'granted') {
          console.log('✅ Notification permission granted');
          return true;
        } else {
          console.log('❌ Notification permission denied');
          return false;
        }
      } catch (error) {
        console.error('❌ Error requesting notification permission:', error);
        return false;
      }
    }

    async getToken(userId, userType) {
      try {
        if (!this.messaging) {
          console.warn('Messaging not initialized');
          return null;
        }

        // Get FCM token
        const token = await this.messaging.getToken({
          vapidKey: this.vapidKey,
          serviceWorkerRegistration: await navigator.serviceWorker.ready
        });

        if (token) {
          console.log('✅ FCM Token obtained:', token);
          this.currentToken = token;

          // Save token to Firestore
          await this.saveTokenToFirestore(userId, userType, token);
          
          return token;
        } else {
          console.log('⚠️ No registration token available');
          return null;
        }
      } catch (error) {
        console.error('❌ Error getting FCM token:', error);
        return null;
      }
    }

    async saveTokenToFirestore(userId, userType, token) {
      try {
        const db = window.db || firebase.firestore();
        const tokenDoc = {
          token: token,
          userId: userId,
          userType: userType, // 'patient' or 'doctor'
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          platform: this.getPlatform(),
          browser: this.getBrowser()
        };

        await db.collection('fcmTokens').doc(userId).set(tokenDoc, { merge: true });
        console.log('✅ FCM token saved to Firestore');
      } catch (error) {
        console.error('❌ Error saving token to Firestore:', error);
      }
    }

    async setupForegroundListener() {
      if (!this.messaging) return;

      try {
        this.messaging.onMessage((payload) => {
          console.log('📩 Foreground message received:', payload);

          const notificationTitle = payload.notification?.title || 'New Notification';
          const notificationOptions = {
            body: payload.notification?.body || '',
            icon: payload.notification?.icon || '/logo512.png',
            badge: '/logo192.png',
            vibrate: [200, 100, 200],
            data: payload.data || {},
            tag: payload.data?.appointmentId || undefined,
            requireInteraction: true
          };

          // Show notification even when app is open
          if (Notification.permission === 'granted') {
            navigator.serviceWorker.ready.then((registration) => {
              registration.showNotification(notificationTitle, notificationOptions);
            });
          }

          // Also show in-app banner
          if (window.showInAppReminder) {
            window.showInAppReminder(payload.data);
          }
        });

        console.log('✅ Foreground message listener set up');
      } catch (error) {
        console.error('❌ Error setting up foreground listener:', error);
      }
    }

    getPlatform() {
      const ua = navigator.userAgent;
      if (/android/i.test(ua)) return 'android';
      if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
      return 'web';
    }

    getBrowser() {
      const ua = navigator.userAgent;
      if (ua.indexOf('Chrome') > -1) return 'chrome';
      if (ua.indexOf('Safari') > -1) return 'safari';
      if (ua.indexOf('Firefox') > -1) return 'firefox';
      if (ua.indexOf('Edge') > -1) return 'edge';
      return 'unknown';
    }

    async deleteToken(userId) {
      try {
        if (this.messaging && this.currentToken) {
          await this.messaging.deleteToken();
          console.log('✅ FCM token deleted');
        }

        // Remove from Firestore
        const db = window.db || firebase.firestore();
        await db.collection('fcmTokens').doc(userId).delete();
        console.log('✅ Token removed from Firestore');

        this.currentToken = null;
      } catch (error) {
        console.error('❌ Error deleting token:', error);
      }
    }

    // Helper method to easily enable notifications for a user
    async enableNotifications(userId, userType) {
      try {
        console.log('🔔 Enabling notifications for user:', userId);

        // Initialize if not already done
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('Failed to initialize notification system');
        }

        // Request permission
        const hasPermission = await this.requestPermission();
        if (!hasPermission) {
          throw new Error('Notification permission denied');
        }

        // Get and save token
        const token = await this.getToken(userId, userType);
        if (!token) {
          throw new Error('Failed to get FCM token');
        }

        // Set up foreground listener
        await this.setupForegroundListener();

        console.log('✅ Notifications enabled successfully');
        return true;
      } catch (error) {
        console.error('❌ Error enabling notifications:', error);
        return false;
      }
    }

    // Check if notifications are enabled
    isEnabled() {
      return Notification.permission === 'granted' && this.currentToken !== null;
    }
  }

  // Create and expose global instance
  window.NotificationManager = new NotificationManager();

  console.log('📱 Notification Manager loaded');
})();
