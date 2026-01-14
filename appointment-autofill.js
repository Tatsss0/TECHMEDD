/**
 * Appointment Form Auto-Fill
 * Automatically fills appointment form when clicking "Book Appointment" from directory
 */
(function() {
  'use strict';

  console.log('📝 Appointment Auto-Fill loaded');

  // Get current user data from Firestore
  async function getCurrentUserData() {
    try {
      const auth = firebase.auth();
      const db = firebase.firestore();
      const user = auth.currentUser;
      
      if (!user) {
        console.warn('No user logged in');
        return null;
      }

      console.log('👤 Fetching user data for:', user.uid);

      // Try new structure first
      let userDoc = await db.collection('users').doc('patients').collection('patients').doc(user.uid).get();
      
      // Fallback to old structure
      if (!userDoc.exists) {
        userDoc = await db.collection('users').doc(user.uid).get();
      }

      if (!userDoc.exists) {
        console.warn('User document not found');
        return {
          name: user.displayName || '',
          email: user.email || '',
          phone: ''
        };
      }

      const data = userDoc.data();
      console.log('✅ User data loaded:', data);

      return {
        name: data.fullName || data.firstName + ' ' + data.lastName || user.displayName || '',
        email: data.email || user.email || '',
        phone: data.phone || data.phoneNumber || ''
      };

    } catch (error) {
      console.error('Error fetching user data:', error);
      return null;
    }
  }

  // Auto-fill appointment form
  async function autoFillAppointmentForm(doctorId, doctorName) {
    console.log('📝 Auto-filling appointment form...');
    console.log('   Doctor ID:', doctorId);
    console.log('   Doctor Name:', doctorName);

    // Get form elements
    const nameInput = document.getElementById('patientName');
    const emailInput = document.getElementById('patientEmail');
    const phoneInput = document.getElementById('patientPhone');
    const doctorInput = document.getElementById('doctor');
    const doctorIdInput = document.getElementById('doctorId');
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    if (!nameInput || !emailInput || !phoneInput || !doctorInput || !doctorIdInput) {
      console.warn('⚠️ Form elements not found');
      return;
    }

    // Get user data
    const userData = await getCurrentUserData();
    
    if (userData) {
      // Fill user information
      if (nameInput) nameInput.value = userData.name;
      if (emailInput) emailInput.value = userData.email;
      if (phoneInput) phoneInput.value = userData.phone;
      console.log('✅ User info filled');
    }

    // Fill doctor information
    if (doctorInput) doctorInput.value = doctorName;
    if (doctorIdInput) doctorIdInput.value = doctorId;
    console.log('✅ Doctor info filled');

    // Fill date and time from directory filters (if available)
    const dirDateInput = document.getElementById('dirDate');
    const dirTimeSelect = document.getElementById('dirTime');

    if (dirDateInput && dirDateInput.value && dateInput) {
      // Set the date without triggering onChange yet
      if (dateInput._flatpickr || window.appointmentCalendar) {
        const fpInstance = dateInput._flatpickr || window.appointmentCalendar;
        fpInstance.setDate(dirDateInput.value, false); // false to not trigger onChange
        console.log('✅ Date set via Flatpickr:', dirDateInput.value);
      } else {
        dateInput.value = dirDateInput.value;
        console.log('✅ Date set directly:', dirDateInput.value);
      }
      
      // Manually trigger date change after ensuring doctor is set
      setTimeout(() => {
        const event = new Event('change', { bubbles: true });
        dateInput.dispatchEvent(event);
        console.log('🔄 Triggered date change to load time slots');
      }, 100);
    }

    // Wait for times to load, then set time with polling
    if (dirTimeSelect && dirTimeSelect.value && timeSelect) {
      const targetTime = dirTimeSelect.value;
      console.log('⏳ Waiting for time slots to populate, target time:', targetTime);
      
      // Poll until time options are loaded
      let attempts = 0;
      const maxAttempts = 30; // 3 seconds max (30 * 100ms)
      
      const checkAndSetTime = () => {
        attempts++;
        
        // Check if time dropdown has options (more than just placeholder or "Loading...")
        const hasRealOptions = timeSelect.options.length > 1 && 
                              timeSelect.options[0].textContent !== 'Loading...';
        
        if (hasRealOptions) {
          // Time slots loaded, set the value
          timeSelect.value = targetTime;
          console.log('✅ Time filled from filter:', targetTime);
          
          // Trigger change event
          const event = new Event('change', { bubbles: true });
          timeSelect.dispatchEvent(event);
          
          // Update booked slots styling if function exists
          if (window.updateTimeDropdownForBookedSlots) {
            setTimeout(() => {
              window.updateTimeDropdownForBookedSlots();
            }, 100);
          }
        } else if (attempts < maxAttempts) {
          // Not ready yet, try again
          if (attempts % 5 === 0) {
            console.log(`   ⏳ Still waiting for time slots, attempt ${attempts}/${maxAttempts}`);
          }
          setTimeout(checkAndSetTime, 100);
        } else {
          console.warn('⚠️ Time slots did not load after 3 seconds');
          console.warn('   Current options count:', timeSelect.options.length);
          console.warn('   First option text:', timeSelect.options[0]?.textContent);
        }
      };
      
      // Start checking after initial delay (longer to ensure date change completes)
      setTimeout(checkAndSetTime, 500);
    }

    console.log('✅ Form auto-fill initiated!');
  }

  // Expose auto-fill function globally so other scripts can use it
  window.autoFillAppointmentForm = autoFillAppointmentForm;

  // Set up direct click handler for book appointment buttons
  function setupBookingButtons() {
    // DISABLED: patient-directory.js now handles the complete booking flow
    // This was causing conflicts by reinitializing the calendar
    console.log('ℹ️ appointment-autofill.js: Book button handling delegated to patient-directory.js');
    return;
    
    // Use event delegation for dynamically loaded buttons
    document.addEventListener('click', async (e) => {
      const bookBtn = e.target.closest('a.btn-appointment, button.btn-appointment');
      
      // Ignore if this is the form submit button or modal confirm button
      if (bookBtn && (bookBtn.type === 'submit' || bookBtn.id === 'confirmAppointmentProceed')) {
        return; // Let the form handle this
      }
      
      if (bookBtn) {
        console.log('🎯 Book Appointment button clicked!');
        
        // Get doctor info from button or closest card
        let doctorId = bookBtn.getAttribute('data-doctor-id');
        let doctorName = bookBtn.getAttribute('data-doctor');
        
        // If not on button, look in parent card
        if (!doctorId) {
          const card = bookBtn.closest('[data-doctor-id]');
          if (card) {
            doctorId = card.getAttribute('data-doctor-id');
            // Try to get doctor name from card content
            const nameEl = card.querySelector('.doctor-name, h5, h4');
            if (nameEl) {
              doctorName = nameEl.textContent.trim();
            }
          }
        }
        
        if (!doctorId) {
          console.warn('⚠️ No doctor ID found - not a directory booking button');
          return;
        }
        
        console.log('   Doctor ID:', doctorId);
        console.log('   Doctor Name:', doctorName || 'Unknown');
        
        // Wait a bit for existing handlers to complete
        setTimeout(async () => {
          console.log('📝 Starting auto-fill...');
          
          // Get user data
          const userData = await getCurrentUserData();
          
          // Fill form fields
          const nameInput = document.getElementById('patientName');
          const emailInput = document.getElementById('patientEmail');
          const phoneInput = document.getElementById('patientPhone');
          const doctorInput = document.getElementById('doctor');
          const doctorIdInput = document.getElementById('doctorId');
          const dateInput = document.getElementById('date');
          const timeSelect = document.getElementById('time');
          
          // Fill patient info
          if (userData) {
            if (nameInput) nameInput.value = userData.name;
            if (emailInput) emailInput.value = userData.email;
            if (phoneInput) phoneInput.value = userData.phone;
            console.log('✅ Patient info filled');
          }
          
          // Fill doctor info (in case other handler didn't)
          if (doctorInput) {
            doctorInput.value = doctorName || '';
          }
          if (doctorIdInput) {
            doctorIdInput.value = doctorId || '';
            console.log('✅ Doctor ID set to:', doctorId);
            
            // Trigger calendar color coding for the selected doctor
            if (window.loadDoctorAvailabilityForCalendar) {
              console.log('🎨 Triggering calendar color coding...');
              window.loadDoctorAvailabilityForCalendar(doctorId);
            }
          }
          console.log('✅ Doctor info ensured');
          
          // Store doctor ID in a global variable as backup
          window.__selectedDoctorId = doctorId;
          window.__selectedDoctorName = doctorName;
          
          // IMPORTANT: Wait for calendar to reinitialize before filling date/time
          setTimeout(async () => {
            console.log('🔍 Doctor ID we have:', doctorId);
            
            // Fill date/time from directory filters
            const dirDateInput = document.getElementById('dirDate');
            const dirTimeSelect = document.getElementById('dirTime');
            
            if (dirDateInput && dirDateInput.value && dateInput) {
              const dateValue = dirDateInput.value;
              const timeValue = dirTimeSelect?.value;
              
              console.log('📅 Setting date:', dateValue);
              
              // Set the date
              if (dateInput._flatpickr || window.appointmentCalendar) {
                const fpInstance = dateInput._flatpickr || window.appointmentCalendar;
                fpInstance.setDate(dateValue, false);
                console.log('✅ Date set via Flatpickr:', dateValue);
              } else {
                dateInput.value = dateValue;
                console.log('✅ Date set directly:', dateValue);
              }
              
              // Manually populate time slots using the doctor ID and date we already have
              if (window.db && doctorId && dateValue) {
                console.log('🕐 Manually populating time slots for doctor:', doctorId);
                
                try {
                  // Fetch doctor data directly
                  const docSnap = await window.db.collection('users').doc('doctors').collection('doctors').doc(doctorId).get();
                  
                  if (docSnap.exists) {
                    const dData = docSnap.data() || {};
                    console.log('✅ Doctor data fetched for time population');
                    
                    // Call the global populateTimesForDate if it exists
                    if (window.populateTimesForDate) {
                      const selectedDoc = {
                        id: docSnap.id,
                        name: dData.name || dData.fullName || 'Doctor',
                        specialty: dData.specialty || dData.department || '',
                        schedule: dData.schedule
                      };
                      
                      await window.populateTimesForDate(selectedDoc, new Date(dateValue));
                      
                      // Now set the time value immediately and wait for it
                      if (timeValue && timeSelect) {
                        await new Promise(resolve => {
                          setTimeout(() => {
                            timeSelect.value = timeValue;
                            console.log('✅ Time set to:', timeValue);
                            
                            // Trigger change event
                            const event = new Event('change', { bubbles: true });
                            timeSelect.dispatchEvent(event);
                            
                            resolve();
                          }, 100); // Small delay to ensure options are rendered
                        });
                      }
                    }
                  }
                } catch (err) {
                  console.error('❌ Error populating times:', err);
                }
              }
            }
            
            // Wait for calendar to finish reinitializing, then restore doctor ID
            setTimeout(() => {
              console.log('🔍 Checking doctor ID status...');
              console.log('   Global backup doctor ID:', window.__selectedDoctorId);
              
              const doctorIdFinal = document.getElementById('doctorId');
              const doctorFinal = document.getElementById('doctor');
              
              console.log('   doctorId element found:', !!doctorIdFinal);
              console.log('   doctorId current value:', doctorIdFinal?.value || 'EMPTY');
              
              if (doctorIdFinal && window.__selectedDoctorId) {
                doctorIdFinal.value = window.__selectedDoctorId;
                console.log('🔧 Final doctor ID set:', window.__selectedDoctorId);
              }
              
              if (doctorFinal && window.__selectedDoctorName) {
                doctorFinal.value = window.__selectedDoctorName;
              }
              
              // Wait a tiny bit more then log final state
              setTimeout(() => {
                console.log('✨ Auto-fill complete! Form values:');
                console.log('   Patient Name:', document.getElementById('patientName')?.value || 'EMPTY');
                console.log('   Patient Email:', document.getElementById('patientEmail')?.value || 'EMPTY');
                console.log('   Patient Phone:', document.getElementById('patientPhone')?.value || 'EMPTY');
                console.log('   Doctor:', document.getElementById('doctor')?.value || 'EMPTY');
                console.log('   Doctor ID:', document.getElementById('doctorId')?.value || 'EMPTY');
                console.log('   Date:', document.getElementById('date')?.value || 'EMPTY');
                console.log('   Time:', document.getElementById('time')?.value || 'EMPTY');
                
                // FINAL SAFETY CHECK: Set doctor ID one last time after everything settles
                setTimeout(() => {
                  const finalDoctorId = document.getElementById('doctorId');
                  const finalDoctor = document.getElementById('doctor');
                  if (finalDoctorId && window.__selectedDoctorId && !finalDoctorId.value) {
                    finalDoctorId.value = window.__selectedDoctorId;
                    console.log('🛡️ FINAL SAFETY: Restored doctor ID:', window.__selectedDoctorId);
                  }
                  if (finalDoctor && window.__selectedDoctorName && !finalDoctor.value) {
                    finalDoctor.value = window.__selectedDoctorName;
                  }
                  
                  console.log('🎉 All form fields ready! Final doctor ID:', document.getElementById('doctorId')?.value || 'STILL EMPTY');
                }, 1000); // Wait for all calendar events to finish
              }, 100);
            }, 800); // Wait longer for calendar to finish
          }, 500); // Wait for calendar to reinitialize
      }, 200);
      }
    }, true); // Use capture phase to run before other handlers
    
    console.log('✅ Book appointment button handler registered');
  }

  console.log('✅ Appointment auto-fill ready');

  // Initialize when DOM is ready and Firebase is available
  function init() {
    if (typeof firebase === 'undefined') {
      console.log('⏳ Waiting for Firebase...');
      setTimeout(init, 100);
      return;
    }

    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        console.log('✅ User authenticated, setting up auto-fill');
        setupBookingButtons();
      } else {
        console.log('⏳ Waiting for user authentication...');
      }
    });
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
