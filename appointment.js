(function () {
  'use strict';

  const READY_TIMEOUT_MS = 10000;

  function parse12hToDate(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    const d = new Date(`${dateStr}T00:00:00`);
    d.setHours(h, min, 0, 0);
    return d;
  }

  function waitUntil(checkFn, { timeoutMs = READY_TIMEOUT_MS, intervalMs = 50 } = {}) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      (function poll() {
        try { if (checkFn()) return resolve(true); } catch (_) {}
        if (Date.now() - start >= timeoutMs) return reject(new Error('timeout'));
        setTimeout(poll, intervalMs);
      })();
    });
  }

  async function bootstrap() {
    console.log(' [appointment.js] Bootstrap starting...');
    const form = document.getElementById('appointment-form');
    if (!form) {
      console.warn('[appointment.js] Form not found');
      return;
    }

    let auth = null;
    let db = null;
    try {
      await waitUntil(() => window.firebase && firebase.apps && firebase.apps.length > 0);
      auth = firebase.auth();
      db = firebase.firestore();
      console.log(' [appointment.js] Firebase initialized');
    } catch (e) {
      console.error('[appointment.js] Firebase init failed:', e);
      form.addEventListener('submit', (e2) => {
        e2.preventDefault();
        alert('App is still initializing. Please refresh and try again.');
      }, { once: true });
      return;
    }

    const urlDoctorId = new URL(window.location.href).searchParams.get('doctorId');

    function setLoading(form, on) {
      const loadingEl = form.querySelector('.loading');
      const submitBtn = form.querySelector('button[type="submit"]');
      if (loadingEl) loadingEl.style.display = on ? '' : 'none';
      if (submitBtn) submitBtn.disabled = !!on;
    }

    function showToast(message, type = 'success') {
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
        const bgClass = (type === 'danger' || type === 'error') ? 'text-bg-danger bg-danger text-white' : 'text-bg-success bg-success text-white';
        toast.className = `toast align-items-center ${bgClass} border-0`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
          <div class="d-flex">
            <div class="toast-body">${message || ''}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
          </div>
        `;
        container.appendChild(toast);
        if (hasBootstrap) {
          const t = new window.bootstrap.Toast(toast, { delay: 4000 });
          t.show();
          toast.addEventListener('hidden.bs.toast', () => toast.remove());
        }
      } catch (_) { try { alert(message); } catch (_) {} }
    }

    async function resolvePatientFullName(user, db) {
      try {
        const uDoc = await db.collection('users').doc(user.uid).get();
        if (uDoc.exists) {
          const u = uDoc.data() || {};
          const first = (u.firstName || u.givenName || '').toString().trim();
          const last = (u.lastName || u.familyName || '').toString().trim();
          const composed = (first || last) ? `${first} ${last}`.trim() : '';
          if (composed) return composed;
          if (u.fullName && String(u.fullName).trim()) return String(u.fullName).trim();
        }
      } catch (_) {}
      return (user.displayName && user.displayName.trim()) || '';
    }

    function showError(form, msg) {
      const errorEl = form.querySelector('.error-message');
      if (errorEl) { errorEl.textContent = msg || 'Something went wrong.'; errorEl.style.display = ''; }
      showToast(msg || 'Something went wrong.', 'danger');
    }

    function showSuccess(form, msg) {
      const sentEl = form.querySelector('.sent-message');
      if (sentEl) { sentEl.textContent = msg || 'Your appointment request has been sent successfully.'; sentEl.style.display = ''; }
      showToast(msg || 'Your appointment request has been sent successfully.', 'success');
    }

    function resetAlerts(form) {
      const errorEl = form.querySelector('.error-message');
      const sentEl = form.querySelector('.sent-message');
      if (errorEl) errorEl.textContent = '';
      if (sentEl) sentEl.style.display = 'none';
    }

    // Confirmation modal
    let confirmModal = null;
    let confirmNameEl, confirmEmailEl, confirmPhoneEl, confirmDoctorEl, confirmDateEl, confirmTimeEl;
    let confirmDeptRow, confirmDeptEl, confirmReasonRow, confirmReasonEl, confirmBtn;
    try {
      const modalEl = document.getElementById('confirmAppointmentModal');
      if (modalEl && window.bootstrap && window.bootstrap.Modal) {
        confirmModal = new window.bootstrap.Modal(modalEl);
      }
      confirmNameEl = document.getElementById('confirmName');
      confirmEmailEl = document.getElementById('confirmEmail');
      confirmPhoneEl = document.getElementById('confirmPhone');
      confirmDoctorEl = document.getElementById('confirmDoctor');
      confirmDateEl = document.getElementById('confirmDate');
      confirmTimeEl = document.getElementById('confirmTime');
      confirmDeptRow = document.getElementById('confirmDepartmentRow');
      confirmDeptEl = document.getElementById('confirmDepartment');
      confirmReasonRow = document.getElementById('confirmReasonRow');
      confirmReasonEl = document.getElementById('confirmReason');
      confirmBtn = document.getElementById('confirmAppointmentProceed');
    } catch(_) {}

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('  Form submitted, __apptConfirmGo:', window.__apptConfirmGo);
      
      // Show confirmation modal if not confirmed yet
      if (confirmModal && !window.__apptConfirmGo) {
        const dateInput = document.getElementById('date');
        const timeSelect = document.getElementById('time');
        const doctorNameInput = document.getElementById('doctor');
        const nameField = form.querySelector('[name="name"]') || document.getElementById('patientName');
        const emailField = form.querySelector('[name="email"]') || document.getElementById('patientEmail');
        const phoneField = form.querySelector('[name="phone"]') || document.getElementById('patientPhone');
        const deptField = form.querySelector('[name="department"], #department');
        const reasonEl = document.getElementById('reason') || form.querySelector('[name="message"], #message');

        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        // Populate modal
        if (confirmNameEl) confirmNameEl.textContent = (nameField?.value || '').trim();
        if (confirmEmailEl) confirmEmailEl.textContent = (emailField?.value || '').trim();
        if (confirmPhoneEl) confirmPhoneEl.textContent = (phoneField?.value || '').trim();
        if (confirmDoctorEl) {
          const doctorValue = (doctorNameInput?.value || '').trim() || window.__selectedDoctorName || '';
          confirmDoctorEl.textContent = doctorValue;
          console.log('  Modal doctor:', doctorValue);
        }
        if (confirmDateEl) confirmDateEl.textContent = (dateInput?.value || '').trim();
        if (confirmTimeEl) confirmTimeEl.textContent = (timeSelect?.value || '').trim();
        const deptVal = (deptField?.value || '').trim();
        const reasonVal = (reasonEl?.value || '').trim();
        if (confirmDeptRow) confirmDeptRow.classList.toggle('d-none', !deptVal);
        if (confirmDeptEl) confirmDeptEl.textContent = deptVal;
        if (confirmReasonRow) confirmReasonRow.classList.toggle('d-none', !reasonVal);
        if (confirmReasonEl) confirmReasonEl.textContent = reasonVal;

        // Wire confirm button
        if (confirmBtn) {
          const onConfirm = () => {
            console.log('  User confirmed booking');
            window.__apptConfirmGo = true;
            try { confirmModal.hide(); } catch(_) {}
            setTimeout(() => {
              try { form.requestSubmit(); } catch(_) { form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }
            }, 100);
          };
          const newBtn = confirmBtn.cloneNode(true);
          confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
          confirmBtn = newBtn;
          confirmBtn.addEventListener('click', onConfirm, { once: true });
        }
        confirmModal.show();
        return;
      }

      // Clear flag
      if (window.__apptConfirmGo) delete window.__apptConfirmGo;

      if (!auth || !db) { showError(form, 'App not ready. Please refresh and try again.'); return; }
      const user = auth.currentUser || null;
      if (!user) { window.location.replace('login.html'); return; }

      const slotInput = document.getElementById('slot');
      const dateInput = document.getElementById('date');
      const timeSelect = document.getElementById('time');
      const reasonEl = document.getElementById('reason');
      const nameField = form.querySelector('[name="name"]');
      const emailField = form.querySelector('[name="email"]');
      const phoneField = form.querySelector('[name="phone"]');
      const deptField = form.querySelector('[name="department"], #department');
      const messageField = form.querySelector('[name="message"], #message');
      const hiddenDoctorEl = document.getElementById('doctorId');
      const doctorNameInput = document.getElementById('doctor');

      resetAlerts(form);
      setLoading(form, true);

      // Use global backup for doctor
      let doctorId = urlDoctorId || (hiddenDoctorEl?.value || '').trim() || window.__selectedDoctorId || '';
      let doctorName = (doctorNameInput?.value || '').trim() || window.__selectedDoctorName || '';
      
      console.log('  Booking - Doctor ID:', doctorId);
      console.log('  Booking - Doctor Name:', doctorName);

      try {
        if (!doctorId && doctorName) {
          const snap = await db.collection('public_doctors').where('name', '==', doctorName).limit(1).get();
          if (!snap.empty) {
            doctorId = snap.docs[0].id;
            doctorName = snap.docs[0].data().name || doctorName;
          }
        }
      } catch (_) {}

      if (!doctorId) {
        setLoading(form, false);
        showError(form, 'Please select a doctor first.');
        return;
      }

      if (!doctorName) {
        try {
          const docSnap = await db.collection('public_doctors').doc(doctorId).get();
          if (docSnap.exists) doctorName = docSnap.data().name || '';
        } catch (_) {}
      }

      // Parse slot date
      let slotDate = null;
      if (slotInput && slotInput.value) {
        const d = new Date(slotInput.value);
        if (!isNaN(d.getTime())) slotDate = d;
      } else if (dateInput && timeSelect && dateInput.value && timeSelect.value) {
        slotDate = parse12hToDate(dateInput.value, timeSelect.value);
      }
      if (!slotDate || isNaN(slotDate.getTime())) {
        setLoading(form, false);
        showError(form, 'Please select a valid date and time.');
        return;
      }

      const slotTS = firebase.firestore.Timestamp.fromDate(slotDate);
      const docId = `${doctorId}_${slotDate.getTime()}`;
      const apptRef = db.collection('appointments').doc(docId);
      const patientFullName = (await resolvePatientFullName(user, db)) || user.email || 'Patient';

      const formName = nameField ? (nameField.value || '').trim() : '';
      const patientEmail = emailField ? (emailField.value || '').trim() : (user.email || '');
      const patientPhone = phoneField ? (phoneField.value || '').trim() : '';
      const department = deptField ? (deptField.value || '').trim() : '';
      const messageVal = messageField ? (messageField.value || '').trim() : (reasonEl ? (reasonEl.value || '').trim() : '');
      const finalPatientName = formName || patientFullName;

      const appointmentData = {
        doctorId,
        doctorName: doctorName || '',
        patientId: user.uid,
        patientName: finalPatientName,
        patientEmail,
        patientPhone,
        department,
        startAt: slotTS,
        status: 'pending',
        reason: messageVal,
        message: messageVal,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(apptRef);
          if (snap.exists) throw new Error('That time is already booked. Please choose another slot.');
          tx.set(apptRef, appointmentData);
        });

        // Create notification for doctor
        try {
          const prettyDate = slotDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const prettyTime = slotDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          const notificationMessage = `${finalPatientName} booked an appointment on ${prettyDate} at ${prettyTime}`;
          await db.collection('notifications').add({
            type: 'appointment_booked',
            doctorId,
            patientId: user.uid,
            patientName: finalPatientName,
            appointmentId: docId,
            appointmentDate: slotTS,
            message: notificationMessage,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          console.log('  Doctor notification created');
        } catch (notifErr) {
          console.error('  Notification failed:', notifErr);
        }

        showSuccess(form, 'Your appointment request has been sent successfully.');
      } catch (err) {
        console.error('[appointment] booking error:', err);
        showError(form, err && err.message ? err.message : 'Failed to book appointment. Please try again.');
      } finally {
        setLoading(form, false);
      }
    });
  }

  // Prevent multiple bootstrap calls
  if (window.__appointmentJsInitialized) {
    console.log('[appointment.js] Already initialized, skipping duplicate bootstrap');
    return;
  }
  window.__appointmentJsInitialized = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();