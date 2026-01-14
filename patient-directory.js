(function () {
  'use strict';
  
  console.log('[patient-directory.js] 📦 Script loading...');

  if (window.__techmedPatientDirectoryLoaded) {
    console.log('[patient-directory.js] ⚠️ Already loaded, skipping');
    return;
  }
  window.__techmedPatientDirectoryLoaded = true;
  console.log('[patient-directory.js] ✅ Script initialized');

  let db;

  async function waitUntil(checkFn, { timeoutMs = 10000, intervalMs = 50 } = {}) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      (function poll() {
        try {
          if (checkFn()) return resolve(true);
        } catch (_) {}
        if (Date.now() - start >= timeoutMs) return reject(new Error('timeout'));
        setTimeout(poll, intervalMs);
      })();
    });
  }

  const swiperEl = document.querySelector('.swiper');
  const swiperWrapper = document.querySelector('.swiper .swiper-wrapper');
  const directoryContainer = document.querySelector('.doctor-directory .isotope-container');

  const profileImgEl = document.getElementById('doctor-image');
  const profileNameEl = document.getElementById('doctor-name');
  const profileSpecEl = document.getElementById('doctor-specialty');
  const profileBioEl = document.getElementById('doctor-bio');
  const scheduleGridEl = document.getElementById('doctor-schedule');

  const form = document.getElementById('appointment-form');
  const doctorInput = document.getElementById('doctor');
  const doctorIdHidden = document.getElementById('doctorId');
  const dateInput = document.getElementById('date');
  const timeSelect = document.getElementById('time');

  console.log('[patient-directory.js] 🔍 Looking for form elements:');
  console.log('[patient-directory.js]    form:', form ? '✅ found' : '❌ not found');
  console.log('[patient-directory.js]    doctorInput (#doctor):', doctorInput ? '✅ found' : '❌ not found');
  console.log('[patient-directory.js]    doctorIdHidden (#doctorId):', doctorIdHidden ? '✅ found' : '❌ not found');
  console.log('[patient-directory.js]    dateInput (#date):', dateInput ? '✅ found' : '❌ not found');
  console.log('[patient-directory.js]    timeSelect (#time):', timeSelect ? '✅ found' : '❌ not found');

  console.log('[patient-directory.js] 🔍 Looking for profile elements:');
  console.log('[patient-directory.js]    profileImgEl (#doctor-image):', profileImgEl ? '✅ found' : '❌ not found');
  console.log('[patient-directory.js]    profileNameEl (#doctor-name):', profileNameEl ? '✅ found' : '❌ not found');
  console.log('[patient-directory.js]    profileSpecEl (#doctor-specialty):', profileSpecEl ? '✅ found' : '❌ not found');
  console.log('[patient-directory.js]    profileBioEl (#doctor-bio):', profileBioEl ? '✅ found' : '❌ not found');
  console.log('[patient-directory.js]    scheduleGridEl (#doctor-schedule):', scheduleGridEl ? '✅ found' : '❌ not found');

  let calendarInstance = null;
  let calendarLibTries = 0;
  let currentSelectedDoctorId = null;

  const urlDoctorId = new URL(window.location.href).searchParams.get('doctorId');

  const monthlyBookingsCache = new Map();
  const monthlyDailyAvailabilityCache = new Map();

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAY_NAME_TO_INDEX = {
    sun: 0, sunday: 0,
    mon: 1, monday: 1,
    tue: 2, tues: 2, tuesday: 2,
    wed: 3, wednesday: 3,
    thu: 4, thur: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6,
  };

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function formatYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function monthKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function to12h(timeMinutes) {
    const hours24 = Math.floor(timeMinutes / 60);
    const minutes = timeMinutes % 60;
    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    return `${String(hours12)}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  function parseHHMM(hhmm) {
    const [h, m] = (hhmm || '').split(':').map(v => parseInt(v, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }

  function parse12hToHHMM(s) {
    if (!s) return null;
    const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  function parse12hRangeToHHMM(rangeStr) {
    if (!rangeStr || typeof rangeStr !== 'string') return null;
    const parts = rangeStr.split('-');
    if (parts.length !== 2) return null;
    const start = parse12hToHHMM(parts[0].trim());
    const end = parse12hToHHMM(parts[1].trim());
    if (!start || !end) return null;
    return { startHour: start, endHour: end };
  }

  function parse24hRangeToHHMM(rangeStr) {
    if (!rangeStr || typeof rangeStr !== 'string') return null;
    const parts = rangeStr.split('-');
    if (parts.length !== 2) return null;
    const start = (parts[0] || '').trim();
    const end = (parts[1] || '').trim();
    if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) return null;
    return { startHour: start, endHour: end };
  }

  function parseAnyRangeToHHMM(rangeStr) {
    return parse12hRangeToHHMM(rangeStr) || parse24hRangeToHHMM(rangeStr);
  }

  function parseAnyTimeToHHMM(value) {
    if (!value) return undefined;
    if (/^\d{1,2}:\d{2}$/.test(value)) return value;
    return parse12hToHHMM(value) || undefined;
  }

  function normalizeSlotListToHHMM(listMaybe) {
    if (!Array.isArray(listMaybe)) return undefined;
    const out = [];
    for (const t of listMaybe) {
      const hhmm = parseAnyTimeToHHMM(t);
      if (!hhmm) continue;
      const mins = parseHHMM(hhmm);
      if (mins != null && mins % 60 === 0) out.push(hhmm);
    }
    return out.length ? Array.from(new Set(out)) : undefined;
  }

  function looksLikeDayMap(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const keys = Object.keys(obj);
    let dayLikeCount = 0;
    for (const k of keys) {
      const kl = String(k).toLowerCase();
      if (/^\d+$/.test(kl)) { dayLikeCount += 1; continue; }
      if (kl in DAY_NAME_TO_INDEX) { dayLikeCount += 1; continue; }
    }
    return dayLikeCount > 0;
  }

  function normalizeWorkingDays(daysMaybe) {
    if (!Array.isArray(daysMaybe)) return undefined;
    const result = [];
    for (const d of daysMaybe) {
      if (typeof d === 'number' && d >= 0 && d <= 6) {
        result.push(d);
      } else if (typeof d === 'string') {
        const idx = DAY_NAME_TO_INDEX[d.trim().toLowerCase()];
        if (typeof idx === 'number') result.push(idx);
      }
    }
    return result.length ? Array.from(new Set(result)).sort() : undefined;
  }

  function coerceHHMM(val) {
    if (!val) return undefined;
    if (/^\d{1,2}:\d{2}$/.test(val)) return val;
    const c = parse12hToHHMM(val);
    return c || undefined;
  }

  function extractScheduleFromData(raw) {
    const top = raw || {};

    // Check if we have the new schedule format (array of slots)
    if (Array.isArray(top.schedule)) {
      console.log('[DEBUG] Found new schedule format:', top.schedule);
      return top.schedule; // Return the array directly
    }

    const schedTop = top.schedule || {};
    const schedule = {
      workingDays: normalizeWorkingDays(top.workingDays) || normalizeWorkingDays(schedTop.workingDays),
      startHour: coerceHHMM(top.startHour || schedTop.startHour),
      endHour: coerceHHMM(top.endHour || schedTop.endHour),
      slotMinutes: parseInt(top.slotMinutes || schedTop.slotMinutes, 10) || undefined,
      byDay: undefined,
    };

    let weekly = top.weeklySchedule || schedTop.weeklySchedule || top.availability || schedTop.availability || top.scheduleByDay || schedTop.scheduleByDay || top.hoursByDay || schedTop.hoursByDay || top.byDay || schedTop.byDay || top.days || schedTop.days || top.slotsByDay || schedTop.slotsByDay || top.timesByDay || schedTop.timesByDay;
    if (!weekly && looksLikeDayMap(schedTop)) weekly = schedTop;

    const byDay = {};
    const wdSet = new Set(Array.isArray(schedule.workingDays) ? schedule.workingDays : []);

    if (Array.isArray(weekly)) {
      weekly.forEach(item => {
        if (!item) return;
        const dayRaw = String(item.day || item.Day || item.weekday || '').toLowerCase();
        const idx = typeof item.dayIndex === 'number' ? item.dayIndex : DAY_NAME_TO_INDEX[dayRaw];
        const isOff = item.off === true || item.closed === true || item.available === false;
        const range = item.range || item.time || item.hours;
        let start = coerceHHMM(item.start || item.startHour);
        let end = coerceHHMM(item.end || item.endHour);
        if ((!start || !end) && range) {
          const r = parseAnyRangeToHHMM(range);
          start = start || r?.startHour;
          end = end || r?.endHour;
        }
        const slots = normalizeSlotListToHHMM(item.slots || item.times || item.timeSlots);
        if (typeof idx === 'number') {
          if (!isOff && (slots || (start && end))) {
            byDay[idx] = { startHour: start, endHour: end, slots };
            wdSet.add(idx);
          }
        }
      });
    } else if (weekly && typeof weekly === 'object') {
      Object.entries(weekly).forEach(([key, val]) => {
        const keyLower = key.toLowerCase();
        const idx = /^\d+$/.test(keyLower) ? parseInt(keyLower, 10) : DAY_NAME_TO_INDEX[keyLower];
        if (typeof idx !== 'number') return;
        let start, end, slots, isOff;
        if (typeof val === 'string') {
          const r = parseAnyRangeToHHMM(val);
          start = r?.startHour; end = r?.endHour;
        } else if (val && typeof val === 'object') {
          start = coerceHHMM(val.start || val.startHour);
          end = coerceHHMM(val.end || val.endHour);
          slots = normalizeSlotListToHHMM(val.slots || val.times || val.timeSlots);
          isOff = val.off === true || val.closed === true || val.available === false;
          if ((!start || !end) && (val.time || val.range || val.hours)) {
            const r = parseAnyRangeToHHMM(val.time || val.range || val.hours);
            start = start || r?.startHour;
            end = end || r?.endHour;
          }
        }
        if (!isOff && (slots || (start && end))) {
          byDay[idx] = { startHour: start, endHour: end, slots };
          wdSet.add(idx);
        }
      });
    }

    if (Object.keys(byDay).length) {
      schedule.byDay = byDay;
      schedule.workingDays = Array.from(wdSet).sort();
    }

    if (!schedule.slotMinutes) schedule.slotMinutes = 30;

    return schedule;
  }

  function startOfDay(date) { const d = new Date(date); d.setHours(0,0,0,0); return d; }
  function filterPastSlots(slots) { const now = new Date(); return slots.filter(d => d.getTime() > now.getTime()); }

  function getWorkingDays(doctor) {
    const sched = doctor?.schedule || {};
    if (Array.isArray(sched.workingDays) && sched.workingDays.length) return sched.workingDays;
    if (sched.byDay && typeof sched.byDay === 'object') {
      const keys = Object.keys(sched.byDay)
        .map(k => (Number.isInteger(+k) ? +k : DAY_NAME_TO_INDEX[String(k).toLowerCase()]))
        .filter(v => typeof v === 'number' && v >= 0 && v <= 6);
      const unique = Array.from(new Set(keys)).sort();
      if (unique.length) return unique;
    }
    return [];
  }

  function effectiveScheduleForDay(schedule, dayIndex) {
    const sched = schedule || {};
    const byDay = sched.byDay || {};
    const dayOverride = byDay[dayIndex];
    return {
      startHour: (dayOverride && dayOverride.startHour) || sched.startHour,
      endHour: (dayOverride && dayOverride.endHour) || sched.endHour,
      slotMinutes: parseInt(sched.slotMinutes, 10) || 30,
      slotList: dayOverride && Array.isArray(dayOverride.slots) ? dayOverride.slots : undefined,
    };
  }

  function buildHourlySlots(date, startHHMM, endHHMM) {
    const parseHH = (hhmm) => { const [h, m] = (hhmm || '').split(':').map(v => parseInt(v, 10)); return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m; };
    const startMin = parseHH(startHHMM);
    const endMin = parseHH(endHHMM);
    if (startMin == null || endMin == null) return [];
    const slots = [];
    for (let t = startMin; t + 60 <= endMin; t += 60) {
      const slotDate = new Date(date);
      slotDate.setHours(Math.floor(t / 60), t % 60, 0, 0);
      slots.push(slotDate);
    }
    return slots;
  }

  function buildSlotsForDate(date, schedule) {
    const eff = effectiveScheduleForDay(schedule, date.getDay());
    const slots = [];
    if (eff.slotList && eff.slotList.length) {
      for (const hhmm of eff.slotList) {
        const mins = parseHHMM(hhmm);
        if (mins == null) continue;
        const slotDate = new Date(date);
        const hours = Math.floor(mins / 60);
        const minutes = mins % 60;
        slotDate.setHours(hours, minutes, 0, 0);
        slots.push(slotDate);
      }
      return slots.sort((a,b) => a - b);
    }
    if (!eff.startHour || !eff.endHour) return slots;
    return buildHourlySlots(date, eff.startHour, eff.endHour);
  }

  async function buildSlotsForDateWithDaily(doctor, date) {
    const daily = await getDailyOverride(doctor.id, date);
    const slots = [];
    if (daily) {
      if (daily.isOff) return [];
      if (daily.slotList && daily.slotList.length) {
        daily.slotList.forEach(hhmm => {
          const mins = parseHHMM(hhmm);
          const d = new Date(date);
          d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
          slots.push(d);
        });
        return slots;
      }
      if (daily.startHour && daily.endHour) {
        return buildHourlySlots(date, daily.startHour, daily.endHour);
      }
    }

    // Check new schedule format with specific dates
    if (doctor.schedule && Array.isArray(doctor.schedule)) {
      // Use local date formatting to avoid timezone issues
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      console.log('🔍 Checking availability for date:', dateStr);
      
      const availableSlot = doctor.schedule.find(slot => slot.date === dateStr);
      if (availableSlot && availableSlot.time) {
        console.log('✅ Found availability slot:', availableSlot);
        
        // Parse time range (e.g., "10:00 AM - 3:00 PM")
        const timeSlots = parseTimeRange(availableSlot.time);
        timeSlots.forEach(timeSlot => {
          const d = new Date(date);
          d.setHours(timeSlot.hour, timeSlot.minute, 0, 0);
          slots.push(d);
        });
        return slots;
      }
      
      // No specific date found, return empty for new format
      return [];
    }
    
    // Fallback to old schedule format
    return buildSlotsForDate(date, doctor.schedule || {});
  }

  // Helper function to parse time ranges like "10:00 AM - 3:00 PM"
  function parseTimeRange(timeRange) {
    const slots = [];
    try {
      const [startTime, endTime] = timeRange.split(' - ');
      const startHour = parseTime12Hour(startTime.trim());
      const endHour = parseTime12Hour(endTime.trim());
      
      // Generate hourly slots between start and end time
      for (let hour = startHour; hour < endHour; hour++) {
        slots.push({ hour: hour, minute: 0 });
      }
    } catch (error) {
      console.error('Error parsing time range:', timeRange, error);
    }
    return slots;
  }

  // Helper function to parse 12-hour time format to 24-hour
  function parseTime12Hour(timeStr) {
    const [time, period] = timeStr.split(' ');
    const [hours, minutes] = time.split(':').map(Number);
    let hour24 = hours;
    
    if (period === 'PM' && hours !== 12) {
      hour24 += 12;
    } else if (period === 'AM' && hours === 12) {
      hour24 = 0;
    }
    
    return hour24;
  }

  async function prefetchMonthBookings(doctorId, year, monthIndex) {
    const first = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const last = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    const mKey = `${doctorId}|${monthKey(first)}`;
    if (monthlyBookingsCache.has(mKey)) return monthlyBookingsCache.get(mKey);
    const snap = await db.collection('appointments')
      .where('startAt', '>=', firebase.firestore.Timestamp.fromDate(first))
      .where('startAt', '<=', firebase.firestore.Timestamp.fromDate(last))
      .get();
    const dayToSet = new Map();
    snap.forEach(d => {
      const v = d.data();
      if (!v || v.doctorId !== doctorId) return;
      
      // Exclude completed/cancelled appointments from blocking slots
      const status = (v.status || '').toLowerCase();
      const isCompleted = status === 'done' || status === 'completed';
      const isCancelled = status === 'cancelled' || status.includes('cancel');
      
      // Only cache active appointments (not done or cancelled)
      if (isCompleted || isCancelled) return;
      
      const ts = v && v.startAt && v.startAt.toDate ? v.startAt.toDate() : null;
      if (!ts) return;
      const dayKey = formatYMD(ts);
      let set = dayToSet.get(dayKey);
      if (!set) { set = new Set(); dayToSet.set(dayKey, set); }
      set.add(ts.getTime());
    });
    monthlyBookingsCache.set(mKey, dayToSet);
    return dayToSet;
  }

  function normalizeDailyDoc(v) {
    if (!v || typeof v !== 'object') return null;
    const off = v.off === true || v.closed === true || v.available === false;
    const slots = normalizeSlotListToHHMM(v.slots || v.times || v.timeSlots);
    let startHour = (v.start || v.startHour);
    let endHour = (v.end || v.endHour);
    if ((!startHour || !endHour) && (v.time || v.range || v.hours)) {
      const r = parseAnyRangeToHHMM(v.time || v.range || v.hours);
      startHour = startHour || r?.startHour;
      endHour = endHour || r?.endHour;
    }
    if (off) return { off: true };
    if (!slots && (!startHour || !endHour)) return null;
    return { slots, startHour, endHour };
  }

  async function prefetchMonthDailyAvailability(doctorId, year, monthIndex) {
    const first = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const last = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    const mKey = `${doctorId}|${monthKey(first)}`;
    if (monthlyDailyAvailabilityCache.has(mKey)) return monthlyDailyAvailabilityCache.get(mKey);

    const map = new Map();
    try {
      const coll = db.collection('users').doc('doctors').collection('doctors').doc(doctorId).collection('availability');
      try {
        const snap = await coll
          .where('date', '>=', firebase.firestore.Timestamp.fromDate(first))
          .where('date', '<=', firebase.firestore.Timestamp.fromDate(last))
          .get();
        snap.forEach(doc => {
          const v = doc.data() || {};
          let d = v.date && v.date.toDate ? v.date.toDate() : null;
          let key = v.dateStr || null;
          if (d) key = formatYMD(d);
          if (!key) {
            const idYmd = doc.id;
            if (/^\d{4}-\d{2}-\d{2}$/.test(idYmd)) key = idYmd;
          }
          if (!key) return;
          const dayConf = normalizeDailyDoc(v);
          if (dayConf) map.set(key, dayConf);
        });
      } catch (_) {
        const snap = await coll.get();
        snap.forEach(doc => {
          const v = doc.data() || {};
          let key = v.dateStr || null;
          if (!key) {
            const d = v.date && v.date.toDate ? v.date.toDate() : null;
            if (d) key = formatYMD(d);
          }
          if (!key) {
            const idYmd = doc.id;
            if (/^\d{4}-\d{2}-\d{2}$/.test(idYmd)) key = idYmd;
          }
          if (!key) return;
          const dObj = new Date(`${key}T00:00:00`);
          if (dObj < first || dObj > last) return;
          const dayConf = normalizeDailyDoc(v);
          if (dayConf) map.set(key, dayConf);
        });
      }
    } catch {}

    monthlyDailyAvailabilityCache.set(mKey, map);
    return map;
  }

  async function getDailyOverride(doctorId, date) {
    const mk = `${doctorId}|${monthKey(date)}`;
    if (!monthlyDailyAvailabilityCache.has(mk)) {
      await prefetchMonthDailyAvailability(doctorId, date.getFullYear(), date.getMonth());
    }
    const map = monthlyDailyAvailabilityCache.get(mk) || new Map();
    return map.get(formatYMD(date)) || null;
  }

  async function getBookedSetForDayFromCacheOrFetch(doctorId, date) {
    const mk = `${doctorId}|${monthKey(date)}`;
    if (!monthlyBookingsCache.has(mk)) {
      await prefetchMonthBookings(doctorId, date.getFullYear(), date.getMonth());
    }
    const map = monthlyBookingsCache.get(mk) || new Map();
    const set = map.get(formatYMD(date));
    return set ? new Set(set) : new Set();
  }

  async function fetchDoctors() {
    let snap;
    try {
      snap = await db.collection('users').doc('doctors').collection('doctors').orderBy('fullName', 'asc').get();
    } catch (e) {
      snap = await db.collection('users').doc('doctors').collection('doctors').get();
    }
    return snap.docs.map(d => {
      const v = d.data() || {};
      // Use raw schedule array if available, otherwise extract from old format
      const schedule = Array.isArray(v.schedule) ? v.schedule : extractScheduleFromData(v);
      return {
        id: d.id,
        name: v.name || v.fullName || 'Doctor',
        specialty: v.specialty || v.department || v.title || '',
        bio: v.bio || v.about || '',
        photoUrl: v.photoUrl || v.photo || v.image || v.avatarUrl || '',
        reviews: v.reviews || v.review || '',
        schedule,
      };
    });
  }

  let swiperInitTries = 0;
  function ensureSwiperInitialized() {
    if (!swiperEl) return;
    if (swiperEl && swiperEl.swiper) return;
    if (typeof Swiper === 'undefined') {
      if (swiperInitTries++ < 60) setTimeout(ensureSwiperInitialized, 100);
      return;
    }
    // eslint-disable-next-line no-new
    new Swiper(swiperEl, {
      slidesPerView: 2,
      spaceBetween: 15,
      navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
      pagination: { el: '.swiper-pagination', clickable: true },
      breakpoints: { 768: { slidesPerView: 3 }, 992: { slidesPerView: 4 }, 1200: { slidesPerView: 5 } },
    });
  }

  function renderDoctorsToSwiper(doctors) {
    if (!swiperWrapper) return;
    swiperWrapper.innerHTML = '';
    doctors.forEach(doc => {
      const slide = document.createElement('div');
      slide.className = 'swiper-slide';
      slide.innerHTML = `
        <div class="minimal-card text-center" data-doctor-id="${doc.id}"
             data-name="${doc.name}"
             data-specialty="${doc.specialty || ''}"
             data-image="${doc.photoUrl || 'logo.png'}"
             data-bio="${doc.bio || ''}"
             data-reviews="${doc.reviews || ''}">
          <img src="${doc.photoUrl || 'logo.png'}" alt="${doc.name}" class="avatar img-fluid" loading="lazy">
          <div class="info">
            <h4 class="mb-0">${doc.name}</h4>
            <small>${doc.specialty || ''}</small>
          </div>
        </div>`;
      swiperWrapper.appendChild(slide);
    });
    ensureSwiperInitialized();
  }

  function renderDoctorsToDirectory(doctors) {
    if (!directoryContainer) return;
    directoryContainer.innerHTML = '';
    doctors.forEach(doc => {
      const col = document.createElement('div');
      const deptSlug = slugify(doc.specialty || 'general');
      col.className = 'col-lg-3 col-md-6 doctor-item isotope-item ' + `filter-${deptSlug}`;
      col.innerHTML = `
        <article class="doctor-card h-100" data-doctor-id="${doc.id}">
          <figure class="doctor-media">
            <img src="${doc.photoUrl || 'logo.png'}" class="img-fluid" alt="${doc.name}" loading="lazy" onerror="this.onerror=null;this.src='logo.png';">
          </figure>
          <div class="doctor-content">
            <h3 class="doctor-name">${doc.name}</h3>
            <p class="doctor-title">${doc.specialty || ''}</p>
            <p class="doctor-desc">${(doc.bio || '').slice(0, 120)}${(doc.bio || '').length > 120 ? '…' : ''}</p>
            <div class="doctor-meta">
              <span class="badge dept">${doc.specialty || 'Department'}</span>
            </div>
            <div class="doctor-actions">
              <a href="#appointment" class="btn btn-sm btn-appointment" data-doctor-id="${doc.id}" data-doctor="${doc.name}">Book Appointment</a>
              <a href="#" class="btn btn-sm btn-soft view-profile" data-doctor-id="${doc.id}">View Profile</a>
            </div>
          </div>
        </article>`;
      directoryContainer.appendChild(col);
    });
  }

  function updateProfileView(doctor) {
    if (profileImgEl && doctor.photoUrl) profileImgEl.src = doctor.photoUrl;
    if (profileNameEl) profileNameEl.textContent = doctor.name || 'Selected Doctor';
    if (profileSpecEl) profileSpecEl.textContent = doctor.specialty || '';
    if (profileBioEl) profileBioEl.textContent = doctor.bio || '';
    const reviewsEl = document.getElementById('doctor-reviews');
    if (reviewsEl) reviewsEl.textContent = doctor.reviews || 'Reviews will appear here.';

    if (scheduleGridEl) {
      scheduleGridEl.innerHTML = '<div class="text-muted">Select a date to see available times.</div>';
    }
  }

  function destroyCalendarIfAny() {
    if (calendarInstance && typeof calendarInstance.destroy === 'function') {
      calendarInstance.destroy();
      calendarInstance = null;
    }
  }

  async function initCalendarForDoctor(doctor) {
    if (!dateInput) return;
    if (typeof flatpickr === 'undefined') {
      if (calendarLibTries++ < 60) setTimeout(() => initCalendarForDoctor(doctor), 100);
      return;
    }
  
    destroyCalendarIfAny();
  
    // Ensure monthly caches are ready before first paint
    try {
      const now = new Date();
      await Promise.all([
        prefetchMonthBookings(doctor.id, now.getFullYear(), now.getMonth()),
        prefetchMonthDailyAvailability(doctor.id, now.getFullYear(), now.getMonth()),
      ]);
    } catch {}
  
    function getDailyOverrideFromCache(doctorId, date) {
      const mk = `${doctorId}|${monthKey(date)}`;
      const map = monthlyDailyAvailabilityCache.get(mk);
      return map ? map.get(formatYMD(date)) : null;
    }
  
    function buildSlotsForDaySync(doctor, date) {
      const daily = getDailyOverrideFromCache(doctor.id, date);
      const slots = [];
      const add = (hhmm) => {
        const mins = parseHHMM(hhmm); if (mins == null) return;
        const d = new Date(date);
        d.setHours(Math.floor(mins/60), mins%60, 0, 0);
        slots.push(d);
      };
  
      if (daily) {
        if (daily.off) return slots;
        if (Array.isArray(daily.slots) && daily.slots.length) {
          daily.slots.forEach(add);
          return slots.sort((a,b)=>a-b);
        }
        if (daily.startHour && daily.endHour) {
          return buildHourlySlots(date, daily.startHour, daily.endHour);
        }
        return slots;
      }

      // Check new schedule format with specific dates
      if (doctor.schedule && Array.isArray(doctor.schedule)) {
        // Use local date formatting to avoid timezone issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        console.log('🔍 Calendar checking date:', dateStr, 'against schedule dates:', doctor.schedule.map(s => s.date));
        
        // Debug ALL schedule dates to see what days they actually are
        if (dateStr === '2025-11-25' || dateStr === '2025-11-26' || dateStr === '2025-11-27' || dateStr === '2025-11-28' || dateStr === '2025-11-29' || dateStr === '2025-11-30') {
          console.log('🔍 DETAILED: Full schedule array:', doctor.schedule);
          doctor.schedule.forEach((slot, index) => {
            if (slot.date) {
              const scheduleDate = new Date(slot.date + 'T00:00:00');
              const scheduleDayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][scheduleDate.getDay()];
              console.log(`🔍 SCHEDULE SLOT ${index + 1}: ${slot.date} is a ${scheduleDayName} - ${slot.time}`);
            }
          });
          
          const checkDate = new Date(dateStr + 'T00:00:00');
          const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][checkDate.getDay()];
          console.log(`🔍 CHECKING: ${dateStr} is a ${dayName}`);
        }
        const availableSlot = doctor.schedule.find(slot => slot.date === dateStr);
        if (availableSlot && availableSlot.time) {
          console.log('✅ Calendar found slot for', dateStr, ':', availableSlot);
          // Parse time range (e.g., "10:00 AM - 3:00 PM")
          const timeSlots = parseTimeRange(availableSlot.time);
          timeSlots.forEach(timeSlot => {
            const d = new Date(date);
            d.setHours(timeSlot.hour, timeSlot.minute, 0, 0);
            slots.push(d);
          });
          console.log('📅 Generated slots for', dateStr, ':', slots.length, 'slots');
          return slots.sort((a,b)=>a-b);
        }
        console.log('❌ Calendar no availability for', dateStr);
        // No availability for this date in new format
        return slots;
      }
  
      // Fallback to old schedule format
      const eff = effectiveScheduleForDay(doctor.schedule || {}, date.getDay());
      if (eff.slotList && eff.slotList.length) {
        eff.slotList.forEach(add);
        return slots.sort((a,b)=>a-b);
      }
      if (eff.startHour && eff.endHour) {
        return buildHourlySlots(date, eff.startHour, eff.endHour);
      }
      return slots;
    }
  
    function bookedSetFromCache(doctorId, date) {
      const mk = `${doctorId}|${monthKey(date)}`;
      const map = monthlyBookingsCache.get(mk);
      const set = map ? map.get(formatYMD(date)) : null;
      return set ? new Set(set) : new Set();
    }
  
    calendarInstance = flatpickr(dateInput, {
      altInput: false,
      dateFormat: 'Y-m-d',
      minDate: 'today',
      inline: false,  // Changed from true to false - use clickable dropdown instead
      disableMobile: true,
      // keep all days clickable so colors show
      disable: [() => false],
      onDayCreate: function (_dObj, dStr, fp, dayElem) {
        try {
          const d = dayElem.dateObj || (dStr ? new Date(`${dStr}T00:00:00`) : null);
          if (!d || isNaN(d.getTime())) return;
  
          dayElem.classList.remove('available', 'booked', 'non-working');
  
          const allSlots = buildSlotsForDaySync(doctor, d);
          const today = new Date();
          const todayStart = new Date(); todayStart.setHours(0,0,0,0);
          const dateStart = new Date(d); dateStart.setHours(0,0,0,0);
  
          if (allSlots.length === 0 || dateStart < todayStart) {
            dayElem.classList.add('non-working'); // grey
            return;
          }
  
          const effectiveSlots = isSameDay(d, today) ? filterPastSlots(allSlots) : allSlots;
          if (effectiveSlots.length === 0) {
            dayElem.classList.add('non-working'); // grey
            return;
          }
  
          const booked = bookedSetFromCache(doctor.id, d);
          const open = effectiveSlots.some(s => !booked.has(s.getTime()));
  
          dayElem.classList.add(open ? 'available' : 'booked'); // green or red
        } catch {}
      },
      onReady: async function (_sel, _str, fp) {
        const first = new Date(fp.currentYear, fp.currentMonth, 1);
        await Promise.all([
          prefetchMonthBookings(doctor.id, first.getFullYear(), first.getMonth()),
          prefetchMonthDailyAvailability(doctor.id, first.getFullYear(), first.getMonth()),
        ]);
        fp.redraw();
      },
      onMonthChange: async function (_sel, _str, fp) {
        const first = new Date(fp.currentYear, fp.currentMonth, 1);
        await Promise.all([
          prefetchMonthBookings(doctor.id, first.getFullYear(), first.getMonth()),
          prefetchMonthDailyAvailability(doctor.id, first.getFullYear(), first.getMonth()),
        ]);
        fp.redraw();
      },
      onYearChange: async function (_sel, _str, fp) {
        const first = new Date(fp.currentYear, fp.currentMonth, 1);
        await Promise.all([
          prefetchMonthBookings(doctor.id, first.getFullYear(), first.getMonth()),
          prefetchMonthDailyAvailability(doctor.id, first.getFullYear(), first.getMonth()),
        ]);
        fp.redraw();
      },
      onChange: function (selectedDates) {
        const d = selectedDates && selectedDates[0] ? selectedDates[0] : null;
        if (d) { populateTimesForDate(doctor, d); }
      },
    });
  }

  async function fetchBookedForDay(doctorId, date) {
    try {
      if (!monthlyBookingsCache.has(`${doctorId}|${monthKey(date)}`)) {
        const start = new Date(date); start.setHours(0,0,0,0);
        const end = new Date(date); end.setHours(23,59,59,999);
        const snap = await db.collection('appointments')
          .where('startAt', '>=', firebase.firestore.Timestamp.fromDate(start))
          .where('startAt', '<=', firebase.firestore.Timestamp.fromDate(end))
          .get();
        const set = new Set();
        snap.forEach(doc => {
          const v = doc.data();
          if (!v || v.doctorId !== doctorId) return;
          
          // Exclude completed/cancelled appointments from blocking slots
          const status = (v.status || '').toLowerCase();
          const isCompleted = status === 'done' || status === 'completed';
          const isCancelled = status === 'cancelled' || status.includes('cancel');
          
          // Only add to booked set if appointment is active (not done or cancelled)
          if (!isCompleted && !isCancelled) {
            if (v.startAt && v.startAt.toDate) set.add(v.startAt.toDate().getTime());
          }
        });
        return set;
      }
      return await getBookedSetForDayFromCacheOrFetch(doctorId, date);
    } catch (e) {
      return new Set();
    }
  }

  async function populateTimesForDate(doctor, date) {
    console.log('[patient-directory.js] 🕐 populateTimesForDate called');
    console.log('[patient-directory.js]    Doctor:', doctor.name, '(' + doctor.id + ')');
    console.log('[patient-directory.js]    Date:', date);
    
    if (!timeSelect) {
      console.log('[patient-directory.js] ❌ timeSelect element not found!');
      return;
    }

    function to12(valueMinutes) {
      const h24 = Math.floor(valueMinutes / 60);
      const m = valueMinutes % 60;
      const ampm = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 || 12;
      return `${String(h12)}:${m.toString().padStart(2, '0')} ${ampm}`;
    }

    console.log('[patient-directory.js] 📝 Setting time dropdown to "Loading..."');
    timeSelect.innerHTML = '<option value="">Loading...</option>';
    
    try {
      // Build slots considering daily overrides (off, special slots, or custom hours)
      let baseSlots = await buildSlotsForDateWithDaily(doctor, date);
      
      if (!baseSlots || !baseSlots.length) {
        // Check new schedule format with specific dates
        if (doctor.schedule && Array.isArray(doctor.schedule)) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          console.log('[patient-directory.js]    Looking for slots on:', dateStr);
          
          const availableSlot = doctor.schedule.find(slot => slot.date === dateStr);
          if (availableSlot && availableSlot.time) {
            console.log('[patient-directory.js] ✅ Found time slots for date:', dateStr, availableSlot.time);
            const timeSlots = parseTimeRange(availableSlot.time);
            baseSlots = [];
            timeSlots.forEach(timeSlot => {
              const d = new Date(date);
              d.setHours(timeSlot.hour, timeSlot.minute, 0, 0);
              baseSlots.push(d);
            });
          } else {
            console.log('[patient-directory.js] ❌ No availability found for date:', dateStr);
            baseSlots = [];
          }
        } else {
          // Fallback to old schedule format
          const eff = effectiveScheduleForDay(doctor.schedule || {}, date.getDay());
          if (eff.slotList && eff.slotList.length) {
            baseSlots = eff.slotList.map(hhmm => {
              const mins = parseHHMM(hhmm);
              const d = new Date(date);
              d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
              return d;
            });
          } else if (eff.startHour && eff.endHour) {
            baseSlots = buildHourlySlots(date, eff.startHour, eff.endHour);
          } else {
            baseSlots = [];
          }
        }
      }

      const today = new Date();
      const slots = startOfDay(date).toDateString() === today.toDateString() ? filterPastSlots(baseSlots) : baseSlots;

      console.log('[patient-directory.js] 📊 Total slots:', slots.length);
      
      const booked = await fetchBookedForDay(doctor.id, date);
      const available = slots.filter(d => !booked.has(d.getTime()));
      
      console.log('[patient-directory.js] 📊 Available slots:', available.length);

      // Render options with color coding via classes
      timeSelect.innerHTML = '<option value="">Select Time</option>';
      const availableMs = new Set(available.map(d => d.getTime()));
      const seen = new Set();
      
      [...slots].sort((a,b) => a - b).forEach(d => {
        const hours = d.getHours();
        const minutes = d.getMinutes();
        const valueMinutes = hours * 60 + minutes;
        const label = to12(valueMinutes);
        if (seen.has(label)) return;
        seen.add(label);
        const opt = document.createElement('option');
        opt.value = label;
        const isOpen = availableMs.has(d.getTime());
        // Add "(Booked)" label to disabled slots
        opt.textContent = isOpen ? label : `${label} (Booked)`;
        opt.disabled = !isOpen;
        opt.className = isOpen ? 'slot-available' : 'slot-booked';
        timeSelect.appendChild(opt);
      });

      if (available.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No times available';
        timeSelect.appendChild(opt);
        console.log('[patient-directory.js] ⚠️ No available times for this date');
      } else {
        // Don't auto-select first option - let auto-fill script handle it
        console.log('[patient-directory.js] ✅ Populated', timeSelect.options.length - 1, 'time options');
      }
    } catch (e) {
      console.log('[patient-directory.js] ❌ Error populating times:', e);
      timeSelect.innerHTML = '<option value="">No times available</option>';
    }
  }

  async function selectDoctor(doctor) {
    if (currentSelectedDoctorId === doctor.id) return;
    
    // IMPORTANT: Set flag FIRST before changing form values
    // This prevents doctor.html from overriding our calendar
    window.currentSelectedDoctorId = doctor.id;
    currentSelectedDoctorId = doctor.id;
    
    // Set backup for smart-booking-integration.js (since appointment-autofill.js is disabled)
    window.__selectedDoctorId = doctor.id;
    window.__selectedDoctorName = doctor.name;
    
    // Now safe to update form fields (these trigger watchers in doctor.html)
    if (doctorInput) doctorInput.value = doctor.name;
    if (doctorIdHidden) doctorIdHidden.value = doctor.id;

    updateProfileView(doctor);
    renderWeeklySchedule(doctor);
    initCalendarForDoctor(doctor);

    if (calendarInstance && calendarInstance.selectedDates?.length) {
      await populateTimesForDate(doctor, calendarInstance.selectedDates[0]);
    } else if (dateInput && dateInput.value) {
      const d = new Date(dateInput.value);
      if (!isNaN(d.getTime())) await populateTimesForDate(doctor, d);
    }
  }

  function renderWeeklySchedule(doctor) {
    if (!scheduleGridEl) return;
    const sched = doctor.schedule || {};
    const byDay = sched.byDay || {};
    const working = getWorkingDays(doctor);
    if ((!working || working.length === 0) && (!byDay || Object.keys(byDay).length === 0)) {
      scheduleGridEl.innerHTML = '<div class="text-muted">No schedule available.</div>';
      return;
    }

    const daysToRender = byDay && Object.keys(byDay).length
      ? Array.from(new Set(Object.keys(byDay)
          .map(k => (Number.isInteger(+k) ? +k : DAY_NAME_TO_INDEX[String(k).toLowerCase()]))
          .filter(v => typeof v === 'number'))).sort((a,b) => a-b)
      : working;

    let html = '<div class="row g-2">';
    daysToRender.forEach(i => {
      const dConf = byDay[i] || null;
      let range = '';
      if (dConf && (dConf.startHour || dConf.endHour)) {
        const sMin = parseHHMM(dConf.startHour);
        const eMin = parseHHMM(dConf.endHour);
        range = `${sMin != null ? to12h(sMin) : ''}${sMin != null && eMin != null ? ' - ' : ''}${eMin != null ? to12h(eMin) : ''}`;
      } else if (sched.startHour && sched.endHour) {
        const sMin = parseHHMM(sched.startHour);
        const eMin = parseHHMM(sched.endHour);
        range = `${to12h(sMin)} - ${to12h(eMin)}`;
      }
      html += `
        <div class="col-6 col-md-4">
          <div class="border rounded p-2 h-100 ${range ? 'bg-available-day' : 'bg-unavailable-day'}">
            <div class="fw-semibold">${DAY_NAMES[i]}</div>
            <div class="small">${range || '—'}</div>
          </div>
        </div>`;
    });
    html += '</div>';
    scheduleGridEl.innerHTML = html;
  }

  async function bootstrap() {
    console.log('[patient-directory.js] 🚀 Bootstrap starting...');
    try {
      // ...
      (function ensureBookingStyles() {
        if (document.getElementById('bookingColorStyles')) return;
        const style = document.createElement('style');
        style.id = 'bookingColorStyles';
        style.textContent = `
          .flatpickr-day.semi-disabled{ opacity:.3; pointer-events:none; }
          .flatpickr-day.available{ background:#e0ffe0; border-radius:50%; }
          .flatpickr-day.booked{ background:#ffcccc; border-radius:50%; pointer-events:none; }
          .flatpickr-day.selected{ background:#87cefa!important; color:#000!important; border-radius:50%; }
          
          /* Time dropdown styling - Fixed selector from #timeSelect to #time */
          select#time option.slot-available { 
            color: #198754 !important; 
            font-weight: 500; 
            background: #f0fff4 !important;
          }
          select#time option.slot-booked { 
            color: #dc3545 !important; 
            background: #ffe0e0 !important;
            font-weight: 400;
            text-decoration: line-through;
          }
          select#time option:disabled {
            color: #dc3545 !important;
            background: #ffe0e0 !important;
            cursor: not-allowed !important;
          }
        `;
        document.head.appendChild(style);
      })();

      await waitUntil(() => window.firebase && firebase.apps && firebase.apps.length > 0);
      db = firebase.firestore();
      
      // Expose db globally for other scripts
      window.db = db;
      console.log('[patient-directory.js] ✅ Firestore db exposed globally');

      const doctors = await fetchDoctors();

      if (doctors.length === 0) {
        return;
      }

      // Store doctors globally
      const doctorsById = new Map(doctors.map(d => [d.id, d]));

      // Initial render
      renderDoctorsToSwiper(doctors);
      renderDoctorsToDirectory(doctors);

      // Set up event delegation for "Book Appointment" buttons in doctor cards
      console.log('[patient-directory.js] 🎯 Setting up Book Appointment button handlers...');
      document.addEventListener('click', async function(e) {
        // Check if clicked element or its parent is a book appointment button
        const bookBtn = e.target.closest('.btn-appointment, a[href="#appointment"]');
        if (!bookBtn) return;
        
        const doctorId = bookBtn.getAttribute('data-doctor-id') || bookBtn.closest('[data-doctor-id]')?.getAttribute('data-doctor-id');
        if (!doctorId) {
          console.warn('[patient-directory.js] ⚠️ No doctor ID found on button');
          return;
        }
        
        console.log('[patient-directory.js] 📋 Book Appointment clicked for doctor:', doctorId);
        
        // Prevent default anchor behavior
        e.preventDefault();
        
        // Get doctor data from our map
        const doctor = doctorsById.get(doctorId);
        if (!doctor) {
          console.warn('[patient-directory.js] ⚠️ Doctor not found in map:', doctorId);
          return;
        }
        
        console.log('[patient-directory.js] ✅ Doctor found:', doctor.name);
        console.log('[patient-directory.js] 📅 Doctor schedule:', doctor.schedule);
        
        // Use selectDoctorWithAvailability to fill form and initialize calendar
        await selectDoctorWithAvailability(doctor);
        
        // Scroll to appointment form
        const appointmentSection = document.getElementById('appointment');
        if (appointmentSection) {
          appointmentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          console.log('[patient-directory.js] ✅ Scrolled to appointment form');
        }
        
        // Show a toast notification
        try {
          const hasBootstrap = !!(window.bootstrap && window.bootstrap.Toast);
          let container = document.getElementById('globalToastContainer');
          if (!container) {
            container = document.createElement('div');
            container.id = 'globalToastContainer';
            container.className = 'toast-container position-fixed top-0 end-0 p-3';
            container.style.zIndex = '1080';
            document.body.appendChild(container);
          }
          
          const toast = document.createElement('div');
          toast.className = 'toast align-items-center text-bg-success border-0';
          toast.setAttribute('role', 'alert');
          toast.setAttribute('aria-live', 'assertive');
          toast.setAttribute('aria-atomic', 'true');
          toast.innerHTML = `
            <div class="d-flex">
              <div class="toast-body">
                <i class="bi bi-check-circle me-2"></i>Doctor selected: ${doctor.name}. Select a date to see available times.
              </div>
              <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
          `;
          
          container.appendChild(toast);
          
          if (hasBootstrap) {
            const t = new window.bootstrap.Toast(toast, { delay: 4000 });
            t.show();
            toast.addEventListener('hidden.bs.toast', () => { toast.remove(); });
          } else {
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => { if (toast && toast.parentNode) toast.parentNode.removeChild(toast); }, 4500);
          }
        } catch (error) {
          console.error('[patient-directory.js] Error showing toast:', error);
        }
      });
      console.log('[patient-directory.js] ✅ Book Appointment handlers registered');

      // Hide loading skeleton
      const skeleton = document.getElementById('doctorLoadingSkeleton');
      if (skeleton) {
        skeleton.style.display = 'none';
      }

      window.addEventListener('load', ensureSwiperInitialized, { once: true });

      // attachSelectionHandlers(doctorsById); // TODO: Function not defined, commenting out for now
      console.log('[patient-directory.js] ℹ️ Skipping attachSelectionHandlers (not defined)');

      if (urlDoctorId && doctorsById.has(urlDoctorId)) {
        await selectDoctor(doctorsById.get(urlDoctorId));
      } else if (doctorIdHidden && doctorIdHidden.value && doctorsById.has(doctorIdHidden.value)) {
        await selectDoctor(doctorsById.get(doctorIdHidden.value));
      } else if (doctorInput && doctorInput.value) {
        const match = doctors.find(d => d.name === doctorInput.value);
        if (match) await selectDoctor(match);
      }

      if (dateInput) {
        console.log('[patient-directory.js] Attaching date change listener to:', dateInput.id);
        dateInput.addEventListener('change', async () => {
          console.log('[patient-directory.js] Date changed!');
          
          // Try to get doctor ID from field or backup
          let id = doctorIdHidden && doctorIdHidden.value;
          if (!id) {
            // Use backup if field was cleared
            id = window.__selectedDoctorId || window.currentSelectedDoctorId;
            console.log('[patient-directory.js]    Using backup doctor ID:', id);
            
            // Restore it to the field
            if (id && doctorIdHidden) {
              doctorIdHidden.value = id;
              console.log('[patient-directory.js]    Restored doctor ID to field');
            }
          }
          
          console.log('[patient-directory.js]    Doctor ID:', id);
          console.log('[patient-directory.js]    Date value:', dateInput.value);
          
          if (!id || !dateInput.value) {
            console.log('[patient-directory.js] Missing doctor ID or date, skipping time population');
            return;
          }
          
          console.log('[patient-directory.js] Fetching doctor data for:', id);
          const docSnap = await db.collection('users').doc('doctors').collection('doctors').doc(id).get();
          if (!docSnap.exists) {
            console.log('[patient-directory.js] Doctor not found');
            return;
          }
          
          const dData = docSnap.data() || {};
          console.log('[patient-directory.js] Doctor data retrieved');
          
          const selectedDoc = {
            id: docSnap.id,
            name: dData.name || dData.fullName || 'Doctor',
            specialty: dData.specialty || dData.department || dData.title || '',
            bio: dData.bio || dData.about || '',
            photoUrl: dData.photoUrl || dData.photo || dData.image || dData.avatarUrl || '',
            reviews: dData.reviews || dData.review || '',
            schedule: extractScheduleFromData(dData),
          };
          
          const d = new Date(dateInput.value);
          if (!isNaN(d.getTime())) {
            console.log('[patient-directory.js] Populating times for date:', dateInput.value);
            await populateTimesForDate(selectedDoc, d);
          } else {
            console.log('[patient-directory.js] Invalid date:', dateInput.value);
          }
        });
      } else {
        console.log('[patient-directory.js] dateInput element not found!');
      }

      // Wire topbar "Appointments" button to show patient's booked appointments
      (function wireAppointmentsTopbar() {
        const apptBtn = document.getElementById('appointmentBtn');
        const modalEl = document.getElementById('appointmentModal');
        const tableBody = document.querySelector('#appointmentTable tbody');
        if (!apptBtn || !modalEl || !tableBody) return;
        // Change table header to Doctor for patient POV if present
        const thFirst = document.querySelector('#appointmentTable thead th:first-child');
        if (thFirst) thFirst.textContent = 'Doctor';

        async function fetchPatientAppointments() {
          const user = (firebase.auth && firebase.auth().currentUser) || null;
          if (!user) { window.location.replace('login.html'); return []; }
          const now = new Date();
          let snap = null;
          try {
            snap = await db.collection('appointments')
              .where('patientId', '==', user.uid)
              .where('startAt', '>=', firebase.firestore.Timestamp.fromDate(new Date(now.getTime())))
              .orderBy('startAt', 'asc')
              .get();
          } catch (_) {
            // Fallback without orderBy to avoid composite index; sort client-side
            snap = await db.collection('appointments')
              .where('patientId', '==', user.uid)
              .get();
          }
          const items = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(v => v && v.startAt && v.startAt.toDate && v.startAt.toDate() >= now)
            .filter(v => (String(v.status || '').toLowerCase() !== 'done' && String(v.status || '').toLowerCase() !== 'completed'))
            .sort((a, b) => a.startAt.toDate() - b.startAt.toDate());
          return items;
        }

        function fmt(ts) {
          try { return ts.toDate().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
          catch { return ''; }
        }

        function resolveMeetingUrl(v) {
          return (
            v.meetingUrl || v.meetingLink || v.videoUrl || v.videoLink || v.link || v.roomUrl || v.roomLink || ''
          );
        }

        async function renderAppointments() {
          tableBody.innerHTML = '';
          let items = [];
          try { items = await fetchPatientAppointments(); } catch (_) { items = []; }
          if (!items.length) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="3" class="text-muted">No upcoming appointments</td>';
            tableBody.appendChild(row);
            return;
          }
          items.forEach(v => {
            const row = document.createElement('tr');
            const joinUrl = resolveMeetingUrl(v);
            const actionHtml = joinUrl
              ? `<a href="${joinUrl}" class="btn btn-success btn-sm" target="_blank" rel="noopener">Join Meeting</a>`
              : '<span class="text-muted">No link</span>';
            row.innerHTML = `
              <td>${v.doctorName || 'Doctor'}</td>
              <td>${v.startAt ? fmt(v.startAt) : ''}</td>
              <td>${actionHtml}</td>
            `;
            tableBody.appendChild(row);
          });
        }

        apptBtn.addEventListener('click', async () => {
          await renderAppointments();
          try {
            if (window.bootstrap && window.bootstrap.Modal) {
              const m = window.bootstrap.Modal.getOrCreateInstance(modalEl);
              m.show();
            } else {
              // Bootstrap not available; fallback display
              modalEl.style.display = 'block';
            }
          } catch (_) { /* ignore */ }
        });
      })();
    } catch (err) {
      console.error('Failed to initialize patient directory:', err);
    }
  }

  // Doctor profile modal function
  async function showDoctorProfileModal(doctor) {
    console.log('📋 showDoctorProfileModal called with doctor:', doctor);
    
    // Get modal elements
    const modal = document.getElementById('doctorProfileModal');
    if (!modal) {
      console.error('❌ Doctor profile modal not found in DOM');
      return;
    }
    console.log('✅ Modal element found:', modal);

    // Fetch full doctor data from Firestore for complete information
    let fullDoctorData = { ...doctor };
    try {
      const docSnap = await db.collection('users').doc('doctors').collection('doctors').doc(doctor.id).get();
      if (docSnap.exists) {
        fullDoctorData = { ...fullDoctorData, ...docSnap.data() };
        console.log('📦 Full doctor data from Firestore:', fullDoctorData);
      }
    } catch (error) {
      console.error('⚠️ Error fetching full doctor data:', error);
    }

    // Populate modal with doctor information
    const modalPhoto = document.getElementById('modalDoctorPhoto');
    const modalName = document.getElementById('modalDoctorName');
    const modalSpecialty = document.getElementById('modalDoctorSpecialty');
    const modalPhone = document.getElementById('modalDoctorPhone');
    const modalEmail = document.getElementById('modalDoctorEmail');
    const modalStatus = document.getElementById('modalDoctorStatus');
    const modalBio = document.getElementById('modalDoctorBio');
    const modalSchedule = document.getElementById('modalDoctorSchedule');
    const bookBtn = document.getElementById('bookFromProfileBtn');

    // Additional sections
    const modalEducationSection = document.getElementById('modalEducationSection');
    const modalEducation = document.getElementById('modalDoctorEducation');
    const modalLanguagesSection = document.getElementById('modalLanguagesSection');
    const modalLanguages = document.getElementById('modalDoctorLanguages');
    const modalReviewsSection = document.getElementById('modalReviewsSection');
    const modalReviews = document.getElementById('modalDoctorReviews');
    const modalFeeSection = document.getElementById('modalFeeSection');
    const modalFee = document.getElementById('modalDoctorFee');
    const modalAdditionalSection = document.getElementById('modalAdditionalSection');
    const modalAdditional = document.getElementById('modalDoctorAdditional');

    // Set doctor info
    if (modalPhoto) modalPhoto.src = fullDoctorData.photoUrl || fullDoctorData.avatarUrl || 'logo.png';
    if (modalName) modalName.textContent = fullDoctorData.name || fullDoctorData.fullName || 'Doctor';
    if (modalSpecialty) modalSpecialty.textContent = fullDoctorData.specialty || fullDoctorData.department || fullDoctorData.title || '';
    
    if (modalPhone) {
      const phoneValue = fullDoctorData.phone || fullDoctorData.phoneNumber || fullDoctorData.contactNumber || 'Not provided';
      const phoneSpan = modalPhone.querySelector('span');
      if (phoneSpan) {
        phoneSpan.textContent = phoneValue;
      } else {
        modalPhone.innerHTML = `<i class="bi bi-telephone me-2"></i>${phoneValue}`;
      }
    }
    
    if (modalEmail) {
      const emailValue = fullDoctorData.email || fullDoctorData.contactEmail || 'Not provided';
      const emailSpan = modalEmail.querySelector('span');
      if (emailSpan) {
        emailSpan.textContent = emailValue;
      } else {
        modalEmail.innerHTML = `<i class="bi bi-envelope me-2"></i>${emailValue}`;
      }
    }

    // Status indicator
    if (modalStatus) {
      const status = fullDoctorData.status || 'active';
      const statusText = status.charAt(0).toUpperCase() + status.slice(1);
      const statusColor = status === 'active' ? 'text-success' : status === 'inactive' ? 'text-danger' : 'text-warning';
      const iconEl = modalStatus.querySelector('i');
      const spanEl = modalStatus.querySelector('span');
      if (iconEl) iconEl.className = `bi bi-circle-fill me-2 ${statusColor}`;
      if (spanEl) spanEl.textContent = statusText;
    }
    
    if (modalBio) {
      const bioText = fullDoctorData.bio || fullDoctorData.about || fullDoctorData.description || 'No bio available.';
      // Preserve line breaks by converting newlines to <br> tags
      const escapedBio = bioText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const bioWithBreaks = escapedBio.replace(/\n/g, '<br>');
      modalBio.innerHTML = bioWithBreaks;
    }

    // Education
    if (modalEducation && modalEducationSection) {
      const education = fullDoctorData.education || fullDoctorData.qualifications || fullDoctorData.credentials;
      if (education) {
        modalEducationSection.classList.remove('d-none');
        if (Array.isArray(education)) {
          modalEducation.innerHTML = '<ul class="mb-0">' + education.map(e => `<li>${e}</li>`).join('') + '</ul>';
        } else if (typeof education === 'string') {
          modalEducation.innerHTML = education.split('\n').map(line => `<p class="mb-1">${line}</p>`).join('');
        } else {
          modalEducation.textContent = String(education);
        }
      } else {
        modalEducationSection.classList.add('d-none');
      }
    }

    // Languages
    if (modalLanguages && modalLanguagesSection) {
      const languages = fullDoctorData.languages || fullDoctorData.spokenLanguages;
      if (languages) {
        modalLanguagesSection.classList.remove('d-none');
        if (Array.isArray(languages)) {
          modalLanguages.innerHTML = languages.map(lang => `<span class="badge bg-secondary me-1">${lang}</span>`).join('');
        } else if (typeof languages === 'string') {
          const langArray = languages.split(',').map(l => l.trim());
          modalLanguages.innerHTML = langArray.map(lang => `<span class="badge bg-secondary me-1">${lang}</span>`).join('');
        } else {
          modalLanguages.textContent = String(languages);
        }
      } else {
        modalLanguagesSection.classList.add('d-none');
      }
    }

    // Reviews/Ratings
    if (modalReviews && modalReviewsSection) {
      const reviews = fullDoctorData.reviews || fullDoctorData.review || fullDoctorData.rating;
      if (reviews) {
        modalReviewsSection.classList.remove('d-none');
        if (typeof reviews === 'object' && reviews.average) {
          const stars = '★'.repeat(Math.round(reviews.average)) + '☆'.repeat(5 - Math.round(reviews.average));
          modalReviews.innerHTML = `
            <div class="d-flex align-items-center mb-2">
              <span class="text-warning fs-5 me-2">${stars}</span>
              <span class="fw-bold">${reviews.average.toFixed(1)}</span>
              ${reviews.count ? `<span class="text-muted ms-2">(${reviews.count} reviews)</span>` : ''}
            </div>
            ${reviews.text ? `<p class="mb-0">${reviews.text}</p>` : ''}
          `;
        } else if (typeof reviews === 'number') {
          const stars = '★'.repeat(Math.round(reviews)) + '☆'.repeat(5 - Math.round(reviews));
          modalReviews.innerHTML = `<span class="text-warning fs-5">${stars}</span> <span class="fw-bold">${reviews.toFixed(1)}</span>`;
        } else if (typeof reviews === 'string') {
          modalReviews.textContent = reviews;
        } else {
          modalReviews.textContent = String(reviews);
        }
      } else {
        modalReviewsSection.classList.add('d-none');
      }
    }

    // Consultation Fee
    if (modalFee && modalFeeSection) {
      const fee = fullDoctorData.consultationFee || fullDoctorData.fee || fullDoctorData.price;
      if (fee) {
        modalFeeSection.classList.remove('d-none');
        if (typeof fee === 'number') {
          modalFee.innerHTML = `<span class="fs-5 fw-bold text-primary">₱${fee.toFixed(2)}</span>`;
        } else if (typeof fee === 'object' && fee.amount) {
          const currency = fee.currency || '₱';
          modalFee.innerHTML = `<span class="fs-5 fw-bold text-primary">${currency}${fee.amount.toFixed(2)}</span>`;
        } else {
          modalFee.textContent = String(fee);
        }
      } else {
        modalFeeSection.classList.add('d-none');
      }
    }

    // Additional Information
    if (modalAdditional && modalAdditionalSection) {
      const additionalInfo = [];
      
      // Collect any additional fields
      if (fullDoctorData.licenseNumber) additionalInfo.push(`<strong>License Number:</strong> ${fullDoctorData.licenseNumber}`);
      
      // Add years of experience
      const yearsExp = fullDoctorData.experience || fullDoctorData.yearsOfExperience || fullDoctorData.years_of_experience || fullDoctorData.experienceYears || fullDoctorData.yearsExperience;
      if (yearsExp) additionalInfo.push(`<strong>Years of Experience:</strong> ${yearsExp}`);
      
      if (fullDoctorData.prcNumber) additionalInfo.push(`<strong>PRC Number:</strong> ${fullDoctorData.prcNumber}`);
      if (fullDoctorData.clinic || fullDoctorData.clinicName) additionalInfo.push(`<strong>Clinic:</strong> ${fullDoctorData.clinic || fullDoctorData.clinicName}`);
      if (fullDoctorData.clinicAddress) additionalInfo.push(`<strong>Clinic Address:</strong> ${fullDoctorData.clinicAddress}`);
      if (fullDoctorData.website) additionalInfo.push(`<strong>Website:</strong> <a href="${fullDoctorData.website}" target="_blank">${fullDoctorData.website}</a>`);
      if (fullDoctorData.linkedIn) additionalInfo.push(`<strong>LinkedIn:</strong> <a href="${fullDoctorData.linkedIn}" target="_blank">View Profile</a>`);
      if (fullDoctorData.specialization && fullDoctorData.specialization !== fullDoctorData.specialty) {
        additionalInfo.push(`<strong>Specialization:</strong> ${fullDoctorData.specialization}`);
      }
      if (fullDoctorData.certifications) {
        const certs = Array.isArray(fullDoctorData.certifications) ? fullDoctorData.certifications.join(', ') : fullDoctorData.certifications;
        additionalInfo.push(`<strong>Certifications:</strong> ${certs}`);
      }

      if (additionalInfo.length > 0) {
        modalAdditionalSection.classList.remove('d-none');
        modalAdditional.innerHTML = additionalInfo.map(info => `<p class="mb-1">${info}</p>`).join('');
      } else {
        modalAdditionalSection.classList.add('d-none');
      }
    }

    // Schedule display
    if (modalSchedule) {
      console.log('📅 Rendering schedule for doctor:', fullDoctorData.schedule);
      
      // Use the same schedule that was passed in (already has the correct format)
      const scheduleToRender = doctor.schedule;
      
      // Check if new format (array) or old format (object)
      if (Array.isArray(scheduleToRender) && scheduleToRender.length > 0) {
        renderNewFormatAvailability({ ...doctor, schedule: scheduleToRender }, modalSchedule);
      } else if (scheduleToRender && typeof scheduleToRender === 'object' && Object.keys(scheduleToRender).length > 0) {
        renderOldFormatAvailability({ ...doctor, schedule: scheduleToRender }, modalSchedule);
      } else {
        modalSchedule.innerHTML = '<div class="alert alert-info"><i class="bi bi-info-circle me-2"></i>No availability schedule set by doctor yet.</div>';
      }
    }

    // Function to close modal
    function closeModal() {
      try {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          const bsModal = bootstrap.Modal.getInstance(modal);
          if (bsModal) {
            bsModal.hide();
            return;
          }
        }
        
        // Manual close
        modal.classList.remove('show');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('aria-modal');
        
        // Remove backdrop
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
        document.body.classList.remove('modal-open');
        
        console.log(' Modal closed');
      } catch(e) {
        console.error('Error closing modal:', e);
      }
    }
    
    // Setup close buttons
    const closeButtons = modal.querySelectorAll('[data-bs-dismiss="modal"]');
    closeButtons.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        closeModal();
      };
    });
    
    // Setup book appointment button
    if (bookBtn) {
      bookBtn.onclick = async () => {
        closeModal();
        
        // Select doctor with availability and fill patient info
        await selectDoctorWithAvailability(doctor);
        const section = document.getElementById('appointment');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    }

    // Show modal
    try {
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        console.log(' Modal shown using Bootstrap');
      } else {
        // Fallback manual display
        modal.classList.add('show');
        modal.style.display = 'block';
        modal.setAttribute('aria-modal', 'true');
        modal.removeAttribute('aria-hidden');
        
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop fade show';
        document.body.appendChild(backdrop);
        document.body.classList.add('modal-open');
        
        console.log(' Modal shown manually');
      }
    } catch (error) {
      console.error(' Error showing modal:', error);
      alert('Error opening profile: ' + error.message);
    }
  }

  // Function to fill patient information in appointment form
  async function fillPatientInfoInForm() {
    try {
      const user = firebase.auth && firebase.auth().currentUser;
      if (!user) return;

      // Get form elements
      const nameInput = document.querySelector('input[name="name"]');
      const emailInput = document.querySelector('input[name="email"]');
      const phoneInput = document.querySelector('input[name="phone"]');

      if (!nameInput || !emailInput || !phoneInput) return;

      // Fill email from Firebase auth
      if (user.email && !emailInput.value) {
        emailInput.value = user.email;
      }

      // Try to fetch patient data from Firestore
      try {
        // Try new structure first
        let patientDoc = await db.collection('users').doc('patients').collection('patients').doc(user.uid).get();
        
        // Fallback to old structure
        if (!patientDoc.exists) {
          patientDoc = await db.collection('users').doc(user.uid).get();
        }

        if (patientDoc.exists) {
          const data = patientDoc.data();
          
          // Fill name
          if (!nameInput.value) {
            const fullName = data.fullName || data.name || 
                           (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : '') ||
                           (data.first_name && data.last_name ? `${data.first_name} ${data.last_name}` : '') ||
                           user.displayName || '';
            if (fullName) nameInput.value = fullName;
          }

          // Fill phone
          if (!phoneInput.value) {
            const phone = data.phone || data.phoneNumber || data.contactNumber || '';
            if (phone) phoneInput.value = phone;
          }

          // Fill email if not already filled
          if (!emailInput.value && data.email) {
            emailInput.value = data.email;
          }
        }
      } catch (error) {
        console.log('Could not fetch patient data:', error);
        // Fill basic info from Firebase auth if Firestore fails
        if (!nameInput.value && user.displayName) {
          nameInput.value = user.displayName;
        }
      }

      console.log(' Patient information filled in appointment form');
    } catch (error) {
      console.error('Error filling patient info:', error);
    }
  }

  // Enhanced selectDoctor function to show availability
  async function selectDoctorWithAvailability(doctor) {
    // First, fetch the full doctor data with complete schedule from Firestore
    let fullDoctorData = { ...doctor };
    try {
      console.log(' Fetching full doctor schedule from Firestore for:', doctor.name);
      console.log('🔍 Fetching full doctor schedule from Firestore for:', doctor.name);
      const docSnap = await db.collection('users').doc('doctors').collection('doctors').doc(doctor.id).get();
      if (docSnap.exists) {
        const rawData = docSnap.data();
        fullDoctorData = { ...fullDoctorData, ...rawData };
        console.log('📦 Raw Firestore data:', rawData);
        console.log('📅 Raw schedule field:', rawData.schedule);
        console.log('📅 Schedule type:', Array.isArray(rawData.schedule) ? 'Array' : typeof rawData.schedule);
        if (Array.isArray(rawData.schedule)) {
          console.log('📅 Schedule entries:', rawData.schedule.map(s => `${s.date} -> ${s.time}`));
          console.log('📅 Full schedule objects:', rawData.schedule);
        }
        console.log('📦 Full doctor data after merge:', fullDoctorData);
      } else {
        console.warn('⚠️ No doctor document found in Firestore for ID:', doctor.id);
      }
    } catch (error) {
      console.error('❌ Error fetching full doctor data:', error);
    }

    // Use the full doctor data for selection (this will update the calendar with availability)
    await selectDoctor(fullDoctorData);
    
    // Fill patient info when doctor is selected
    await fillPatientInfoInForm();
    
    // Check directory filters for automated scheduling
    const dirDateInput = document.getElementById('dirDate');
    const dirTimeSelect = document.getElementById('dirTime');
    
    const hasDateFilter = dirDateInput && dirDateInput.value;
    const hasTimeFilter = dirTimeSelect && dirTimeSelect.value;
    
    console.log('🔍 Checking booking mode:');
    console.log('   dirDate value:', hasDateFilter ? dirDateInput.value : 'EMPTY');
    console.log('   dirTime value:', hasTimeFilter ? dirTimeSelect.value : 'EMPTY');
    
    if (hasDateFilter && hasTimeFilter) {
      // 🤖 AUTOMATED SCHEDULING MODE
      console.log('🤖 AUTOMATED SCHEDULING: Filters detected, auto-filling date and time...');
      
      // Auto-fill date from filter
      if (dateInput) {
        const filterDate = dirDateInput.value;
        
        // Use Flatpickr to set date if available
        if (dateInput._flatpickr || window.appointmentCalendar) {
          const fpInstance = dateInput._flatpickr || window.appointmentCalendar;
          fpInstance.setDate(filterDate, false); // Don't trigger change yet
          console.log('✅ Date auto-filled via Flatpickr:', filterDate);
        } else {
          dateInput.value = filterDate;
          console.log('✅ Date auto-filled directly:', filterDate);
        }
        
        // Trigger date change to load time slots
        setTimeout(async () => {
          const event = new Event('change', { bubbles: true });
          dateInput.dispatchEvent(event);
          console.log('🔄 Triggered date change to load time slots');
          
          // Wait for time slots to populate, then set time
          const filterTime = dirTimeSelect.value;
          let attempts = 0;
          const maxAttempts = 30; // 3 seconds max
          
          const checkAndSetTime = () => {
            attempts++;
            
            const hasRealOptions = timeSelect.options.length > 1 && 
                                  timeSelect.options[0].textContent !== 'Loading...';
            
            if (hasRealOptions) {
              // Time slots loaded, set the value
              timeSelect.value = filterTime;
              console.log('✅ Time auto-filled from filter:', filterTime);
              
              // Trigger change event
              const timeEvent = new Event('change', { bubbles: true });
              timeSelect.dispatchEvent(timeEvent);
              
              // Show success message
              console.log('🎉 AUTOMATED SCHEDULING COMPLETE: Form fully auto-filled!');
              console.log('   ✅ Patient info filled');
              console.log('   ✅ Doctor:', doctor.name);
              console.log('   ✅ Date:', filterDate);
              console.log('   ✅ Time:', filterTime);
              console.log('   👉 User just needs to click "Book Appointment" button!');
              
            } else if (attempts < maxAttempts) {
              // Not ready yet, try again
              if (attempts % 5 === 0) {
                console.log(`   ⏳ Waiting for time slots (${attempts}/${maxAttempts})...`);
              }
              setTimeout(checkAndSetTime, 100);
            } else {
              console.warn('⚠️ Time slots did not load after 3 seconds');
            }
          };
          
          // Start checking after initial delay
          setTimeout(checkAndSetTime, 500);
          
        }, 100);
      }
      
    } else {
      // 👆 MANUAL BOOKING MODE
      console.log('👆 MANUAL BOOKING: No filters set, user will select date/time manually');
      console.log('   ✅ Patient info filled');
      console.log('   ✅ Doctor:', doctor.name);
      console.log('   ❌ Date: Empty (user must select)');
      console.log('   ❌ Time: Empty (user must select)');
      console.log('   👉 User will pick date/time from calendar and dropdown');
    }
    
    // Hide the availability display since we're showing it in the calendar
    const availabilityDisplayEl = document.getElementById('doctor-availability-display');
    if (availabilityDisplayEl) {
      availabilityDisplayEl.style.display = 'none';
    }
  }

  // Function to render doctor availability in the appointment form area
  function renderDoctorAvailabilityInForm(doctor, availabilityDisplayEl) {
    if (!availabilityDisplayEl) {
      console.error('❌ Availability display element not found');
      return;
    }

    console.log('🔍 Rendering availability for:', doctor.name);
    console.log('🔍 Raw schedule data:', doctor.schedule);

    const schedule = Array.isArray(doctor.schedule) ? doctor.schedule : [];
    
    // Check if it's old format schedule
    const isOldFormat = doctor.schedule && typeof doctor.schedule === 'object' && !Array.isArray(doctor.schedule);
    
    if (schedule.length === 0 && !isOldFormat) {
      availabilityDisplayEl.innerHTML = `
        <div class="availability-display">
          <h6 class="text-primary mb-3">📅 Doctor Availability</h6>
          <div class="alert alert-info">
            <i class="bi bi-info-circle me-2"></i>
            No specific availability set by doctor. Please contact the doctor directly or select a date to check availability.
          </div>
        </div>`;
      return;
    }

    // Handle old format schedule
    if (isOldFormat) {
      console.log('🔍 Detected old format schedule');
      renderOldFormatAvailability(doctor, availabilityDisplayEl);
      return;
    }

    // Group slots by date and day
    const slotsByDate = {};
    const slotsByDay = {};
    
    schedule.forEach(slot => {
      if (slot.date) {
        // Specific date slot
        if (!slotsByDate[slot.date]) slotsByDate[slot.date] = [];
        slotsByDate[slot.date].push(slot);
      } else if (slot.day) {
        // Recurring day slot
        if (!slotsByDay[slot.day]) slotsByDay[slot.day] = [];
        slotsByDay[slot.day].push(slot);
      }
    });
    
    let html = '<div class="availability-display">';
    html += '<h6 class="text-primary mb-3"> Doctor Availability</h6>';
    
    // Show specific date slots first
    const sortedDates = Object.keys(slotsByDate).sort();
    if (sortedDates.length > 0) {
      html += '<div class="mb-3">';
      html += '<strong class="text-primary">Specific Available Dates:</strong>';
      html += '<div class="row g-2 mt-1">';
      
      sortedDates.forEach(date => {
        const slots = slotsByDate[date];
        const dateObj = new Date(date + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        });
        
        html += `<div class="col-12 col-md-6">
          <div class="card border-primary mb-2">
            <div class="card-header bg-primary text-white py-1">
              <small class="fw-semibold">${dateStr}</small>
            </div>
            <div class="card-body p-2">`;
        
        slots.forEach(slot => {
          html += `<span class="badge bg-success me-1 mb-1">${slot.time}</span>`;
        });
        
        html += '</div></div></div>';
      });
      html += '</div></div>';
    }
    
    // Show recurring day slots
    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const availableDays = dayOrder.filter(day => slotsByDay[day]);
    
    if (availableDays.length > 0) {
      html += '<div class="mb-3">';
      html += '<strong class="text-info">Weekly Availability:</strong>';
      html += '<div class="row g-2 mt-1">';
      
      availableDays.forEach(day => {
        const slots = slotsByDay[day];
        html += `<div class="col-12 col-md-6">
          <div class="card border-info mb-2">
            <div class="card-header bg-info text-white py-1">
              <small class="fw-semibold">${day}days</small>
            </div>
            <div class="card-body p-2">`;
        
        slots.forEach(slot => {
          html += `<span class="badge bg-info me-1 mb-1">${slot.time}</span>`;
        });
        
        html += '</div></div></div>';
      });
      html += '</div></div>';
    }
    
    if (sortedDates.length === 0 && availableDays.length === 0) {
      html += '<div class="text-muted">No availability scheduled yet.</div>';
    }
    
    html += '</div>';
    
    availabilityDisplayEl.innerHTML = html;
  }

  // Function to render new format availability (array of date/time slots)
  function renderNewFormatAvailability(doctor, availabilityDisplayEl) {
    if (!availabilityDisplayEl) {
      console.error('❌ Availability display element not found');
      return;
    }

    const schedule = Array.isArray(doctor.schedule) ? doctor.schedule : [];
    
    // Group slots by date and day
    const slotsByDate = {};
    const slotsByDay = {};
    
    schedule.forEach(slot => {
      if (slot.date) {
        // Specific date slot
        if (!slotsByDate[slot.date]) slotsByDate[slot.date] = [];
        slotsByDate[slot.date].push(slot);
      } else if (slot.day) {
        // Recurring day slot
        if (!slotsByDay[slot.day]) slotsByDay[slot.day] = [];
        slotsByDay[slot.day].push(slot);
      }
    });
    
    let html = '';
    
    // Show specific date slots first
    const sortedDates = Object.keys(slotsByDate).sort();
    if (sortedDates.length > 0) {
      html += '<ul class="list-unstyled mb-2">';
      
      sortedDates.forEach(date => {
        const slots = slotsByDate[date];
        const dateObj = new Date(date + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('en-US', { 
          weekday: 'long', 
          month: 'long', 
          day: 'numeric',
          year: 'numeric'
        });
        
        html += `<li class="mb-2">
          <strong>${dateStr}</strong><br>
          <span class="text-muted ms-3">`;
        
        slots.forEach((slot, index) => {
          html += slot.time;
          if (index < slots.length - 1) html += ', ';
        });
        
        html += '</span></li>';
      });
      html += '</ul>';
    }
    
    // Show recurring day slots
    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const availableDays = dayOrder.filter(day => slotsByDay[day]);
    
    if (availableDays.length > 0) {
      if (sortedDates.length > 0) {
        html += '<hr class="my-3">';
        html += '<p class="text-muted mb-2"><small>Weekly Recurring:</small></p>';
      }
      html += '<ul class="list-unstyled mb-0">';
      
      availableDays.forEach(day => {
        const slots = slotsByDay[day];
        const fullDayName = {
          'Mon': 'Monday',
          'Tue': 'Tuesday', 
          'Wed': 'Wednesday',
          'Thu': 'Thursday',
          'Fri': 'Friday',
          'Sat': 'Saturday',
          'Sun': 'Sunday'
        }[day];
        
        html += `<li class="mb-2">
          <strong>${fullDayName}</strong><br>
          <span class="text-muted ms-3">`;
        
        slots.forEach((slot, index) => {
          html += slot.time;
          if (index < slots.length - 1) html += ', ';
        });
        
        html += '</span></li>';
      });
      html += '</ul>';
    }
    
    if (sortedDates.length === 0 && availableDays.length === 0) {
      html += '<p class="text-muted"><i class="bi bi-info-circle me-2"></i>No availability scheduled yet.</p>';
    }
    
    availabilityDisplayEl.innerHTML = html;
  }

  // Function to render old format availability
  function renderOldFormatAvailability(doctor, availabilityDisplayEl) {
    const sched = doctor.schedule || {};
    const byDay = sched.byDay || {};
    const working = getWorkingDays(doctor);
    
    let html = '<div class="availability-display">';
    html += '<h6 class="text-primary mb-3">📅 Doctor Availability</h6>';
    
    if ((!working || working.length === 0) && (!byDay || Object.keys(byDay).length === 0)) {
      html += `<div class="alert alert-info">
        <i class="bi bi-info-circle me-2"></i>
        No specific availability set by doctor. Please select a date to check availability.
      </div>`;
    } else {
      html += '<div class="mb-3">';
      html += '<strong class="text-info">General Availability:</strong>';
      html += '<div class="row g-2 mt-1">';
      
      const daysToRender = byDay && Object.keys(byDay).length
        ? Array.from(new Set(Object.keys(byDay)
            .map(k => (Number.isInteger(+k) ? +k : DAY_NAME_TO_INDEX[String(k).toLowerCase()]))
            .filter(v => typeof v === 'number'))).sort((a,b) => a-b)
        : working;

      if (daysToRender && daysToRender.length > 0) {
        daysToRender.forEach(i => {
          const dConf = byDay[i] || null;
          let range = '';
          if (dConf && (dConf.startHour || dConf.endHour)) {
            const sMin = parseHHMM(dConf.startHour);
            const eMin = parseHHMM(dConf.endHour);
            range = `${sMin != null ? to12h(sMin) : ''}${sMin != null && eMin != null ? ' - ' : ''}${eMin != null ? to12h(eMin) : ''}`;
          } else if (sched.startHour && sched.endHour) {
            const sMin = parseHHMM(sched.startHour);
            const eMin = parseHHMM(sched.endHour);
            range = `${to12h(sMin)} - ${to12h(eMin)}`;
          }
          
          html += `<div class="col-12 col-md-6">
            <div class="card border-info mb-2">
              <div class="card-header bg-info text-white py-1">
                <small class="fw-semibold">${DAY_NAMES[i]}</small>
              </div>
              <div class="card-body p-2">
                <span class="badge bg-info">${range || 'Available'}</span>
              </div>
            </div>
          </div>`;
        });
      }
      html += '</div></div>';
    }
    
    html += '</div>';
    
    availabilityDisplayEl.innerHTML = html;
  }

  // Make functions globally available
  window.showDoctorProfileModal = showDoctorProfileModal;
  window.fillPatientInfoInForm = fillPatientInfoInForm;
  window.selectDoctorWithAvailability = selectDoctorWithAvailability;
  window.populateTimesForDate = populateTimesForDate;
  
  // Expose db globally for time population
  window.db = db;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();