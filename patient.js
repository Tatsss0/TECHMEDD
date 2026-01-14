(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const FieldValue = firebase.firestore.FieldValue;
  let currentUser;
  let unsubscribePatients = null;
  let unsubscribePatients2 = null;

  let latestPatients = [];

  function toast(message, type='dark'){
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

  function guardAuth(){
    console.log('PATIENT.JS: Starting guardAuth, auth instance:', !!auth);
    auth.onAuthStateChanged(async (user)=>{
      console.log('PATIENT.JS: Auth state changed, user:', user ? user.uid : 'null');
      if (!user) { 
        console.log('PATIENT.JS: No user detected, WOULD redirect to login (DISABLED FOR DEBUGGING)');
        // TEMPORARILY DISABLED: window.location.href = './login.html'; 
        return; 
      }
      
      // Doctor-only guard - check multiple locations
      try {
        
        const [userDoc, doctorDoc, newDoctorDoc] = await Promise.all([
          db.collection('users').doc(user.uid).get(),
          db.collection('doctors').doc(user.uid).get(),
          db.collection('users').doc('doctors').collection('doctors').doc(user.uid).get()
        ]);
        
        console.log('Auth check results:', {
          userExists: userDoc.exists,
          userRole: userDoc.exists ? userDoc.data().role : null,
          doctorExists: doctorDoc.exists,
          newDoctorExists: newDoctorDoc.exists
        });
        
        const role = userDoc.exists ? userDoc.data().role : null;
        const isDoctor = role === 'doctor' || doctorDoc.exists || newDoctorDoc.exists;
        
        console.log('Is doctor?', isDoctor);
        
        if (!isDoctor) {
          console.log('User is not a doctor, signing out');
          await auth.signOut().catch(()=>{});
          window.location.href = './login.html';
          return;
        }
        
        console.log('Doctor authentication successful');
        
        currentUser = user;
        $('#logoutBtn')?.addEventListener('click', async ()=>{ await auth.signOut(); window.location.href='./login.html'; });
        
        // Load doctor profile to display name in header
        await loadProfile(user.uid);
        
        wire();
        listenPatients();
      } catch (error) {
        console.error('Auth check failed:', error);
        await auth.signOut().catch(()=>{});
        window.location.href = './login.html';
        return;
      }
    });
  }

  async function loadProfile(uid) {
    try {
      // Try new structure first
      let doctorDoc = await db.collection('users').doc('doctors').collection('doctors').doc(uid).get();
      if (!doctorDoc.exists) {
        // Fallback to old structure
        doctorDoc = await db.collection('doctors').doc(uid).get();
      }
      
      const p = doctorDoc.exists ? doctorDoc.data() : {};
      const displayName = p.fullName ? (p.fullName.toLowerCase().startsWith('dr.') ? p.fullName : `Dr. ${p.fullName}`) : (auth.currentUser?.displayName || 'Doctor');
      
      // Update header dropdown with doctor's name
      const headerUserNameEl = $('#headerUserName');
      if (headerUserNameEl) {
        headerUserNameEl.textContent = displayName;
      }
      
      console.log('✅ Profile loaded for header:', displayName);
    } catch (error) {
      console.warn('Failed to load doctor profile:', error);
      // Keep default "Doctor" text if loading fails
    }
  }

  function wire(){
    $('#patient-search')?.addEventListener('input', (e)=> renderPatients(filterPatients(e.target.value)));
    $('#addConsultBtn')?.addEventListener('click', ()=>{
      $('#consultForm')?.reset();
      const nowLocal = new Date(Date.now() - (new Date()).getTimezoneOffset()*60000).toISOString().slice(0,16);
      if ($('#cDate')) $('#cDate').value = nowLocal;
      new bootstrap.Modal($('#addConsultModal')).show();
    });
    $('#consultForm')?.addEventListener('submit', saveConsultation);
  }

  function filterPatients(query){
    const q = (query || '').toLowerCase();
    if (!q) return latestPatients;
    return latestPatients.filter(p =>
      (p.fullName||'').toLowerCase().includes(q) ||
      (p.email||'').toLowerCase().includes(q) ||
      (p.phone||'').toLowerCase().includes(q)
    );
  }

  function renderPatients(list){
    const container = $('#patients-list');
    if (!container) return;
    if (!list || !list.length) { container.innerHTML = '<div class="list-group-item">No patients yet</div>'; return; }
    container.innerHTML = list.map(p => `
      <div class="list-group-item d-flex justify-content-between align-items-center" ${p.userUid ? `data-user-uid="${p.userUid}"` : ''}>
        <div>
          <strong>${p.fullName || 'Patient'}</strong> <span class="text-muted email-slot">${p.email ? '('+p.email+')' : ''}</span><br>
          <small class="text-muted phone-slot">${p.phone || ''}</small>
        </div>
        <button class="btn btn-sm btn-primary" data-view="${p.id}">View Records</button>
      </div>
    `).join('');
    $$('[data-view]').forEach(btn => btn.addEventListener('click', ()=> openPatient(btn.getAttribute('data-view'))));

    // Enrich rows with users/{uid} using either patients doc id or data-user-uid
    $$('[data-view]').forEach(async btn => {
      const pid = btn.getAttribute('data-view');
      const row = btn.closest('.list-group-item');
      const userUidAttr = row?.getAttribute('data-user-uid');
      const lookupUid = userUidAttr || pid;
      try {
        const u = await db.collection('users').doc(lookupUid).get();
        if (u && u.exists) {
          const data = u.data();
          const emailTxt = data.email || '';
          const phoneTxt = data.phone || data.phoneNumber || '';
          if (emailTxt) {
            const emailSpan = row.querySelector('.email-slot');
            if (emailSpan) emailSpan.textContent = '(' + emailTxt + ')';
          }
          if (phoneTxt) {
            const phoneSpan = row.querySelector('.phone-slot');
            if (phoneSpan) phoneSpan.textContent = phoneTxt;
          }
        }
      } catch {}
    });
  }

  function listenPatients(){
    console.log('🔍 Setting up patient listeners for doctor:', currentUser.uid);
    
    if (unsubscribePatients) unsubscribePatients();
    if (unsubscribePatients2) unsubscribePatients2();

    // Query from correct subcollection path: users/patients/patients
    const q1 = db.collection('users').doc('patients').collection('patients').where('doctorIds', 'array-contains', currentUser.uid);
    const q2 = db.collection('users').doc('patients').collection('patients').where('doctorId', '==', currentUser.uid);

    const updateFromSnaps = (snap1, snap2) => {
      const a = snap1 ? snap1.docs.map(d => ({ id: d.id, ...d.data() })) : [];
      const b = snap2 ? snap2.docs.map(d => ({ id: d.id, ...d.data() })) : [];
      
      console.log('📊 Query results:', {
        fromDoctorIds: a.length,
        fromDoctorId: b.length,
        doctorIdsPatients: a.map(p => ({ id: p.id, name: p.fullName, doctorIds: p.doctorIds })),
        doctorIdPatients: b.map(p => ({ id: p.id, name: p.fullName, doctorId: p.doctorId }))
      });
      
      const map = new Map();
      [...a, ...b].forEach(p => { map.set(p.id, p); });
      latestPatients = Array.from(map.values()).sort((x,y)=> (x.fullName||'').localeCompare(y.fullName||''));
      
      console.log('✅ Total unique patients:', latestPatients.length, latestPatients.map(p => p.fullName));
      renderPatients(latestPatients);
    };

    let last1 = null, last2 = null;

    const onErr = (label) => (err) => {
      console.warn(label, err);
      // Only show error if both listeners failed at least once
      if (!last1 && !last2) {
        $('#patients-list') && ($('#patients-list').innerHTML = '<div class="list-group-item text-danger">Failed to load patients</div>');
      }
    };

    // Listener for doctorIds array
    unsubscribePatients = q1.onSnapshot((snap)=>{
      last1 = snap;
      updateFromSnaps(last1, last2);
    }, onErr('patients doctorIds listener error'));

    // Listener for legacy doctorId field
    unsubscribePatients2 = q2.onSnapshot((snap)=>{
      last2 = snap;
      updateFromSnaps(last1, last2);
    }, onErr('patients doctorId listener error'));
  }

  async function saveConsultation(e){
    e.preventDefault();
    const name = $('#cName')?.value.trim();
    const email = $('#cEmail')?.value.trim();
    const phone = $('#cPhone')?.value.trim();
    const dateVal = $('#cDate')?.value;
    const notes = $('#cNotes')?.value.trim();
    const prescription = $('#cRx')?.value.trim();
    if (!name) { toast('Patient name is required','danger'); return; }

    try {
      // Prefer binding to users/{uid} if a user exists for this email
      let patientRef;
      if (email) {
        const userSnap = await db.collection('users').where('email','==',email).limit(1).get();
        if (userSnap && !userSnap.empty) {
          const userUid = userSnap.docs[0].id;
          patientRef = db.collection('patients').doc(userUid);
        } else {
          const pSnap = await db.collection('patients').where('email','==',email).limit(1).get();
          if (!pSnap.empty) patientRef = pSnap.docs[0].ref;
        }
      }
      patientRef = patientRef || db.collection('patients').doc();

      await patientRef.set({
        id: patientRef.id,
        fullName: name,
        email: email || null,
        phone: phone || null,
        doctorIds: FieldValue.arrayUnion(currentUser.uid),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      }, { merge: true });

      const consultRef = patientRef.collection('consultations').doc();
      const when = dateVal ? new Date(dateVal) : new Date();
      await consultRef.set({
        id: consultRef.id,
        doctorId: currentUser.uid,
        date: firebase.firestore.Timestamp.fromDate(when),
        notes: notes || '',
        prescription: prescription || '',
        createdAt: FieldValue.serverTimestamp()
      });

      toast('Consultation saved','success');
      const modalEl = $('#addConsultModal');
      if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Failed to save', 'danger');
    }
  }

  async function openPatient(id){
    try {
      // Show modal immediately with a loading placeholder
      const modalEl = $('#patientModal');
      try {
        const inst = (bootstrap.Modal.getOrCreateInstance)
          ? bootstrap.Modal.getOrCreateInstance(modalEl)
          : new bootstrap.Modal(modalEl);
        inst.show();
      } catch (_) {
        if (modalEl) { modalEl.classList.add('show'); modalEl.style.display = 'block'; modalEl.removeAttribute('aria-hidden'); }
      }
      let host = $('#patient-records');
      if (!host) {
        const mb = document.querySelector('#patientModal .modal-body');
        if (mb) {
          mb.innerHTML = '<div id="patient-records"></div>';
          host = $('#patient-records');
        }
      }
      if (host) host.innerHTML = '<div class="text-muted">Loading patient records…</div>';
      // Use correct subcollection path
      const ref = db.collection('users').doc('patients').collection('patients').doc(id);
      const doc = await ref.get();
      let p = doc.exists ? doc.data() : { fullName: 'Patient', email: null, phone: null };
      if ((!p.email || !p.phone) && id) {
        try {
          const u = await db.collection('users').doc(id).get();
          if (u && u.exists) {
            const ud = u.data();
            p = {
              ...p,
              email: p.email || ud.email || null,
              phone: p.phone || ud.phone || ud.phoneNumber || null,
            };
          }
        } catch {}
      }
      // Prepare consultations list; tolerate permission errors
      let items = [];
      try {
        const cons = await ref.collection('consultations').orderBy('date','desc').get();
        cons.forEach(d => items.push(d.data()));
      } catch (_) { items = []; }
      let diagnoses = Array.isArray(p.diagnoses) ? p.diagnoses : [];
      if ((!diagnoses || diagnoses.length === 0) && p.email) {
        try {
          const q = await db.collection('patients')
            .where('email','==', p.email)
            .where('doctorIds','array-contains', currentUser.uid)
            .limit(1)
            .get();
          if (q && !q.empty) {
            const alt = q.docs[0].data();
            if (Array.isArray(alt.diagnoses) && alt.diagnoses.length) {
              diagnoses = alt.diagnoses;
            }
          }
        } catch {}
      }
      const getMs = (x)=>{ try{ const t=x?.createdAt; if (!t) return 0; return t.toDate? t.toDate().getTime(): new Date(t).getTime(); } catch{ return 0; } };
      const sortedDiags = Array.isArray(diagnoses) ? [...diagnoses].sort((a,b)=> getMs(b)-getMs(a)) : [];
      const latestOnly = sortedDiags.length ? [sortedDiags[0]] : [];

      // Will be set after prescriptions load
      let allRxArr = [];
      const findRxById = (rid)=> (lastRxArr.find(x=>x.id===rid) || allRxArr.find(x=>x.id===rid) || null);
      const renderDiagList = (arr, opts={})=> {
        if (!arr || !arr.length) return '<div class="text-muted">No diagnoses yet</div>';
        return arr.map(d => {
          const who = d.doctorName || 'Doctor';
          const whenTxt = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString() : (d.createdAt ? new Date(d.createdAt).toLocaleString() : '');
          const dxText = String(d.text || '').trim();
          const safeText = dxText
            .replace(/&/g,'&amp;')
            .replace(/</g,'&lt;')
            .replace(/>/g,'&gt;')
            .replace(/\n/g,'<br>');
          // Try to match a prescription by diagnosis text
          const match = (function(){
            const dxLower = dxText.toLowerCase();
            const candidates = (allRxArr || []).filter(r => String(r.diagnosis||'').trim().toLowerCase() === dxLower);
            return candidates.length ? candidates[0] : null;
          })();
          const rxBtns = match ? (
            `<div class=\"mt-2\">`
            + `${match.pdfUrl ? `<button class=\"btn btn-sm btn-outline-primary\" data-view-rx=\"${match.id}\" ${opts.past ? 'data-view-only=\"1\"' : ''}>View Prescription</button>` : ''}`
            + `${match.pdfUrl ? ` <a class=\"btn btn-sm btn-outline-secondary\" href=\"${match.pdfUrl}\" target=\"_blank\" download>Download</a>` : ''}`
            + `</div>`
          ) : '';
          return `<div class=\"border rounded p-2 mb-2\"><div class=\"small text-muted\"><strong>${who}</strong>${whenTxt ? ` • ${whenTxt}` : ''}</div><div>${safeText}</div>${rxBtns}</div>`;
        }).join('');
      };

      try {
        // Load appointment history for this patient
        let appointmentHistory = [];
        try {
          const apptSnap = await db.collection('appointments')
            .where('patientId', '==', id)
            .orderBy('startAt', 'desc')
            .limit(50)
            .get();
          apptSnap.forEach(doc => {
            const data = doc.data();
            const startDate = data.startAt?.toDate?.() ? data.startAt.toDate() : (data.startAt ? new Date(data.startAt) : null);
            const isDone = (data.status || '').toLowerCase() === 'done' || 
                          (data.status || '').toLowerCase().includes('complet') ||
                          startDate && startDate.getTime() < Date.now();
            if (isDone) {
              appointmentHistory.push({ id: doc.id, ...data, startDate });
            }
          });
          console.log(`✅ [patient.js] Loaded ${appointmentHistory.length} past appointments for patient ${id}`);
        } catch (e) {
          console.warn('[patient.js] Failed to load appointment history:', e);
        }

        // Load patient prescriptions for appointment matching
        let patientRxList = [];
        try {
          let rxSnap = await db.collection('users').doc('patients').collection('patients').doc(id).collection('prescriptions').orderBy('createdAt','desc').limit(30).get();
          if (rxSnap.empty) {
            console.log('⚠️ [patient.js] Trying old structure for prescriptions');
            rxSnap = await db.collection('patients').doc(id).collection('prescriptions').orderBy('createdAt','desc').limit(30).get();
          }
          rxSnap && rxSnap.forEach(d => patientRxList.push(Object.assign({ id: d.id }, d.data())));
          console.log(`✅ [patient.js] Loaded ${patientRxList.length} prescriptions for patient ${id}`);
        } catch (e) { 
          console.warn('[patient.js] Failed to load prescriptions:', e);
        }

        // Prescription matching function
        const pickRxFor = (doctorUid, diagnosisText, when, appointmentId) => {
          const normalizeText = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
          const dxn = normalizeText(diagnosisText);
          const byDoc = (patientRxList || []).filter(r => (r.doctorId || r.doctorUID || r.doctorUid || '') === doctorUid);
          
          if (dxn) {
            const exact = byDoc.filter(r => normalizeText(r.diagnosis || '') === dxn);
            if (exact.length) {
              if (when) {
                const wms = when.getTime ? when.getTime() : (new Date(when).getTime() || 0);
                const getMs = (r) => {
                  try {
                    const t = r.createdAt;
                    return t && t.toDate ? t.toDate().getTime() : (t ? new Date(t).getTime() : 0);
                  } catch (_) { return 0; }
                };
                const afterAppt = exact.filter(r => {
                  const rxTime = getMs(r);
                  return rxTime >= wms && rxTime <= (wms + 24 * 60 * 60 * 1000);
                }).sort((a,b) => getMs(a) - getMs(b));
                
                if (afterAppt.length) return afterAppt[0];
                
                const beforeAppt = exact.filter(r => getMs(r) <= wms).sort((a,b) => getMs(b) - getMs(a));
                if (beforeAppt.length) return beforeAppt[0];
              }
              return exact.sort((a,b) => {
                const getMs = (r) => {
                  try {
                    const t = r.createdAt;
                    return t && t.toDate ? t.toDate().getTime() : (t ? new Date(t).getTime() : 0);
                  } catch (_) { return 0; }
                };
                return getMs(b) - getMs(a);
              })[0];
            }
          }
          
          if (byDoc.length) {
            return byDoc.sort((a,b) => {
              const getMs = (r) => {
                try {
                  const t = r.createdAt;
                  return t && t.toDate ? t.toDate().getTime() : (t ? new Date(t).getTime() : 0);
                } catch (_) { return 0; }
              };
              return getMs(b) - getMs(a);
            })[0];
          }
          
          return null;
        };

        // Get appointment diagnosis
        const getAppointmentDiagnosis = (appointment, patientDiagnoses, doctorId) => {
          if (appointment.diagnosis && (appointment.diagnosis.text || appointment.diagnosis.description)) {
            return {
              title: appointment.diagnosis.title || appointment.diagnosis.name || 'Diagnosis',
              text: appointment.diagnosis.text || appointment.diagnosis.description || ''
            };
          }
          
          if (appointment.diagnosis || appointment.diagnosisDescription || appointment.icd10 || appointment.icdCode) {
            return {
              title: appointment.diagnosisTitle || 'Diagnosis',
              text: appointment.diagnosis || appointment.diagnosisDescription || appointment.icd10 || appointment.icdCode || ''
            };
          }
          
          try {
            const startDate = appointment.startDate;
            if (!startDate) return { title: 'Diagnosis', text: '' };
            
            const rel = patientDiagnoses.filter(d => (d.doctorId || d.doctorUID || d.doctorUid || '') === doctorId);
            if (rel.length) {
              const apptTime = startDate.getTime();
              const getMs = (x)=>{ try{ const t=x?.createdAt; if(!t) return 0; return t.toDate? t.toDate().getTime(): new Date(t).getTime(); } catch { return 0; } };
              
              const nearAppt = rel.filter(d => {
                const diagTime = getMs(d);
                return Math.abs(diagTime - apptTime) <= (24 * 60 * 60 * 1000);
              }).sort((a,b) => Math.abs(getMs(a) - apptTime) - Math.abs(getMs(b) - apptTime));
              
              if (nearAppt.length) {
                const matched = nearAppt[0];
                return {
                  title: matched?.title || matched?.name || 'Diagnosis',
                  text: matched?.text || matched?.description || matched?.icd10 || matched?.icdCode || ''
                };
              } else {
                const latest = [...rel].sort((a,b)=> getMs(b)-getMs(a))[0];
                return {
                  title: latest?.title || latest?.name || 'Diagnosis',
                  text: latest?.text || latest?.description || latest?.icd10 || latest?.icdCode || ''
                };
              }
            }
          } catch {}
          
          return { title: 'Diagnosis', text: '' };
        };

        // Format prescription items
        const formatItemsText = (items) => {
          try {
            if (!Array.isArray(items) || !items.length) return '';
            return items.map(it => {
              const parts = [it.drug, it.dose, it.route, it.frequency, it.duration_days ? `${it.duration_days} days` : '', it.notes]
                .filter(Boolean).join(' — ');
              return parts || '';
            }).filter(Boolean).join('\n');
          } catch (_) { return ''; }
        };

        // Render appointment history
        const renderAppointmentHistory = () => {
          if (!appointmentHistory.length) {
            return '<div class="text-muted">No past appointments found</div>';
          }
          
          return appointmentHistory.map(appt => {
            const doctorName = appt.doctorName || [appt.doctorFirstName, appt.doctorLastName].filter(Boolean).join(' ') || 'Doctor';
            const datetime = appt.startDate ? appt.startDate.toLocaleString() : (appt.datetime || [appt.date, appt.time].filter(Boolean).join(' ') || '—');
            const specialty = appt.specialty || appt.department || appt.reason || 'Consultation';
            
            // Get diagnosis for this appointment
            const diagnosis = getAppointmentDiagnosis(appt, diagnoses, appt.doctorId || appt.doctorUID || appt.doctorUid);
            
            // Find matching prescription
            const matchedRx = pickRxFor(appt.doctorId || appt.doctorUID || appt.doctorUid, diagnosis.text, appt.startDate, appt.id);
            
            let prescriptionInfo = '';
            if (matchedRx) {
              const itemsText = formatItemsText(matchedRx.items);
              const rxText = itemsText || matchedRx.text || matchedRx.instructions || matchedRx.content || '';
              const rxTitle = matchedRx.title || matchedRx.name || 'Prescription';
              
              if (rxText) {
                prescriptionInfo = `
                  <div class="mt-2">
                    <strong class="text-success">${rxTitle}:</strong>
                    <div class="small text-muted">${rxText.substring(0, 200)}${rxText.length > 200 ? '...' : ''}</div>
                    ${matchedRx.pdfUrl ? `<a href="${matchedRx.pdfUrl}" target="_blank" class="btn btn-sm btn-outline-primary mt-1">View PDF</a>` : ''}
                  </div>
                `;
              }
            }
            
            return `
              <div class="border rounded p-3 mb-3">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <h6 class="mb-1">${specialty}</h6>
                    <div class="text-muted small">${datetime}</div>
                    <div class="small">${doctorName}</div>
                  </div>
                  <span class="badge bg-success">Completed</span>
                </div>
                ${diagnosis.text ? `
                  <div class="mt-2">
                    <strong class="text-info">Diagnosis:</strong>
                    <div class="small">${diagnosis.text}</div>
                  </div>
                ` : ''}
                ${prescriptionInfo}
              </div>
            `;
          }).join('');
        };

        const diagTabs = `
          <ul class=\"nav nav-tabs mb-2\" role=\"tablist\">
            <li class=\"nav-item\" role=\"presentation\"><button class=\"nav-link active\" id=\"rec-tab-latest\" type=\"button\">Diagnosis</button></li>
            <li class=\"nav-item\" role=\"presentation\"><button class=\"nav-link\" id=\"rec-tab-past\" type=\"button\">Past Diagnosis</button></li>
            <li class=\"nav-item\" role=\"presentation\"><button class=\"nav-link\" id=\"rec-tab-appointments\" type=\"button\">Appointment History</button></li>
          </ul>
          <div id=\"rec-diagnosis-latest\">
            ${renderDiagList(latestOnly)}
            <div class=\"mt-3 border rounded p-2\">
              <label class=\"form-label\" for=\"new-diagnosis\">Add New Diagnosis</label>
              <textarea id=\"new-diagnosis\" class=\"form-control\" rows=\"3\" placeholder=\"Enter diagnosis...\"></textarea>
              <div class=\"d-flex justify-content-end mt-2\">
                <button class=\"btn btn-primary\" id=\"save-diagnosis-btn\">Save Diagnosis</button>
              </div>
              <div class=\"small text-muted mt-1\">Saving a diagnosis will auto-generate an e-prescription PDF.</div>
            </div>
          </div>
          <div id=\"rec-diagnosis-past\" style=\"display:none\">${renderDiagList(sortedDiags, { past: true })}</div>
          <div id=\"rec-appointment-history\" style=\"display:none\">${renderAppointmentHistory()}</div>
        `;

        const host = $('#patient-records');
        if (host) host.innerHTML = `
          <h5>${p.fullName || 'Patient'} ${p.email ? '<small class=\"text-muted\">(' + p.email + ')</small>' : ''}</h5>\n          <p><strong>Phone:</strong> ${p.phone || '—'}</p>\n
          <h6 class=\"mt-3\">Patient Info</h6>\n          <div class=\"border rounded p-2\">\n            <div class=\"row g-2\">\n              <div class=\"col-sm-4\">\n                <label class=\"form-label\" for=\"p-sex\">Sex</label>\n                <select id=\"p-sex\" class=\"form-select\">\n                  <option value=\"\">—</option>\n                  <option value=\"male\" ${String(p.sex||'').toLowerCase()==='male'?'selected':''}>Male</option>\n                  <option value=\"female\" ${String(p.sex||'').toLowerCase()==='female'?'selected':''}>Female</option>\n                  <option value=\"other\" ${String(p.sex||'').toLowerCase()==='other'?'selected':''}>Other</option>\n                </select>\n              </div>\n              <div class=\"col-sm-4\">\n                <label class=\"form-label\" for=\"p-weight\">Weight (kg)</label>\n                <input id=\"p-weight\" type=\"number\" step=\"0.1\" class=\"form-control\" value=\"${p.weightKg ?? ''}\" />\n              </div>\n              <div class=\"col-sm-4\">\n                <label class=\"form-label\" for=\"p-dob\">DOB</label>\n                <input id=\"p-dob\" type=\"date\" class=\"form-control\" value=\"${(p.dob && p.dob.toDate ? p.dob.toDate().toISOString().slice(0,10) : (p.dob ? String(p.dob).slice(0,10) : ''))}\" />\n              </div>\n            </div>\n            <div class=\"form-check mt-2\">\n              <input class=\"form-check-input\" type=\"checkbox\" id=\"p-pregnant\" ${p.pregnant ? 'checked' : ''}>\n              <label class=\"form-check-label\" for=\"p-pregnant\">Pregnant</label>\n            </div>\n            <div class=\"mt-2\">\n              <label class=\"form-label\" for=\"p-allergies\">Allergies (comma-separated)</label>\n              <input id=\"p-allergies\" type=\"text\" class=\"form-control\" placeholder=\"e.g. penicillin, sulfa\" value=\"${Array.isArray(p.allergies)? p.allergies.join(', ') : ''}\" />\n            </div>\n            <div class=\"d-flex justify-content-end mt-2\">\n              <button class=\"btn btn-outline-primary\" id=\"save-patientinfo-btn\">Save Patient Info</button>\n            </div>\n          </div>\n
          <h6 class=\"mt-3\">Diagnoses</h6>\n          ${diagTabs}\n          <h6 class=\"mt-3\">Prescriptions</h6>\n          <div id=\"rx-list\" class=\"small text-muted\">No prescriptions yet</div>\n          <h6 class=\"mt-3\">Consultations</h6>\n          <ul class=\"list-group\">${items.map(c => `\n            <li class=\"list-group-item\">\n              <div><strong>${(c.date && c.date.toDate ? c.date.toDate() : new Date(c.date)).toLocaleString()}</strong></div>\n              <div class=\"text-muted\">${c.notes || '—'}</div>\n              <div><strong>Prescription:</strong> ${c.prescription || '—'}</div>\n            </li>`).join('')}\n          </ul>`;
        
        // Load prescriptions AFTER HTML is rendered
        // Removed undefined loadPrescriptions() call
      } catch (e) {
        console.error('render modal body failed', e);
        const host2 = $('#patient-records');
        if (host2) host2.innerHTML = `
          <h5>${p.fullName || 'Patient'}</h5>
          <div class="text-muted">No details available.</div>
          <h6 class="mt-3">Diagnoses</h6>
          <div class="text-muted">No diagnoses yet</div>
          <div class="mt-3 border rounded p-2">
            <label class="form-label" for="new-diagnosis">Add New Diagnosis</label>
            <textarea id="new-diagnosis" class="form-control" rows="3" placeholder="Enter diagnosis..."></textarea>
            <div class="d-flex justify-content-end mt-2">
              <button class="btn btn-primary" id="save-diagnosis-btn">Save Diagnosis</button>
            </div>
            <div class="small text-muted mt-1">Saving a diagnosis will auto-generate an e-prescription PDF.</div>
          </div>
        `;
      }

      // Safety timeout: if still showing Loading after 2s, render minimal skeleton
      setTimeout(()=>{
        const host3 = $('#patient-records');
        if (host3 && /Loading patient records/.test(host3.textContent || '')) {
          host3.innerHTML = `
            <h5>${p.fullName || 'Patient'}</h5>
            <div class=\"text-muted\">No additional details available.</div>
            <h6 class=\"mt-3\">Diagnoses</h6>
            <div class=\"text-muted\">No diagnoses yet</div>
            <div class=\"mt-3 border rounded p-2\">
              <label class=\"form-label\" for=\"new-diagnosis\">Add New Diagnosis</label>
              <textarea id=\"new-diagnosis\" class=\"form-control\" rows=\"3\" placeholder=\"Enter diagnosis...\"></textarea>
              <div class=\"d-flex justify-content-end mt-2\">
                <button class=\"btn btn-primary\" id=\"save-diagnosis-btn\">Save Diagnosis</button>
              </div>
              <div class=\"small text-muted mt-1\">Saving a diagnosis will auto-generate an e-prescription PDF.</div>
            </div>
          `;
        }
      }, 2000);
      const recTabLatest = $('#rec-tab-latest');
      const recTabPast = $('#rec-tab-past');
      const recTabAppointments = $('#rec-tab-appointments');
      const recLatestEl = $('#rec-diagnosis-latest');
      const recPastEl = $('#rec-diagnosis-past');
      const recAppointmentsEl = $('#rec-appointment-history');
      
      // Tab switching logic
      const showTab = (activeTab, activeContent) => {
        // Remove active class from all tabs
        [recTabLatest, recTabPast, recTabAppointments].forEach(tab => tab?.classList.remove('active'));
        // Hide all content
        [recLatestEl, recPastEl, recAppointmentsEl].forEach(content => { if (content) content.style.display = 'none'; });
        // Show active tab and content
        activeTab?.classList.add('active');
        if (activeContent) activeContent.style.display = '';
      };
      
      recTabLatest?.addEventListener('click', () => showTab(recTabLatest, recLatestEl));
      recTabPast?.addEventListener('click', () => showTab(recTabPast, recPastEl));
      recTabAppointments?.addEventListener('click', () => showTab(recTabAppointments, recAppointmentsEl));

      // Save patient info handler
      const spBtn = $('#save-patientinfo-btn');
      spBtn?.addEventListener('click', async ()=>{
        try {
          const sex = ($('#p-sex')?.value || '').trim().toLowerCase();
          const pregnant = !!$('#p-pregnant')?.checked;
          const weightVal = $('#p-weight')?.value;
          const weightKg = weightVal === '' ? null : Number(weightVal);
          let dobStr = ($('#p-dob')?.value || '').trim();
          if (dobStr && !/^\d{4}-\d{2}-\d{2}$/.test(dobStr)) dobStr = '';
          const allergiesStr = ($('#p-allergies')?.value || '').trim();
          const allergies = allergiesStr ? allergiesStr.split(',').map(s=>s.trim()).filter(Boolean) : [];

          const payload = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
          if (sex) payload.sex = sex; else payload.sex = firebase.firestore.FieldValue.delete?.() || null;
          payload.pregnant = pregnant;
          if (weightKg != null && !Number.isNaN(weightKg)) payload.weightKg = weightKg; else payload.weightKg = firebase.firestore.FieldValue.delete?.() || null;
          if (dobStr) payload.dob = dobStr; else payload.dob = firebase.firestore.FieldValue.delete?.() || null;
          payload.allergies = allergies;

          // Use correct subcollection path: users/patients/patients/{id}
          await db.collection('users').doc('patients').collection('patients').doc(id).set(payload, { merge: true });
          toast('Patient info saved','success');
        } catch (e) {
          console.error(e);
          toast('Failed to save patient info','danger');
        }
      });


      // Load prescriptions list into the modal (tolerate permission errors)
      const rxListEl = $('#rx-list');
      console.log('🔍 Prescription element found:', !!rxListEl, 'Patient ID:', id);
      let lastRxArr = [];
      let unsubscribeRx = null;
      const renderRx = (arr)=>{
        console.log('📋 Rendering prescriptions:', arr.length, 'items');
        if (!rxListEl) { console.warn('⚠️ rxListEl not found!'); return; }
        if (!Array.isArray(arr) || !arr.length) { rxListEl.textContent = 'No prescriptions yet'; return; }
        lastRxArr = arr;
        rxListEl.innerHTML = arr.map(r => {
          const ts = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : (r.createdAt ? new Date(r.createdAt).toLocaleString() : '');
          const items = Array.isArray(r.items) ? r.items : [];
          const first = items[0];
          const summary = first ? `${first.drug}${first.dose ? ' — ' + first.dose : ''}${items.length>1 ? ` (+${items.length-1} more)` : ''}` : '(no items)';
          const url = r.pdfUrl || '';
          const btns = `
            ${url ? `<button class=\"btn btn-sm btn-primary\" data-view-rx=\"${r.id}\">View Prescription</button>` : ''}
            ${url ? ` <a class=\"btn btn-sm btn-outline-secondary\" href=\"${url}\" target=\"_blank\" download>Download</a>` : ''}
          `;
          return `<div class=\"border rounded p-2 mb-2\"><div class=\"d-flex justify-content-between align-items-center\"><div><div class=\"small text-muted\">${ts || ''}</div><div>${summary}</div></div><div>${btns}</div></div>`;
        }).join('');
      };
      try {
        const rxPath = `users/patients/patients/${id}/prescriptions`;
        console.log('🔍 [patient.js] Setting up real-time prescription listener for:', rxPath);
        // Use real-time listener instead of one-time get
        if (unsubscribeRx) { try { unsubscribeRx(); } catch(_){} }
        unsubscribeRx = db.collection('users').doc('patients').collection('patients').doc(id)
          .collection('prescriptions')
          .orderBy('createdAt','desc')
          .limit(1)
          .onSnapshot((snap) => {
            const arr = [];
            snap && snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
            console.log('✅ [patient.js] Prescriptions real-time update:', arr);
            renderRx(arr);
          }, (err) => {
            console.error('❌ Error in prescription listener:', err); 
            renderRx([]); 
          });
      } catch (err) { 
        console.error('❌ Error setting up prescription listener:', err); 
        renderRx([]); 
      }
      // Load recent prescriptions for mapping to past diagnoses (limit 10)
      try {
        const snapAll = await db.collection('users').doc('patients').collection('patients').doc(id).collection('prescriptions').orderBy('createdAt','desc').limit(10).get();
        const temp = [];
        snapAll && snapAll.forEach(d => temp.push({ id: d.id, ...d.data() }));
        allRxArr = temp;
        // Re-render past diagnoses tab with prescription buttons
        const recPastEl2 = $('#rec-diagnosis-past');
        if (recPastEl2) recPastEl2.innerHTML = renderDiagList(sortedDiags, { past: true });
      } catch (_) { /* ignore */ }

      // Editor modal (created on demand)
      function ensureRxEditorModal(){
        let el = document.getElementById('rxEditorModal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'rxEditorModal';
        el.className = 'modal fade';
        el.tabIndex = -1;
        el.innerHTML = `
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">Prescription Editor</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <div id="rx-edit-body"></div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-primary" id="rx-save-btn">Save Changes</button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(el);
        return el;
      }

      function renderEditorContent(rx){
        const items = Array.isArray(rx.items) ? rx.items : [];
        const rows = items.map((it, i)=>`
          <tr data-row-index="${i}">
            <td><input class="form-control form-control-sm" value="${it.drug||''}"/></td>
            <td><input class="form-control form-control-sm" value="${it.dose||''}"/></td>
            <td><input class="form-control form-control-sm" value="${it.route||''}"/></td>
            <td><input class="form-control form-control-sm" value="${it.frequency||''}"/></td>
            <td style="width:120px"><input class="form-control form-control-sm" type="number" value="${it.duration_days||''}"/></td>
            <td><input class="form-control form-control-sm" value="${it.notes||''}"/></td>
            <td><button class="btn btn-sm btn-outline-danger" data-remove-row>×</button></td>
          </tr>`).join('');
        return `
          <div class="mb-2"><strong>Diagnosis:</strong> ${rx.diagnosis || ''}</div>
          <div class="table-responsive">
            <table class="table table-sm">
              <thead><tr><th>Drug</th><th>Dose</th><th>Route</th><th>Frequency</th><th>Days</th><th>Notes</th><th></th></tr></thead>
              <tbody id="rx-edit-rows">${rows}</tbody>
            </table>
          </div>
          <button class="btn btn-sm btn-outline-primary" id="rx-add-row">Add Item</button>`;
      }

      function openRxEditor(rx){
        const modalEl = ensureRxEditorModal();
        const body = modalEl.querySelector('#rx-edit-body');
        body.innerHTML = renderEditorContent(rx);
        const addBtn = modalEl.querySelector('#rx-add-row');
        addBtn.addEventListener('click', ()=>{
          const tbody = modalEl.querySelector('#rx-edit-rows');
          const tr = document.createElement('tr');
          tr.innerHTML = `<td><input class="form-control form-control-sm"/></td><td><input class="form-control form-control-sm"/></td><td><input class="form-control form-control-sm"/></td><td><input class="form-control form-control-sm"/></td><td style="width:120px"><input class="form-control form-control-sm" type="number"/></td><td><input class="form-control form-control-sm"/></td><td><button class="btn btn-sm btn-outline-danger" data-remove-row>×</button></td>`;
          tbody.appendChild(tr);
        });
        body.addEventListener('click', (e)=>{
          const btn = e.target.closest('[data-remove-row]');
          if (btn) btn.closest('tr')?.remove();
        });
        const saveBtn = modalEl.querySelector('#rx-save-btn');
        saveBtn.onclick = async ()=>{
          try {
            const rows = Array.from(modalEl.querySelectorAll('#rx-edit-rows tr'));
            const items = rows.map(rw=>{
              const [drug,dose,route,frequency,days,notes] = Array.from(rw.querySelectorAll('input')).map(i=>i.value.trim());
              const dnum = days === '' ? '' : Number(days);
              return { drug, dose, route, frequency, duration_days: dnum, notes };
            }).filter(x=>x.drug);
            const refRx = db.collection('users').doc('patients').collection('patients').doc(id).collection('prescriptions').doc(rx.id);
            const prevUrl = rx.pdfUrl || null;
            await refRx.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            toast('Prescription saved. Generating PDF...','success');
            bootstrap.Modal.getOrCreateInstance(modalEl).hide();
            // Watch for pdfUrl then open
            const unsub = refRx.onSnapshot(s=>{
              const d = s.data();
              if (d && d.pdfUrl && d.pdfUrl !== prevUrl) { window.open(d.pdfUrl, '_blank'); try{unsub();}catch(_){} }
            });
            // Refresh list
            const snap = await db.collection('users').doc('patients').collection('patients').doc(id).collection('prescriptions').orderBy('createdAt','desc').limit(1).get();
            const arr2 = []; snap && snap.forEach(d => arr2.push({ id: d.id, ...d.data() }));
            renderRx(arr2);
          } catch (e) {
            console.error(e); toast('Failed to save prescription','danger');
          }
        };
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }

      function ensureRxViewerModal(){
        let el = document.getElementById('rxViewerModal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'rxViewerModal';
        el.className = 'modal fade';
        el.tabIndex = -1;
        el.innerHTML = `
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">Prescription</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <div id="rx-viewer-editor"></div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-primary" id="rx-viewer-save">Save Changes</button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(el);
        return el;
      }

      function openRxViewer(rx, opts={}){
        const modalEl = ensureRxViewerModal();
        const editorHost = modalEl.querySelector('#rx-viewer-editor');
        editorHost.innerHTML = renderEditorContent(rx);
        const saveBtn = modalEl.querySelector('#rx-viewer-save');
        if (opts.viewOnly) {
          editorHost.querySelectorAll('input').forEach(i=> i.setAttribute('disabled','disabled'));
          saveBtn.style.display = 'none';
        } else {
          saveBtn.style.display = '';
          saveBtn.onclick = async ()=>{
            try {
              const rows = Array.from(editorHost.querySelectorAll('#rx-edit-rows tr'));
              const items = rows.map(rw=>{
                const [drug,dose,route,frequency,days,notes] = Array.from(rw.querySelectorAll('input')).map(i=>i.value.trim());
                const dnum = days === '' ? '' : Number(days);
                return { drug, dose, route, frequency, duration_days: dnum, notes };
              }).filter(x=>x.drug);
              const refRx = db.collection('users').doc('patients').collection('patients').doc(id).collection('prescriptions').doc(rx.id);
              await refRx.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
              toast('Prescription saved. Regenerating PDF...','success');
            } catch (e) {
              console.error(e); toast('Failed to save prescription','danger');
            }
          };
        }
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }

      // Delegate View Prescription from Prescriptions list
      rxListEl?.addEventListener('click', (e)=>{
        const viewBtn = e.target.closest('[data-view-rx]');
        if (viewBtn) {
          const rid = viewBtn.getAttribute('data-view-rx');
          const rx = findRxById(rid);
          if (rx) openRxViewer(rx, { viewOnly: false });
        }
      });

      // Delegate View Prescription from Past Diagnosis section (view-only)
      $('#patient-records')?.addEventListener('click', (e)=>{
        const viewBtn = e.target.closest('[data-view-rx]');
        if (viewBtn) {
          const rid = viewBtn.getAttribute('data-view-rx');
          const rx = findRxById(rid);
          const viewOnly = !!viewBtn.getAttribute('data-view-only');
          if (rx) openRxViewer(rx, { viewOnly });
        }
      });

      // Save diagnosis
      const saveBtn = $('#save-diagnosis-btn');
      saveBtn?.addEventListener('click', async ()=>{
        const txt = ($('#new-diagnosis')?.value || '').trim();
        if (!txt) { toast('Enter a diagnosis','danger'); return; }
        try {
          const doctorName = currentUser?.displayName || 'Doctor';
          const diag = {
            text: txt,
            doctorId: currentUser?.uid || null,
            doctorName: doctorName,
            createdAt: firebase.firestore.Timestamp.now()
          };
          // Ensure the current doctor is assigned to this patient per rules
          // Use correct subcollection path: users/patients/patients/{id}
          const patRef = db.collection('users').doc('patients').collection('patients').doc(id);
          const patSnap = await patRef.get();
          const pdata = patSnap.exists ? patSnap.data() : {};
          const hasDoctorIds = Array.isArray(pdata?.doctorIds) && pdata.doctorIds.includes(currentUser.uid);
          const hasDoctorId = pdata?.doctorId && pdata.doctorId === currentUser.uid;
          if (!hasDoctorIds && !hasDoctorId) {
            await patRef.set({
              doctorIds: FieldValue.arrayUnion(currentUser.uid),
              updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
          }
          await patRef.set({
            diagnoses: FieldValue.arrayUnion(diag),
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
          toast('Diagnosis saved. Generating e-prescription...','success');
        } catch (e) {
          console.error(e);
          toast('Failed to save diagnosis','danger');
        }
      });

      // modal already shown above
    } catch (err) {
      console.error(err);
      const host = $('#patient-records');
      if (host) host.innerHTML = `
        <h5>Patient</h5>
        <div class="text-danger small mb-2">Failed to load record.</div>
        <h6 class="mt-3">Diagnoses</h6>
        <div class="text-muted">No diagnoses yet</div>
        <div class="mt-3 border rounded p-2">
          <label class="form-label" for="new-diagnosis">Add New Diagnosis</label>
          <textarea id="new-diagnosis" class="form-control" rows="3" placeholder="Enter diagnosis..."></textarea>
          <div class="d-flex justify-content-end mt-2">
            <button class="btn btn-primary" id="save-diagnosis-btn">Save Diagnosis</button>
          </div>
          <div class="small text-muted mt-1">Saving a diagnosis will auto-generate an e-prescription PDF.</div>
        </div>
        <h6 class="mt-3">Prescriptions</h6>
        <div class="small text-muted">No prescriptions yet</div>
      `;
      toast('Failed to load record','danger');
    }
  }

  // start
  guardAuth();
})();