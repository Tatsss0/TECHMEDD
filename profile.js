// profile.js
(function(){
  const $ = (s) => document.querySelector(s);

  // Safe Firebase handles (requires firebase-init.js to run first)
  const db = window.db || (firebase.firestore && firebase.firestore());
  const auth = window.auth || (firebase.auth && firebase.auth());
  const storage = window.storage || (firebase.storage && firebase.storage());
  if (!db || !auth) {
    console.error('Firebase not initialized. Load firebase-init.js before profile.js');
    return;
  }

  function dayAbbrev(d) {
    if (!d) return '';
    const s = String(d).toLowerCase();
    const map = { monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri', saturday:'Sat', sunday:'Sun', mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };
    return map[s] || (s.slice(0,3).charAt(0).toUpperCase() + s.slice(1,3).toLowerCase());
  }

  function mergeSecretarySchedule(docData) {
    if (!docData) return;
    const days = Array.isArray(docData.availableDays) ? docData.availableDays : [];
    const times = Array.isArray(docData.availableTimes) ? docData.availableTimes : (typeof docData.availableTimes === 'string' ? docData.availableTimes.split(',').map(x=>x.trim()).filter(Boolean) : []);
    const slots = [];
    days.forEach(d => {
      const dd = dayAbbrev(d);
      times.forEach(t => { slots.push({ day: dd, time: t }); });
    });
    const a = JSON.stringify(scheduleSlots);
    const b = JSON.stringify(slots);
    if (a !== b) {
      scheduleSlots = slots;
      renderScheduleList();
    }
  }

  async function listenSecretarySchedules() {
    if (!currentUser) return;
    const uid = currentUser.uid;
    try {
      const byId = await db.collection('schedules').where('doctorId','==', uid).limit(1).get();
      let ref = null;
      if (!byId.empty) {
        ref = db.collection('schedules').doc(byId.docs[0].id);
      } else {
        const name = (currentUser.displayName || '').replace(/^Dr\.?\s*/i,'').trim();
        if (name) {
          const byName = await db.collection('schedules').where('doctorName','==', name).limit(1).get();
          if (!byName.empty) ref = db.collection('schedules').doc(byName.docs[0].id);
        }
      }
      if (ref) {
        ref.onSnapshot(s => { if (s.exists) mergeSecretarySchedule(s.data()); });
      }
    } catch (_) {}
  }

  const FieldValue = firebase.firestore.FieldValue;
  // Local placeholders to avoid external DNS/network failures
  const PLACEHOLDER = 'logo.png';
  const FALLBACK_AVATAR = 'logo.png';

  let currentUser;
  let scheduleSlots = []; // [{ day:'Mon', time:'9:00 AM - 1:00 PM' }, { date:'2025-11-12', time:'...' }]
  let calendar = null;

  function withDrPrefix(name){
    if (!name) return '';
    const n = name.trim();
    return /^dr\./i.test(n) ? n : `Dr. ${n}`;
  }

  function toast(message, type = 'dark') {
    const host = document.querySelector('.toast-container') || document.body;
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0`;
    el.setAttribute('role','alert');
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
    host.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 2000 });
    t.show();
    el.addEventListener('hidden.bs.toast', ()=> el.remove());
  }

  function to12h(hhmm) {
    if (!hhmm) return '';
    const [hStr, mStr] = hhmm.split(':');
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const am = h < 12;
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2,'0')} ${am ? 'AM':'PM'}`;
  }

  function toPrettyDate(yyyyMmDd){
    if (!yyyyMmDd) return '';
    const [y,m,d] = yyyyMmDd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m-1), d));
    return dt.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric', weekday:'short' });
  }

  function renderScheduleList() {
    // Day names mapping (0=Sunday, 6=Saturday)
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Group slots by day of week
    const slotsByDay = {
      sunday: [],
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: []
    };
    
    // Organize slots by day
    scheduleSlots.forEach((slot, idx) => {
      let dayIndex = -1;
      
      if (slot.date) {
        // If it's a specific date, get the day of week
        const [y, m, d] = slot.date.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        dayIndex = dateObj.getDay(); // 0=Sunday, 6=Saturday
      } else if (slot.day) {
        // If it's a recurring day (e.g., "Monday")
        dayIndex = dayLabels.findIndex(label => label.toLowerCase() === slot.day.toLowerCase());
      }
      
      if (dayIndex >= 0 && dayIndex <= 6) {
        slotsByDay[dayNames[dayIndex]].push({ ...slot, originalIndex: idx });
      }
    });
    
    // Render each day's slots into its tab
    dayNames.forEach((dayName, dayIndex) => {
      const list = $(`#schedule-list-${dayName}`);
      if (!list) return;
      
      const daySlots = slotsByDay[dayName];
      
      // Update tab badge with slot count
      const tabButton = $(`#tab-${dayName}`);
      if (tabButton) {
        // Remove existing badge
        const existingBadge = tabButton.querySelector('.badge');
        if (existingBadge) existingBadge.remove();
        
        // Add new badge if there are slots
        if (daySlots.length > 0) {
          const badge = document.createElement('span');
          badge.className = 'badge ms-1';
          badge.textContent = daySlots.length;
          tabButton.appendChild(badge);
        }
      }
      
      if (!daySlots.length) {
        list.innerHTML = '<li class="list-group-item text-muted">No slots for this day</li>';
        return;
      }
      
      list.innerHTML = '';
      daySlots.forEach(slot => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        const labelLeft = slot.date ? toPrettyDate(slot.date) : (slot.day || '');
        li.innerHTML = `
          <div><strong>${labelLeft}</strong> — ${slot.time}</div>
          <button class="btn btn-sm btn-outline-danger" data-remove="${slot.originalIndex}"><i class="bi bi-trash"></i></button>
        `;
        li.querySelector('[data-remove]')?.addEventListener('click', async () => {
          scheduleSlots.splice(slot.originalIndex, 1);
          renderScheduleList();
          await persistSchedule();
        });
        list.appendChild(li);
      });
    });
  }

  async function persistSchedule(){
    if (!currentUser) {
      console.error('persistSchedule: No current user');
      toast('Authentication required','danger');
      return;
    }
    
    const uid = currentUser.uid;
    const ts = FieldValue.serverTimestamp();
    
    try {
      console.log('persistSchedule -> scheduleSlots:', scheduleSlots);
      console.log('persistSchedule -> uid:', uid);
      console.log('persistSchedule -> currentUser:', currentUser);
      console.log('persistSchedule -> currentUser.uid:', currentUser.uid);
      console.log('persistSchedule -> auth.currentUser:', auth.currentUser);
      console.log('persistSchedule -> Firebase auth state:', auth.currentUser ? 'authenticated' : 'not authenticated');
      
      // Check user role in main users collection
      try {
        const userDoc = await db.collection('users').doc(uid).get();
        console.log('persistSchedule -> user role check:', {
          exists: userDoc.exists,
          data: userDoc.exists ? userDoc.data() : null,
          role: userDoc.exists ? userDoc.data().role : 'no role found'
        });
      } catch (roleError) {
        console.error('persistSchedule -> role check failed:', roleError);
      }
      
      // Try new subcollection structure first, then fall back to old structure
      let doctorRef = db.collection('users').doc('doctors').collection('doctors').doc(uid);
      console.log('Trying new structure path:', doctorRef.path);
      let doctorSnap = await doctorRef.get();
      
      if (!doctorSnap.exists) {
        console.log('Doctor not found in new structure, trying old structure');
        doctorRef = db.collection('doctors').doc(uid);
        console.log('Trying old structure path:', doctorRef.path);
        doctorSnap = await doctorRef.get();
      }
      
      if (!doctorSnap.exists) {
        console.error('Doctor document not found in either structure');
        toast('Doctor profile not found. Please refresh and try again.','danger');
        return;
      }
      
      console.log('Updating doctor schedule at:', doctorRef.path);
      console.log('🔍 [PROFILE] Saving schedule to Firestore:', scheduleSlots);
      console.log('🔍 [PROFILE] Schedule summary:');
      scheduleSlots.forEach((slot, index) => {
        if (slot.date) {
          const dateObj = new Date(slot.date + 'T00:00:00');
          const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateObj.getDay()];
          console.log(`  ${index + 1}. ${slot.date} (${dayName}) - ${slot.time}`);
        } else if (slot.day) {
          console.log(`  ${index + 1}. ${slot.day} - ${slot.time}`);
        }
      });
      
      // Update doctor's schedule
      await doctorRef.set({
        schedule: scheduleSlots,
        updatedAt: ts
      }, { merge: true });
      
      console.log('Doctor schedule updated successfully');
      
      // Verify the save by reading it back
      const verifyDoc = await doctorRef.get();
      const verifiedSchedule = verifyDoc.data().schedule;
      console.log('🔍 [PROFILE] VERIFICATION - Schedule read back from Firestore:', verifiedSchedule);
      if (verifiedSchedule && Array.isArray(verifiedSchedule)) {
        console.log('✅ [PROFILE] VERIFICATION - Total slots saved:', verifiedSchedule.length);
        verifiedSchedule.forEach((slot, index) => {
          if (slot.date) {
            const dateObj = new Date(slot.date + 'T00:00:00');
            const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateObj.getDay()];
            console.log(`   ✅ Slot ${index + 1}: ${slot.date} (${dayName}) - ${slot.time}`);
          }
        });
      }

      toast('Availability saved','success');
    } catch (e) {
      console.error('persistSchedule error:', e);
      console.error('Error code:', e.code);
      console.error('Error message:', e.message);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to save availability';
      if (e.code === 'permission-denied') {
        errorMessage = 'Permission denied. Please check your authentication.';
      } else if (e.code === 'not-found') {
        errorMessage = 'Doctor profile not found. Please refresh and try again.';
      } else if (e.code === 'unavailable') {
        errorMessage = 'Service temporarily unavailable. Please try again.';
      } else if (e.message) {
        errorMessage = `Failed to save: ${e.message}`;
      }
      
      toast(errorMessage,'danger');
    }
  }

  async function getUserRole(uid){
    try {
      const snap = await db.collection('users').doc(uid).get();
      return snap.exists ? (snap.data().role || null) : null;
    } catch { return null; }
  }

  async function ensureDoctorDoc(uid){
    try {
      // Try new subcollection structure first
      let ref = db.collection('users').doc('doctors').collection('doctors').doc(uid);
      let snap = await ref.get();
      
      if (!snap.exists) {
        console.log('Doctor not found in new structure, trying old structure');
        // Fall back to old structure
        ref = db.collection('doctors').doc(uid);
        snap = await ref.get();
      }
      
      if (!snap.exists) {
        console.log('Creating new doctor document at:', ref.path);
        const baseName = (currentUser.displayName || '').replace(/^Dr\.\s*/, '');
        await ref.set({
          uid,
          email: currentUser.email || '',
          fullName: baseName || '',
          role: 'doctor',
          specialty: '',
          phone: '',
          about: '',
          schedule: [],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        console.log('Doctor document created successfully');
      } else {
        console.log('Doctor document found at:', ref.path);
      }
    } catch (error) {
      console.error('ensureDoctorDoc error:', error);
      throw error;
    }
  }

  function guardAuth(){
    console.log('PROFILE.JS: Starting guardAuth with debug logs');
    auth.onAuthStateChanged(async (user)=>{
      console.log('PROFILE.JS: Auth state changed, user:', user ? user.uid : 'null');
      if (!user) { 
        console.log('PROFILE.JS: No user, redirecting to login');
        window.location.href = './login.html'; 
        return; 
      }
      
      // Doctor-only guard - check multiple locations (SAME AS PATIENT.JS)
      try {
        console.log('PROFILE.JS: Checking doctor auth for UID:', user.uid);
        
        const [userDoc, doctorDoc, newDoctorDoc] = await Promise.all([
          db.collection('users').doc(user.uid).get(),
          db.collection('doctors').doc(user.uid).get(),
          db.collection('users').doc('doctors').collection('doctors').doc(user.uid).get()
        ]);
        
        console.log('PROFILE.JS: Auth check results:', {
          userExists: userDoc.exists,
          userRole: userDoc.exists ? userDoc.data().role : null,
          doctorExists: doctorDoc.exists,
          newDoctorExists: newDoctorDoc.exists
        });
        
        const role = userDoc.exists ? userDoc.data().role : null;
        const isDoctor = role === 'doctor' || doctorDoc.exists || newDoctorDoc.exists;
        
        console.log('PROFILE.JS: Is doctor?', isDoctor);
        
        if (!isDoctor) {
          console.log('PROFILE.JS: User is not a doctor, signing out');
          await auth.signOut().catch(()=>{});
          window.location.href = './login.html';
          return;
        }
        
        console.log('PROFILE.JS: Doctor authentication successful');
        
        currentUser = user;
        
        // Load profile functionality
        await ensureDoctorDoc(user.uid);
        await loadProfile();
        bindEvents();
        await loadLicenses();
        await listenSecretarySchedules();
        
        $('#logoutBtn')?.addEventListener('click', async ()=>{ 
          await auth.signOut(); 
          window.location.href='./login.html'; 
        });
        
      } catch (error) {
        console.error('PROFILE.JS: Auth check failed:', error);
        await auth.signOut().catch(()=>{});
        window.location.href = './login.html';
        return;
      }
    });
  }

  async function loadProfile(){
    const uid = currentUser.uid;
    try {
      // Try new subcollection structure first, then fall back to old structure
      let snap = await db.collection('users').doc('doctors').collection('doctors').doc(uid).get();
      if (!snap.exists) {
        console.log('Profile not found in new structure, trying old structure');
        snap = await db.collection('doctors').doc(uid).get();
      }
      const p = snap.exists ? snap.data() : {};
      console.log('Profile loaded from:', snap.exists ? snap.ref.path : 'default values');
      
      // Update header dropdown with doctor's name
      const displayName = p.fullName ? (p.fullName.toLowerCase().startsWith('dr.') ? p.fullName : `Dr. ${p.fullName}`) : (currentUser?.displayName || 'Doctor');
      const headerUserNameEl = $('#headerUserName');
      if (headerUserNameEl) {
        headerUserNameEl.textContent = displayName;
      }
      console.log('✅ Profile loaded for header:', displayName);
      
      // Safely set form values only if elements exist
      const nameEl = $('#profile-name');
      if (nameEl) nameEl.value = p.fullName || (currentUser.displayName || '').replace(/^Dr\.\s*/,'');
      
      const specialtyEl = $('#profile-specialty');
      if (specialtyEl) specialtyEl.value = p.specialty || '';
      
      const contactEl = $('#profile-contact');
      if (contactEl) contactEl.value = p.phone || '';
      
      const emailEl = $('#profile-email');
      if (emailEl) emailEl.value = currentUser.email || '';
      
      const aboutEl = $('#profile-about');
      if (aboutEl) aboutEl.value = p.about || '';
      
      const experienceEl = $('#profile-experience');
      if (experienceEl) experienceEl.value = p.yearsExperience || '';
      
      const licenseNumberEl = $('#profile-license-number');
      if (licenseNumberEl) licenseNumberEl.value = p.licenseNumber || '';
      
      const licenseExpiryEl = $('#profile-license-expiry');
      if (licenseExpiryEl) licenseExpiryEl.value = p.licenseExpiry || '';
      
      const clinicNameEl = $('#profile-clinic-name');
      if (clinicNameEl) clinicNameEl.value = p.clinicName || '';
      
      const clinicAddressEl = $('#profile-clinic-address');
      if (clinicAddressEl) clinicAddressEl.value = p.clinicAddress || '';
      
      const countryEl = $('#profile-country');
      if (countryEl) countryEl.value = p.country || '';

      const avatar = $('#avatar-preview');
      if (avatar) {
        if (p.avatarUrl && p.avatarUrl.trim()) {
          // Try to load the avatar, fallback to placeholder on error
          avatar.src = p.avatarUrl;
          avatar.onerror = () => { 
            console.log('Avatar load failed, using placeholder');
            avatar.src = PLACEHOLDER; 
            avatar.onerror = () => { avatar.src = FALLBACK_AVATAR; };
          };
        } else {
          // No avatar URL, use placeholder
          avatar.src = PLACEHOLDER;
          avatar.onerror = () => { avatar.src = FALLBACK_AVATAR; };
        }
      }

      scheduleSlots = Array.isArray(p.schedule) ? p.schedule.slice() : [];
      renderScheduleList();

      // ensurePublicProfile not needed - using users/doctors/doctors/{uid} only
    } catch (error) {
      console.error('loadProfile error:', error);
      toast('Failed to load profile data', 'danger');
    }
  }

  function bindEvents(){
    $('#btn-avatar-change')?.addEventListener('click', ()=> $('#profile-avatar').click());
    $('#profile-avatar')?.addEventListener('change', uploadAvatar);
    $('#btn-avatar-remove')?.addEventListener('click', removeAvatar);
    $('#license-upload')?.addEventListener('click', uploadLicenses);
    $('#profile-form')?.addEventListener('submit', saveProfile);
    $('#profile-reset')?.addEventListener('click', (e)=>{ e.preventDefault(); loadProfile(); });

    calendar = window.flatpickr && flatpickr('#schedule-dates', {
      mode: 'multiple',
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'M j, Y',
      inline: true
    });

    // Apply small size and width to the alt input rendered by Flatpickr
    try {
      const fp = document.querySelector('#schedule-dates')?._flatpickr;
      const alt = fp && fp.altInput ? fp.altInput : null;
      if (alt) {
        alt.classList.add('form-control-sm');
        alt.style.maxWidth = '220px';
      }
    } catch(_) {}

    // Weekday column selection (e.g., all Tuesdays in the visible month)
    const weekGroup = document.getElementById('schedule-weekday-group');
    if (weekGroup && calendar) {
      weekGroup.querySelectorAll('button[data-weekday]')?.forEach(btn => {
        btn.addEventListener('click', () => {
          const wd = parseInt(btn.getAttribute('data-weekday'), 10);
          if (isNaN(wd)) return;
          const year = calendar.currentYear;
          const month = calendar.currentMonth; // 0-based
          // Compute all dates in month matching weekday
          const lastOfMonth = new Date(year, month + 1, 0).getDate();
          const targets = [];
          for (let day = 1; day <= lastOfMonth; day++) {
            const d = new Date(year, month, day);
            if (d.getDay() === wd) targets.push(d);
          }
          // Toggle logic by YYYY-MM-DD
          const fmt = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const da = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${da}`;
          };
          const selected = calendar.selectedDates || [];
          const selectedSet = new Set(selected.map(fmt));
          const targetsSet = new Set(targets.map(fmt));
          const allTargetsSelected = [...targetsSet].every(k => selectedSet.has(k));
          let result;
          if (allTargetsSelected) {
            // Unselect all target weekday dates
            result = selected.filter(d => !targetsSet.has(fmt(d)));
          } else {
            // Add missing targets
            const merged = [...selected];
            targets.forEach(d => { const k = fmt(d); if (!selectedSet.has(k)) merged.push(d); });
            result = merged;
          }
          calendar.setDate(result, true);
        });
      });
    }

    // Availability: add selected dates + persist
    $('#schedule-add')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const start = $('#schedule-start')?.value || '';
      const end   = $('#schedule-end')?.value   || '';

      console.log('🔍 [PROFILE] Raw input values - Start:', start, 'End:', end);

      if (!calendar) { toast('Calendar not ready','danger'); return; }
      const dates = Array.from(calendar.selectedDates || []);
      const dateStrs = dates.map(d => calendar.formatDate(d, 'Y-m-d'));
      if (!dateStrs.length) { toast('Select at least one date','danger'); return; }
      if (!start || !end) { toast('Select both start and end times','danger'); return; }
      if (start >= end) { toast('End time must be after start time','danger'); return; }

      const label = `${to12h(start)} - ${to12h(end)}`;
      let added = 0;
      console.log('🔍 [PROFILE] Adding schedule slots for dates:', dateStrs);
      console.log('🔍 [PROFILE] Time range:', label);
      console.log('🔍 [PROFILE] Time conversion - Start:', start, '=>', to12h(start), 'End:', end, '=>', to12h(end));
      dateStrs.forEach(date => {
        const dateObj = new Date(date + 'T00:00:00');
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateObj.getDay()];
        console.log(`🔍 [PROFILE] Date ${date} is a ${dayName}`);
        const exists = scheduleSlots.some(s => (s.date === date) && s.time === label);
        if (!exists) { 
          scheduleSlots.push({ date, time: label }); 
          added++;
          console.log(`✅ [PROFILE] Added slot: ${date} (${dayName}) ${label}`);
        }
      });

      if (!added) { toast('These slots already exist','info'); return; }
      renderScheduleList();
      await persistSchedule();
      try { calendar.clear(); } catch(_) {}
    });
  }

  async function ensurePublicProfile(uid, p){
    try {
      console.log('ensurePublicProfile -> uid:', uid);
      console.log('ensurePublicProfile -> auth state:', auth.currentUser ? 'authenticated' : 'not authenticated');
      
      const publicRef = db.collection('public_doctors').doc(uid);
      const pubSnap = await publicRef.get();
      console.log('ensurePublicProfile -> public profile exists:', pubSnap.exists);
      
      if (!pubSnap.exists) {
        console.log('Creating public profile...');
        await publicRef.set({
          name: withDrPrefix(p.fullName) || withDrPrefix(currentUser.displayName) || 'Doctor',
          specialty: p.specialty || '',
          image: p.avatarUrl || PLACEHOLDER,
          bio: p.about || '',
          schedule: Array.isArray(p.schedule) ? p.schedule : [],
          reviewsCount: 0,
          isListed: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        console.log('Public profile created successfully');
      }
    } catch (err) {
      console.error('ensurePublicProfile failed:', err);
      console.error('ensurePublicProfile error code:', err.code);
      console.error('ensurePublicProfile error message:', err.message);
      // Don't throw the error - this is not critical for profile loading
    }
  }

  async function syncPublicProfile(uid, updates){
    try {
      const publicRef = db.collection('public_doctors').doc(uid);
      const prevSnap = await publicRef.get();
      const prev = prevSnap.exists ? prevSnap.data() : {};
      const displayName =
        withDrPrefix(updates.fullName) ||
        withDrPrefix(prev.name) ||
        withDrPrefix(currentUser.displayName) ||
        'Doctor';

      await publicRef.set({
        name: displayName,
        specialty: updates.specialty ?? prev.specialty ?? '',
        image: prev.image || PLACEHOLDER,
        bio: updates.about ?? prev.bio ?? '',
        schedule: Array.isArray(updates.schedule)
          ? updates.schedule
          : (Array.isArray(prev.schedule) ? prev.schedule : []),
        reviewsCount: typeof prev.reviewsCount === 'number' ? prev.reviewsCount : 0,
        isListed: typeof prev.isListed === 'boolean' ? prev.isListed : true,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error('syncPublicProfile failed', err);
    }
  }

  async function saveProfile(e){
    e.preventDefault();
    const uid = currentUser.uid;
    const fullName = $('#profile-name').value.trim();
    const specialty = $('#profile-specialty').value.trim();
    const phone = $('#profile-contact').value.trim();
    const about = $('#profile-about').value.trim();
    const yearsExperience = parseInt($('#profile-experience').value) || 0;
    const licenseNumber = $('#profile-license-number').value.trim();
    const licenseExpiry = $('#profile-license-expiry').value.trim();
    const clinicName = $('#profile-clinic-name').value.trim();
    const clinicAddress = $('#profile-clinic-address').value.trim();
    const country = $('#profile-country').value.trim();

    try {
      const displayName = fullName
        ? (/^dr\./i.test(fullName) ? fullName : `Dr. ${fullName}`)
        : currentUser.displayName;
      if (displayName && displayName !== currentUser.displayName) {
        await currentUser.updateProfile({ displayName });
      }

      // Use same structure detection as persistSchedule
      let doctorRef = db.collection('users').doc('doctors').collection('doctors').doc(uid);
      let doctorSnap = await doctorRef.get();
      
      if (!doctorSnap.exists) {
        console.log('Doctor not found in new structure, using old structure for save');
        doctorRef = db.collection('doctors').doc(uid);
      }

      await doctorRef.set({
        uid,
        email: currentUser.email,
        fullName,
        role: 'doctor',
        specialty,
        phone,
        about,
        yearsExperience,
        licenseNumber,
        licenseExpiry,
        clinicName,
        clinicAddress,
        country,
        schedule: scheduleSlots,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      toast('Profile saved');
      await loadProfile();
    } catch (err) {
      console.error('saveProfile error:', err);
      const msg = (err && err.code === 'auth/requires-recent-login')
        ? 'Please log out and log in again to change email'
        : (err.message || 'Failed to save');
      toast(msg, 'danger');
    }
  }

  async function uploadAvatar(){
    const fileEl = $('#profile-avatar');
    const file = fileEl.files && fileEl.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast('Please select an image file', 'danger');
      return;
    }
    
    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      toast('Image must be less than 5MB', 'danger');
      return;
    }
    
    const uid = currentUser.uid;
    const path = `doctors/${uid}/avatar.jpg`;
    
    try {
      // Show uploading feedback
      toast('Uploading image...', 'info');
      
      // Upload to Firebase Storage
      const ref = (storage || firebase.storage()).ref().child(path);
      await ref.put(file, { contentType: file.type });
      const url = await ref.getDownloadURL();
      
      console.log('Avatar uploaded to storage:', url);

      // Update doctor profile - try new structure first, then fall back to old
      let doctorRef = db.collection('users').doc('doctors').collection('doctors').doc(uid);
      let doctorSnap = await doctorRef.get();
      
      if (!doctorSnap.exists) {
        console.log('Doctor not found in new structure, using old structure');
        doctorRef = db.collection('doctors').doc(uid);
      }
      
      await doctorRef.set({ 
        avatarUrl: url, 
        updatedAt: FieldValue.serverTimestamp() 
      }, { merge: true });
      
      console.log('Doctor profile updated with avatar URL');

      // Update avatar preview with cache-bust
      const avatar = $('#avatar-preview');
      if (avatar) {
        const bust = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
        avatar.src = bust;
      }
      
      fileEl.value = '';
      toast('Profile picture updated successfully', 'success');
    } catch (err) {
      console.error('Upload avatar error:', err);
      toast(err.message || 'Failed to upload profile picture', 'danger');
    }
  }

  async function removeAvatar(){
    const uid = currentUser.uid;
    const path = `doctors/${uid}/avatar.jpg`;
    try {
      // Disable buttons to prevent double actions
      const btnChange = document.querySelector('#btn-avatar-change');
      const btnRemove = document.querySelector('#btn-avatar-remove');
      btnChange && (btnChange.disabled = true);
      btnRemove && (btnRemove.disabled = true);

      // Delete from Firebase Storage
      await (storage || firebase.storage()).ref().child(path).delete().catch(()=>{});
      console.log('Avatar deleted from storage');
      
      // Update doctor profile - try new structure first, then fall back to old
      let doctorRef = db.collection('users').doc('doctors').collection('doctors').doc(uid);
      let doctorSnap = await doctorRef.get();
      
      if (!doctorSnap.exists) {
        console.log('Doctor not found in new structure, using old structure');
        doctorRef = db.collection('doctors').doc(uid);
      }
      
      await doctorRef.set({ 
        avatarUrl: '', 
        updatedAt: FieldValue.serverTimestamp() 
      }, { merge: true });
      
      console.log('Doctor profile updated (avatar removed)');
      
      // Update avatar preview with cache-bust
      const avatar = $('#avatar-preview');
      if (avatar) {
        const bust = PLACEHOLDER + (PLACEHOLDER.includes('?') ? '&' : '?') + 't=' + Date.now();
        avatar.src = bust;
        avatar.onerror = () => { avatar.src = FALLBACK_AVATAR; };
      }
      toast('Profile picture removed', 'success');
    } catch (err) {
      console.error('Remove avatar error:', err);
      toast(err.message || 'Failed to remove profile picture', 'danger');
    } finally {
      const btnChange = document.querySelector('#btn-avatar-change');
      const btnRemove = document.querySelector('#btn-avatar-remove');
      btnChange && (btnChange.disabled = false);
      btnRemove && (btnRemove.disabled = false);
    }
  }

  async function uploadLicenses(){
    const input = $('#profile-license');
    const files = Array.from(input?.files || []);
    if (!files.length) { toast('Select files to upload','info'); return; }
    const uid = currentUser.uid;
    for (const file of files) {
      try {
        const licRef = db.collection('doctors').doc(uid).collection('licenses').doc();
        const storagePath = `doctors/${uid}/licenses/${licRef.id}_${file.name}`;
        const sref = (storage || firebase.storage()).ref().child(storagePath);
        await sref.put(file, { contentType: file.type });
        const url = await sref.getDownloadURL();
        await licRef.set({
          id: licRef.id,
          name: file.name,
          size: file.size,
          contentType: file.type || null,
          url,
          path: storagePath,
          uploadedAt: FieldValue.serverTimestamp()
        });
      } catch (err) {
        console.error(err);
        toast(`Failed to upload ${file.name}`, 'danger');
      }
    }
    if (input) input.value = '';
    await loadLicenses();
    toast('Upload complete');
  }

  async function loadLicenses(){
    const uid = currentUser.uid;
    const list = $('#license-list');
    if (!list) return;
    list.innerHTML = '<li class="list-group-item text-muted">Loading…</li>';
    try {
      const snap = await db.collection('doctors').doc(uid).collection('licenses').orderBy('uploadedAt','desc').get();
      if (snap.empty) { list.innerHTML = '<li class="list-group-item text-muted">No files uploaded</li>'; return; }
      list.innerHTML = '';
      snap.forEach(doc => {
        const f = doc.data();
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `
          <div>
            <div>${f.name}</div>
            <div class="file-meta">${(f.size/1024).toFixed(1)} KB • ${f.contentType || 'file'}</div>
          </div>
          <div class="d-flex gap-2">
            <a class="btn btn-sm btn-outline-primary" href="${f.url}" target="_blank" rel="noopener">Download</a>
            <button class="btn btn-sm btn-outline-danger" data-del="${f.id}">Delete</button>
          </div>`;
        li.querySelector('[data-del]')?.addEventListener('click', ()=> deleteLicense(f.id, f.path));
        list.appendChild(li);
      });
    } catch (err) {
      console.error(err);
      list.innerHTML = '<li class="list-group-item text-danger">Failed to load licenses</li>';
    }
  }

  async function deleteLicense(id, path){
    const uid = currentUser.uid;
    try {
      await (storage || firebase.storage()).ref().child(path).delete().catch(()=>{});
      await db.collection('doctors').doc(uid).collection('licenses').doc(id).delete();
      await loadLicenses();
      toast('Deleted');
    } catch (err) {
      console.error(err);
      toast('Failed to delete','danger');
    }
  }

  // start
  guardAuth();
})();