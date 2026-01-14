# Automated Scheduling Setup Guide

## ⚠️ Issue: "No available slots found in the next 30 days"

This message appears when the automated scheduler cannot find any valid appointment times. Here's how to fix it:

## 🔍 Quick Diagnosis

### Step 1: Check Doctor Availability

1. **Open the diagnostic tool**:
   ```
   http://localhost/public/check-doctor-availability.html
   ```

2. **Enter the doctor's ID** (Firestore document ID)

3. **Click "Check Availability"**

This will show you:
- ✅ If doctor exists in database
- ✅ If schedule is configured
- ✅ What format the schedule uses
- ✅ If any slots can be found

### Step 2: Check Browser Console

Open browser console (F12) and look for messages like:
```
⚠️ No schedule found for doctor
⚠️ Schedule array is empty
📅 Found 0 existing appointments
```

## ✅ How Availability is Set

There are **TWO ways** to set doctor availability:

### Method 1: Doctor Sets Their Own (profile.html)
- Doctor logs into their profile page
- Adds available dates and time ranges
- Clicks "Save All Schedules"

### Method 2: Secretary Sets for Doctor (secretary.html)
- Secretary logs into secretary dashboard
- Navigates to "Doctor Availability" section
- Adds available dates/times for their assigned doctor
- Clicks "Save All Schedules"

**Both methods save to the same location in the same format!**

---

## 📝 Schedule Format

The automated scheduler needs availability in **one of two formats**:

### Format 1: Specific Dates (Used by profile.html & secretary.html)

**This is the format used by both doctors and secretaries:**

```javascript
{
  "schedule": [
    {
      "date": "2026-01-15",
      "time": "9:00 AM - 5:00 PM"
    },
    {
      "date": "2026-01-16",
      "time": "10:00 AM - 3:00 PM"
    },
    {
      "date": "2026-01-17",
      "time": "9:00 AM - 4:00 PM"
    }
  ]
}
```

**Saved to Firestore:**
- `users/doctors/doctors/{doctorId}` (main location)
- `public_doctors/{doctorId}` (public listing)

**Requirements**:
- ✅ Dates must be in format: `YYYY-MM-DD`
- ✅ Times must be in format: `HH:MM AM/PM - HH:MM AM/PM`
- ✅ Dates must be in the **future** (not past)
- ✅ Array must not be empty

**Created by:**
- ✅ Doctors using profile.html availability calendar
- ✅ Secretaries using secretary.html availability calendar

### Format 2: Weekly Recurring Schedule

```javascript
{
  "schedule": {
    "workingDays": [1, 2, 3, 4, 5],  // Monday-Friday (0=Sun, 6=Sat)
    "startHour": "09:00",
    "endHour": "17:00",
    "byDay": {
      "1": { "startHour": "09:00", "endHour": "17:00" },  // Monday
      "2": { "startHour": "10:00", "endHour": "18:00" },  // Tuesday
      "3": { "startHour": "09:00", "endHour": "17:00" },  // Wednesday
      "4": { "startHour": "09:00", "endHour": "16:00" },  // Thursday
      "5": { "startHour": "10:00", "endHour": "15:00" }   // Friday
    }
  }
}
```

**Requirements**:
- ✅ `workingDays` array with day indexes (0-6)
- ✅ `startHour` and `endHour` in 24-hour format (HH:MM)
- ✅ Optional `byDay` for day-specific hours

## 🛠️ How to Fix

### Option 1: Doctor Sets Availability

**Steps:**
1. Doctor logs into `profile.html`
2. Scrolls to "Set Your Availability" section
3. Picks dates from calendar
4. Sets start/end times (e.g., 9:00 AM - 5:00 PM)
5. Clicks "Add Slot" for each time range
6. Clicks "Save All Schedules"
7. Automated scheduler now works!

### Option 2: Secretary Sets Availability

**Steps:**
1. Secretary logs into `secretary.html`
2. Navigates to "Doctor Availability" tab
3. Picks dates from calendar
4. Sets start/end times
5. Clicks "Add Slot" for each time range
6. Clicks "Save All Schedules"
7. Automated scheduler now works!

### Option 3: Manual Database Update (Testing Only)

Using Firebase Console:

1. Go to Firestore Database
2. Find the doctor's document in `public_doctors` or `doctors` collection
3. Add/update the `schedule` field with proper format
4. Save

Example update:
```javascript
// In Firestore Console, update doctor document
{
  "schedule": [
    {
      "date": "2026-01-15",
      "time": "9:00 AM - 5:00 PM"
    }
  ]
}
```

### Option 3: Test with Sample Doctor (Development)

Run the test file which has a sample doctor with proper schedule:
```
http://localhost/public/run-tests-now.html
```

## 🎯 Verification Steps

After doctor sets availability:

1. **Refresh doctor.html**
2. **Select the doctor** from directory
3. **Check console** for:
   ```
   🤖 Initializing automated scheduling for doctor...
   👨‍⚕️ Doctor data loaded: {...}
   📅 Found X existing appointments
   ✅ Found Y optimal slots
   ```

4. **Look for** AI-Recommended section with suggestion cards

## 📊 Expected Results

### When Working Correctly:
```
🤖 AI-Recommended Appointment Times
────────────────────────────────────

🥇 #1 Best Match
📅 Monday, January 15, 2026
⏰ 10:00 AM
📊 Tomorrow • Match Score: 87/100
[📅 Book This Time]

🥈 #2 Best Match
📅 Tuesday, January 16, 2026
⏰ 9:00 AM
📊 In 2 days • Match Score: 82/100
[📅 Book This Time]
```

### When Not Working:
```
⚠️ No Available Slots Found

The automated scheduler could not find available 
appointment times in the next 30 days.

Possible reasons:
• Doctor has not set availability schedule yet
• All available dates are fully booked
• Available dates are in the past

What to do: Please try manual booking below or 
contact the doctor's office.
```

## 🔧 Troubleshooting

### Issue: "No schedule found for doctor"
**Cause**: Doctor has no `schedule` field in Firestore  
**Fix**: Doctor needs to set availability in profile

### Issue: "Schedule array is empty"
**Cause**: Schedule exists but has no dates  
**Fix**: Doctor needs to add specific available dates

### Issue: "All available dates are fully booked"
**Cause**: Every time slot has an existing appointment  
**Fix**: Doctor needs to add more availability dates

### Issue: Schedule exists but no slots found
**Cause**: Schedule format doesn't match expected format  
**Fix**: Check format matches one of the two supported formats above

### Issue: Dates in the past
**Cause**: Doctor set dates that already passed  
**Fix**: Doctor needs to update schedule with future dates

## 🚀 Integration Flow

```
Patient selects doctor in doctor.html
          ↓
System fetches doctor data from Firestore
          ↓
Checks if doctor.schedule exists
          ↓
   YES: Runs constraint scheduler    |    NO: Shows "no slots" message
          ↓                                        ↓
   Finds valid future dates                  Manual booking only
          ↓
   Displays AI suggestions
          ↓
   Patient clicks suggestion
          ↓
   Form pre-fills with date/time
          ↓
   Patient completes booking
```

## 📝 Summary

**The automated scheduler WILL work when:**
- ✅ Doctor has set availability in correct format
- ✅ Availability includes future dates
- ✅ Schedule is properly saved to Firestore
- ✅ Schedule field matches one of two supported formats

**Current status:**
The doctor you tested **has not set availability yet** or the schedule format doesn't match. Once the doctor sets their availability properly, the automated scheduling will work automatically.

## 🔗 Quick Links

- **Check Availability**: `http://localhost/public/check-doctor-availability.html`
- **Run Tests**: `http://localhost/public/run-tests-now.html`
- **Doctor Profile** (to set availability): `http://localhost/public/profile.html`

---

**Need Help?**  
Run the diagnostic tool with the doctor's ID to see exactly what's wrong:
```
http://localhost/public/check-doctor-availability.html
```
