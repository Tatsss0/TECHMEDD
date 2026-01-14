// firebase-init.js
(function () {
  if (window.firebaseInitialized) return; // Prevent double init

  // ✅ Your Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyCwCjmcUTTz8S34svqAxmhHmhO8QNnz5t8",
    authDomain: "t-echmed.firebaseapp.com",
    databaseURL: "https://t-echmed-default-rtdb.firebaseio.com",
    projectId: "t-echmed",
    storageBucket: "t-echmed.appspot.com",
    messagingSenderId: "290352510024",
    appId: "1:290352510024:web:c9e2fbdec8d36f35ca547d"
  };

  // Initialize Firebase app (avoid duplicates)
  const app = (firebase.apps && firebase.apps.length)
    ? firebase.app()
    : firebase.initializeApp(firebaseConfig);

  // Expose compat SDK instances globally
  window.auth = app.auth();
  window.db = app.firestore();
  // Optional, for Realtime Database if needed (only if database compat is loaded)
  try {
    if (typeof firebase !== 'undefined' && firebase.database && typeof app.database === 'function') {
      window.rtdb = app.database();
    } else {
      window.rtdb = null;
    }
  } catch (e) {
    window.rtdb = null;
  }

  try {
    window.storage = app.storage();
  } catch (e) {
    console.warn("⚠️ Firebase Storage not available:", e);
    window.storage = null;
  }

  // ✅ Apply Firestore settings (avoid overwriting emulator host)
  try {
    if (!window.__dbSettingsApplied && window.db?.settings) {
      window.db.settings({ ignoreUndefinedProperties: true });
      window.__dbSettingsApplied = true;
    }
  } catch (e) {
    console.warn("⚠️ Firestore settings skipped:", e);
  }

  window.firebaseInitialized = true;

  // ✅ Log success
  console.log("🔥 Firebase initialized successfully");
  console.log("📘 Firestore:", !!window.db);
  console.log("💬 Realtime DB:", !!window.rtdb);
  console.log("🔐 Auth:", !!window.auth);
})();
