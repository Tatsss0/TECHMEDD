# 🚀 Quick Test Guide - 10-Minute Appointment Reminders

## Fast Track Testing (5 Minutes)

### 1. Enable Notifications (1 min)
```bash
1. Open: http://localhost/public/techmed.html
2. Login as a patient
3. Click "Allow" when browser asks for notification permission
4. Open Console (F12) - Look for: "✅ FCM Token obtained"
```

### 2. Create Test Appointment (2 mins)
```javascript
// Open Firestore Console → appointments collection
// Add new document with these fields:

{
  "patientId": "[your-patient-uid]",          // Get from Auth or Firestore users
  "doctorId": "[any-doctor-uid]",             // Get from doctors collection
  "patientName": "Test Patient",
  "doctorName": "Dr. Smith",
  "status": "confirmed",
  "startAt": [Timestamp: 12 minutes from now], // Use Firestore Timestamp picker
  "createdAt": [Timestamp: now]
}
```

**Quick way to get current + 12 minutes timestamp:**
```javascript
// Run in browser console:
const future = new Date(Date.now() + 12 * 60 * 1000);
console.log('Paste this into Firestore Timestamp:', future.toISOString());
```

### 3. Deploy Cloud Function (1 min)
```bash
cd c:\xampp\htdocs
firebase deploy --only functions:sendAppointmentReminders
```

### 4. Wait & Verify (2-7 mins)
- Function runs every 5 minutes
- Check Firebase Console → Functions → Logs
- Look for: "Sent X appointment reminders"
- Close your browser completely
- Notification should pop up on your device!

## Quick Verification Checklist

| Check | What to Look For | Where |
|-------|------------------|-------|
| **Permission Granted** | "✅ FCM Token obtained" | Browser Console |
| **Token Saved** | Document exists with your UID | Firestore → `fcmTokens` |
| **Service Worker** | "Unified Service Worker" active | DevTools → Application → Service Workers |
| **Function Deployed** | `sendAppointmentReminders` listed | `firebase functions:list` |
| **Appointment Valid** | `startAt` is Timestamp (not string) | Firestore → `appointments` |
| **Reminder Sent** | "Sent X reminders" in logs | Firebase Console → Functions → Logs |
| **Notification Received** | Push notification appears | Device notification tray |

## One-Command Test

Run this in your Firebase project to test immediately:

```javascript
// Firebase Console → Firestore → appointments → Add document
// Then run this in Firebase Functions Console:

const admin = require('firebase-admin');
const db = admin.firestore();

// Get your appointment ID from Firestore
const appointmentId = 'YOUR_APPOINTMENT_ID';
const patientId = 'YOUR_PATIENT_UID';

// Get patient's FCM token
const tokenDoc = await db.collection('fcmTokens').doc(patientId).get();
const token = tokenDoc.data().token;

// Send test notification
await admin.messaging().send({
  notification: {
    title: '🚨 Appointment Starting Soon!',
    body: 'Your appointment starts in 10 minutes. Please prepare to join.',
  },
  token: token,
  webpush: {
    notification: {
      icon: '/logo512.png',
      badge: '/logo192.png',
      vibrate: [200, 100, 200],
      requireInteraction: true
    }
  }
});

console.log('✅ Test notification sent!');
```

## Troubleshooting (30 seconds each)

### ❌ No notification permission prompt
```javascript
// Run in console:
console.log('Permission:', Notification.permission);
// If 'denied' → Settings → Site Settings → Notifications → Reset
```

### ❌ No FCM token
```javascript
// Check if service worker is active:
navigator.serviceWorker.getRegistration().then(reg => 
  console.log('Service Worker:', reg ? 'Active' : 'Not found')
);
// If not found → Hard refresh (Ctrl+Shift+R) and try again
```

### ❌ Function not triggering
```bash
# Check if function is scheduled:
firebase functions:log --only sendAppointmentReminders --limit 10

# If no logs → Verify function is deployed:
firebase functions:list | grep sendAppointmentReminders
```

### ❌ Notification doesn't appear when app closed
- **iOS**: Add to home screen (required for PWA notifications)
- **Android**: Should work in any browser
- **Desktop**: Works in Chrome, Edge, Firefox

## Manual Testing Without Waiting

Don't want to wait 5-10 minutes? Test the in-app banner instead:

```javascript
// 1. Login as patient
// 2. Open Console (F12)
// 3. Force trigger banner:

if (window.AppointmentReminder) {
  // Create fake appointment
  const fakeAppointment = {
    id: 'test-123',
    doctorName: 'Dr. Smith',
    appointmentTime: new Date(Date.now() + 8 * 60 * 1000), // 8 minutes from now
    timeDiff: 8 * 60 * 1000
  };
  
  // Show urgent reminder
  window.AppointmentReminder.showReminder(fakeAppointment);
}
```

## Expected Timeline

| Time | Event |
|------|-------|
| **T + 0 min** | Deploy function |
| **T + 2-7 min** | Function runs (every 5 mins) |
| **T + 2-7 min** | Checks appointments in database |
| **T + 2-7 min** | Sends notification if appointment in 10-min window |
| **T + 2-7 min** | Notification appears on device |

## Success Indicators

✅ **You'll know it's working when:**

1. Console shows: `✅ FCM Token obtained`
2. Firestore has your token in `fcmTokens` collection
3. Function logs show: `Sent X appointment reminders`
4. Notification pops up on your device
5. Clicking notification opens the app

## Need Help?

1. Check `APPOINTMENT_REMINDER_DEPLOYMENT.md` for full details
2. Review Firebase Functions logs: `firebase functions:log`
3. Verify Firestore data structure matches expected format
4. Test with a different browser/device
5. Check service worker is active in DevTools

---

**Pro Tip**: Test at different times to verify all scenarios:
- 25 minutes before → In-app banner appears
- 10 minutes before → Banner becomes urgent + push notification
- 3 days before → 3-day reminder notification

Happy testing! 🎉
