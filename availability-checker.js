/**
 * Availability Checker - Separate input for checking preferred time
 * Works independently of the appointment booking form
 */
(function () {
  'use strict';

  function waitForDependencies() {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (window.firebase && window.SmartBookingEngine && window.bootstrap && window.flatpickr) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }

  async function init() {
    await waitForDependencies();

    const db = firebase.firestore();
    const smartBooking = new SmartBookingEngine(db);

    console.log('✅ Availability Checker initialized');

    // Elements
    const dateInput = document.getElementById('preferredDateInput');
    const timeInput = document.getElementById('preferredTimeInput');
    const checkBtn = document.getElementById('checkAvailabilityBtn');
    const resultDiv = document.getElementById('availabilityResult');

    if (!dateInput || !timeInput || !checkBtn) {
      console.warn('Availability checker elements not found');
      return;
    }

    // Initialize Flatpickr for date input
    const datePicker = flatpickr(dateInput, {
      minDate: 'today',
      dateFormat: 'Y-m-d',
      disableMobile: true,
      onChange: validateInputs
    });

    // Validate inputs and enable/disable button
    function validateInputs() {
      const hasDate = dateInput.value !== '';
      const hasTime = timeInput.value !== '';
      
      checkBtn.disabled = !(hasDate && hasTime);
    }

    // Add event listeners for validation
    timeInput.addEventListener('change', validateInputs);

    // Check Availability Button Click - Find ALL available doctors at preferred time
    checkBtn.addEventListener('click', async () => {
      const preferredDate = dateInput.value;
      const preferredTime = timeInput.value;

      if (!preferredDate || !preferredTime) {
        showResult('Please select both date and time', 'warning');
        return;
      }

      // Show loading state
      checkBtn.disabled = true;
      checkBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Searching...';
      resultDiv.classList.add('d-none');

      try {
        console.log('🔍 Finding available doctors at:', { preferredDate, preferredTime });

        const user = firebase.auth().currentUser;
        if (!user) {
          showResult('Please login to check availability', 'danger');
          checkBtn.disabled = false;
          checkBtn.innerHTML = '<i class="bi bi-search me-2"></i>Find Available Doctors';
          return;
        }

        // Find ALL available doctors at this time
        const availableDoctors = await findAvailableDoctorsAtTime(preferredDate, preferredTime);

        console.log(`✅ Found ${availableDoctors.length} available doctor(s)`);

        if (availableDoctors.length > 0) {
          // Show available doctors!
          showAvailableDoctorsResult(availableDoctors, preferredDate, preferredTime);

        } else {
          // No doctors available - suggest alternative times
          // Pick first active doctor to find alternative times
          const firstDoctor = await getFirstActiveDoctor();
          
          if (firstDoctor) {
            const alternativeTimes = await smartBooking.findAlternativeTimesForDoctor(
              firstDoctor.id,
              firstDoctor.name,
              smartBooking.parseDateAndTime(preferredDate, preferredTime),
              60
            );

            if (alternativeTimes.length > 0) {
              showResult(
                `⚠️ <strong>No doctors available</strong> at ${preferredTime} on ${preferredDate}.
                <br><small class="mt-2 d-block">We found <strong>${alternativeTimes.length} alternative time(s)</strong> with available doctors.</small>
                <button class="btn btn-sm btn-warning mt-2" onclick="window.showAlternativeTimesFromChecker()">
                  <i class="bi bi-clock-fill me-1"></i>View Alternative Times
                </button>`,
                'info'
              );

              // Store for modal
              window.__lastAvailabilityResult = {
                alternativeTimes,
                originalDoctor: firstDoctor,
                suggestionType: 'alternative_times'
              };
            } else {
              showResult(
                `❌ <strong>No availability found</strong> at ${preferredTime} on ${preferredDate}.
                <br><small class="mt-2 d-block">Please try a different date or time.</small>`,
                'danger'
              );
            }
          } else {
            showResult(
              `❌ <strong>No doctors available</strong> in the system.`,
              'danger'
            );
          }
        }

      } catch (error) {
        console.error('Availability check error:', error);
        showResult(
          `❌ <strong>Error checking availability.</strong> Please try again.`,
          'danger'
        );
      } finally {
        checkBtn.disabled = false;
        checkBtn.innerHTML = '<i class="bi bi-search me-2"></i>Find Available Doctors';
        validateInputs();
      }
    });

    // Find all available doctors at a specific time
    async function findAvailableDoctorsAtTime(date, time) {
      try {
        const preferredSlot = smartBooking.parseDateAndTime(date, time);
        if (!preferredSlot) return [];

        const allDoctorsSnap = await db.collection('public_doctors')
          .where('active', '==', true)
          .get();

        const availableDoctors = [];

        for (const doc of allDoctorsSnap.docs) {
          const doctorId = doc.id;
          const doctorData = doc.data();

          const isAvailable = await smartBooking.checkDoctorAvailability(
            doctorId,
            preferredSlot,
            60
          );

          if (isAvailable) {
            availableDoctors.push({
              id: doctorId,
              name: doctorData.name || doctorData.fullName || 'Doctor',
              specialty: doctorData.specialty || 'General Practice',
              avatar: doctorData.avatarUrl || doctorData.photoUrl || '',
              rating: doctorData.rating || 0,
              about: doctorData.about || ''
            });
          }
        }

        // Sort by rating
        availableDoctors.sort((a, b) => (b.rating || 0) - (a.rating || 0));

        return availableDoctors;
      } catch (error) {
        console.error('Error finding available doctors:', error);
        return [];
      }
    }

    // Get first active doctor (for alternative time suggestions)
    async function getFirstActiveDoctor() {
      try {
        const snap = await db.collection('public_doctors')
          .where('active', '==', true)
          .limit(1)
          .get();

        if (snap.empty) return null;

        const doc = snap.docs[0];
        const data = doc.data();

        return {
          id: doc.id,
          name: data.name || data.fullName || 'Doctor'
        };
      } catch (error) {
        console.error('Error getting first doctor:', error);
        return null;
      }
    }

    // Display available doctors as cards
    function showAvailableDoctorsResult(doctors, date, time) {
      const doctorsHtml = doctors.map(doctor => {
        const avatarUrl = doctor.avatar || 'assets/img/team/team-1.jpg';
        const stars = '⭐'.repeat(Math.floor(doctor.rating || 0));
        
        return `
          <div class="available-doctor-card mb-3" data-doctor-id="${doctor.id}" data-doctor-name="${doctor.name}">
            <div class="row align-items-center">
              <div class="col-auto">
                <img src="${avatarUrl}" alt="${doctor.name}" 
                     class="rounded-circle" 
                     style="width: 60px; height: 60px; object-fit: cover; border: 2px solid #099aa7;"
                     onerror="this.src='assets/img/team/team-1.jpg'">
              </div>
              <div class="col">
                <h6 class="mb-1 fw-bold">${doctor.name}</h6>
                <p class="mb-1 small text-muted">
                  <i class="bi bi-heart-pulse me-1"></i>${doctor.specialty}
                </p>
                ${doctor.rating ? `<p class="mb-0 small">${stars} <span class="text-muted">(${doctor.rating.toFixed(1)})</span></p>` : ''}
              </div>
              <div class="col-auto">
                <button class="btn btn-sm btn-primary select-available-doctor"
                        data-doctor-id="${doctor.id}"
                        data-doctor-name="${doctor.name}">
                  <i class="bi bi-check-circle me-1"></i>Select
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      showResult(
        `<div class="mb-3">
          <strong class="text-success">✅ ${doctors.length} Doctor${doctors.length > 1 ? 's' : ''} Available</strong>
          <br><small class="text-muted">on ${date} at ${time}</small>
        </div>
        <div style="max-height: 400px; overflow-y: auto;">
          ${doctorsHtml}
        </div>`,
        'success'
      );

      // Add click handlers
      setTimeout(() => {
        document.querySelectorAll('.select-available-doctor').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const doctorId = btn.dataset.doctorId;
            const doctorName = btn.dataset.doctorName;
            
            fillBookingForm(doctorId, doctorName, date, time);
            
            showResult(
              `✅ <strong>${doctorName}</strong> selected! Scroll down to complete your booking.`,
              'info'
            );
          });
        });
      }, 100);
    }

    // Helper: Show result message
    function showResult(message, type) {
      resultDiv.className = `alert alert-${type}`;
      resultDiv.innerHTML = message;
      resultDiv.classList.remove('d-none');
      
      // Scroll to result
      resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Helper: Auto-fill booking form when doctor is available
    function fillBookingForm(doctorId, doctorName, date, time) {
      const doctorInput = document.getElementById('doctorInput');
      const doctorIdHidden = document.getElementById('doctorIdHidden');
      const dateInput = document.getElementById('dateInput');
      const timeSelect = document.getElementById('timeSelect');

      if (doctorInput) doctorInput.value = doctorName;
      if (doctorIdHidden) doctorIdHidden.value = doctorId;
      if (dateInput) dateInput.value = date;
      if (timeSelect) {
        // Add option if not exists
        let option = Array.from(timeSelect.options).find(opt => opt.value === time);
        if (!option) {
          option = new Option(time, time);
          timeSelect.add(option);
        }
        timeSelect.value = time;
      }

      // Scroll to booking form
      setTimeout(() => {
        const form = document.getElementById('appointment-form');
        if (form) {
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Highlight the form briefly
          form.style.transition = 'all 0.3s';
          form.style.transform = 'scale(1.02)';
          form.style.boxShadow = '0 0 20px rgba(9, 154, 167, 0.3)';
          setTimeout(() => {
            form.style.transform = 'scale(1)';
            form.style.boxShadow = 'none';
          }, 500);
        }
      }, 300);
    }

    // Global functions to show modals from result buttons
    window.showAlternativeDoctorsFromChecker = function() {
      const result = window.__lastAvailabilityResult;
      if (result && result.alternativeDoctors) {
        // Use the integration module's function
        if (window.showAlternativeDoctorsModal) {
          window.showAlternativeDoctorsModal(result);
        } else {
          console.error('showAlternativeDoctorsModal not found');
        }
      }
    };

    window.showAlternativeTimesFromChecker = function() {
      const result = window.__lastAvailabilityResult;
      if (result && result.alternativeTimes) {
        // Use the integration module's function
        if (window.showAlternativeTimesModal) {
          window.showAlternativeTimesModal(result);
        } else {
          console.error('showAlternativeTimesModal not found');
        }
      }
    };

    console.log('✅ Availability Checker ready');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
