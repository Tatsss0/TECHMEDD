/**
 * Directory Availability Filter Extension
 * Extends patient-directory.js to add real-time availability filtering
 */
(function() {
  'use strict';

  function waitForDependencies() {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (window.firebase && window.SmartBookingEngine && window.flatpickr) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Calculate optimization score for a doctor at a given time slot
   * Uses soft constraints similar to ConstraintScheduler
   */
  async function calculateDoctorScore(db, doctorId, preferredSlot) {
    let score = 0;
    const maxScore = 100;

    try {
      // Fetch doctor data
      let doctorDoc = await db.collection('users').doc('doctors').collection('doctors').doc(doctorId).get();
      if (!doctorDoc.exists) {
        doctorDoc = await db.collection('public_doctors').doc(doctorId).get();
      }
      if (!doctorDoc.exists) {
        doctorDoc = await db.collection('doctors').doc(doctorId).get();
      }

      if (!doctorDoc.exists) {
        return 50; // Default middle score if doctor data not found
      }

      const doctorData = doctorDoc.data();
      const hour = preferredSlot.getHours();
      const dayOfWeek = preferredSlot.toLocaleDateString('en-US', { weekday: 'long' });

      // Soft Constraint 1: Morning preference (9-11 AM) - Weight: 20 points
      if (hour >= 9 && hour < 11) {
        score += 20;
        console.log(`    🌅 Morning slot bonus: +20 points`);
      }

      // Soft Constraint 2: Avoid lunch hours (12-1 PM) - Weight: 15 points
      if (hour < 12 || hour >= 13) {
        score += 15;
        console.log(`    🍽️ Non-lunch hour bonus: +15 points`);
      } else {
        console.log(`    ⚠️ Lunch hour penalty: 0 points`);
      }

      // Soft Constraint 3: Doctor experience (based on specialty presence) - Weight: 15 points
      if (doctorData.specialty || doctorData.department) {
        score += 15;
        console.log(`    🎓 Specialty listed bonus: +15 points`);
      }

      // Soft Constraint 4: Proximity to current time (prefer sooner) - Weight: 20 points
      const now = new Date();
      const diffDays = Math.ceil((preferredSlot - now) / (1000 * 60 * 60 * 24));
      if (diffDays <= 3) {
        score += 20;
        console.log(`    ⚡ Within 3 days bonus: +20 points`);
      } else if (diffDays <= 7) {
        score += 10;
        console.log(`    📅 Within 7 days bonus: +10 points`);
      }

      // Soft Constraint 5: Working day preference (not Monday/Friday edges) - Weight: 10 points
      if (dayOfWeek !== 'Monday' && dayOfWeek !== 'Friday') {
        score += 10;
        console.log(`    📆 Mid-week bonus: +10 points`);
      }

      // Soft Constraint 6: Availability schedule complexity (more slots = better) - Weight: 20 points
      const schedule = doctorData.schedule || [];
      const totalSlots = schedule.reduce((sum, day) => {
        const slots = day.slots || day.timeSlots || [];
        return sum + slots.length;
      }, 0);

      if (totalSlots > 20) {
        score += 20;
        console.log(`    📊 High availability bonus: +20 points`);
      } else if (totalSlots > 10) {
        score += 10;
        console.log(`    📊 Moderate availability bonus: +10 points`);
      }

      console.log(`    🎯 Total score: ${score}/${maxScore}`);

    } catch (error) {
      console.error(`    ❌ Error calculating score for doctor ${doctorId}:`, error);
      return 50; // Default middle score on error
    }

    return Math.min(score, maxScore); // Cap at max score
  }

  async function init() {
    await waitForDependencies();

    const db = firebase.firestore();
    const smartBooking = new SmartBookingEngine(db);

    console.log('✅ Directory Availability Filter with Constraint Programming initialized');
    console.log('📊 This filter uses constraint programming to find optimal doctors');

    // Wait for doctors to be loaded by patient-directory.js
    await waitForDoctors();

    // Elements
    const dateInput = document.getElementById('dirDate');
    const timeSelect = document.getElementById('dirTime');
    const clearBtn = document.getElementById('dirClear');
    const statusDiv = document.getElementById('availabilityStatus');
    const statusText = document.getElementById('availabilityStatusText');

    if (!dateInput || !timeSelect) {
      console.warn('Date/Time filter elements not found');
      return;
    }

    // Wait for doctors to load
    function waitForDoctors() {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          const doctorCards = document.querySelectorAll('.doctor-directory .isotope-container [data-doctor-id]');
          if (doctorCards.length > 0) {
            console.log(`✅ Found ${doctorCards.length} doctor cards loaded`);
            clearInterval(check);
            resolve();
          }
        }, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(check);
          console.warn('⚠️ Timeout waiting for doctors to load');
          resolve();
        }, 10000);
      });
    }

    // Initialize Flatpickr for date input
    window.flatpickr(dateInput, {
      minDate: 'today',
      dateFormat: 'Y-m-d',
      disableMobile: true,
      onChange: () => {
        triggerAvailabilityFilter();
      }
    });

    // Add time change listener
    timeSelect.addEventListener('change', () => {
      triggerAvailabilityFilter();
    });

    // Add clear button listener
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        dateInput.value = '';
        timeSelect.value = '';
        if (statusDiv) statusDiv.classList.add('d-none');
        
        // Show all doctors again
        const container = document.querySelector('.doctor-directory .isotope-container');
        if (container) {
          const doctorCards = container.querySelectorAll('[data-doctor-id]');
          doctorCards.forEach(card => {
            // Show both the card and its parent wrapper
            if (card.parentElement) {
              card.parentElement.style.display = '';
            }
            card.style.display = '';
          });
          
          // Remove no results message
          const noResultsEl = container.querySelector('.no-results-message');
          if (noResultsEl) noResultsEl.remove();
        }
        
        console.log('🔄 Filters cleared - all doctors visible');
      });
    }

    // Function to trigger availability-based filtering
    async function triggerAvailabilityFilter() {
      const selectedDate = dateInput.value;
      const selectedTime = timeSelect.value;

      // Only filter by availability if both date and time are selected
      if (!selectedDate || !selectedTime) {
        if (statusDiv) statusDiv.classList.add('d-none');
        // Trigger normal filtering (without availability check)
        window.dispatchEvent(new CustomEvent('filterDoctors', { detail: { availabilityFilter: null } }));
        return;
      }

      // Show minimal loading status with smooth animation
      if (statusDiv && statusText) {
        statusDiv.classList.remove('d-none', 'alert-success', 'alert-warning');
        statusDiv.classList.add('alert-info');
        statusDiv.style.transition = 'all 0.3s ease';
        statusDiv.style.opacity = '0';
        
        // Fade in
        setTimeout(() => {
          statusDiv.style.opacity = '1';
        }, 10);
        
        const icon = statusDiv.querySelector('.status-icon');
        if (icon) {
          icon.className = 'status-icon';
          icon.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          `;
        }
        
        statusText.textContent = 'Loading Please Wait';
      }

      try {
        // Get all doctors from the page (they're already loaded by patient-directory.js)
        const container = document.querySelector('.doctor-directory .isotope-container');
        if (!container) {
          console.warn('Doctor directory container not found');
          return;
        }

        const doctorCards = container.querySelectorAll('[data-doctor-id]');
        const doctorIds = Array.from(doctorCards).map(card => card.dataset.doctorId).filter(Boolean);
        const uniqueDoctorIds = [...new Set(doctorIds)];

        console.log(`   📋 Found ${doctorCards.length} doctor cards in DOM`);
        console.log(`   🔢 Unique doctor IDs: ${uniqueDoctorIds.length}`);
        if (doctorCards.length !== uniqueDoctorIds.length) {
          console.warn(`   ⚠️ WARNING: ${doctorCards.length - uniqueDoctorIds.length} duplicate doctor cards detected!`);
        }

        if (doctorIds.length === 0) {
          console.warn('No doctors found on page - they may still be loading');
          if (statusDiv && statusText) {
            statusDiv.classList.remove('d-none', 'alert-success', 'alert-warning');
            statusDiv.classList.add('alert-info');
            const icon = statusDiv.querySelector('.status-icon');
            if (icon) {
              icon.className = 'status-icon spinner-border spinner-border-sm';
            }
            statusText.textContent = 'Loading doctors...';
          }
          return;
        }

        console.log(`🔍 Checking availability for ${uniqueDoctorIds.length} unique doctors`);
        console.log('🤖 Using constraint programming to find optimal matches...');

        // Check availability for each doctor
        const preferredSlot = smartBooking.parseDateAndTime(selectedDate, selectedTime);
        if (!preferredSlot) {
          console.warn('Invalid date/time format');
          return;
        }

        const availableDoctorIds = [];
        const doctorScores = {}; // Store constraint satisfaction scores

        console.log('🕐 Preferred slot:', preferredSlot);
        console.log('📅 Selected date:', selectedDate);
        console.log('⏰ Selected time:', selectedTime);
        console.log('🧮 Evaluating constraints for each doctor...');

        // Only check unique doctor IDs to avoid duplicate checks
        for (const doctorId of uniqueDoctorIds) {
          console.log(`\n🔍 Checking doctor ${doctorId}...`);
          
          try {
            // Use constraint programming to check availability
            const isAvailable = await smartBooking.checkDoctorAvailability(
              doctorId,
              preferredSlot,
              60 // default 60 minutes duration
            );

            console.log(`  ➡️ Doctor ${doctorId} available: ${isAvailable}`);

            if (isAvailable) {
              // Doctor passes hard constraints, now calculate optimization score
              const score = await calculateDoctorScore(db, doctorId, preferredSlot);
              doctorScores[doctorId] = score;
              availableDoctorIds.push(doctorId);
              console.log(`  ✅ Added doctor ${doctorId} (score: ${score.toFixed(1)}/100)`);
            } else {
              console.log(`  ❌ Doctor ${doctorId} does not satisfy hard constraints`);
            }
          } catch (error) {
            console.error(`  ❌ Error checking doctor ${doctorId}:`, error);
          }
        }

        // Deduplicate available doctor IDs and sort by score
        const uniqueAvailableDoctorIds = [...new Set(availableDoctorIds)];
        
        // Sort doctors by constraint satisfaction score (highest first)
        uniqueAvailableDoctorIds.sort((a, b) => {
          return (doctorScores[b] || 0) - (doctorScores[a] || 0);
        });
        
        console.log(`✅ ${uniqueAvailableDoctorIds.length} doctor(s) satisfy constraints at ${selectedTime} on ${selectedDate}`);
        console.log(`   Doctors ranked by optimization score:`);
        uniqueAvailableDoctorIds.forEach((id, index) => {
          console.log(`     ${index + 1}. Doctor ${id} - Score: ${(doctorScores[id] || 0).toFixed(1)}/100`);
        });

        // Hide doctors that are NOT available and add ranking badges
        let visibleCount = 0;
        doctorCards.forEach(card => {
          const doctorId = card.dataset.doctorId;
          if (uniqueAvailableDoctorIds.includes(doctorId)) {
            // Show available doctor
            if (card.parentElement) {
              card.parentElement.style.display = ''; // Show the col wrapper
            }
            card.style.display = '';
            visibleCount++;
            
            // Add ranking badge based on constraint score
            const rank = uniqueAvailableDoctorIds.indexOf(doctorId) + 1;
            const score = doctorScores[doctorId] || 0;
            
            // Remove old badge if exists
            const oldBadge = card.querySelector('.constraint-rank-badge');
            if (oldBadge) oldBadge.remove();
            
            // Add new badge for top 3
            if (rank <= 3) {
              const badge = document.createElement('div');
              badge.className = 'constraint-rank-badge';
              badge.style.cssText = `
                position: absolute;
                top: 10px;
                right: 10px;
                background: ${rank === 1 ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 
                            rank === 2 ? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' : 
                            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'};
                color: white;
                padding: 8px 12px;
                border-radius: 20px;
                font-weight: 600;
                font-size: 12px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.15);
                z-index: 10;
                display: flex;
                align-items: center;
                gap: 5px;
              `;
              badge.innerHTML = `
                <i class="bi bi-star-fill" style="font-size: 14px;"></i>
                <span>${rank === 1 ? 'Best Match' : rank === 2 ? '2nd Best' : '3rd Best'}</span>
                <span style="opacity: 0.8; font-size: 10px;">(${score.toFixed(0)})</span>
              `;
              
              // Find the card body to insert badge
              const cardBody = card.querySelector('.card-body') || card.querySelector('.doctor-card');
              if (cardBody) {
                cardBody.style.position = 'relative';
                cardBody.insertBefore(badge, cardBody.firstChild);
              }
            }
            
            console.log(`   👁️ Showing doctor card: ${doctorId} (Rank ${rank}, Score ${score.toFixed(1)})`);
          } else {
            // Hide unavailable doctor and remove badge
            if (card.parentElement) {
              card.parentElement.style.display = 'none'; // Hide the col wrapper
            }
            card.style.display = 'none';
            
            const oldBadge = card.querySelector('.constraint-rank-badge');
            if (oldBadge) oldBadge.remove();
          }
        });

        console.log(`   📊 Total visible cards in DOM: ${visibleCount}`);

        // Update status message with actual visible count and ranking info
        if (statusDiv && statusText) {
          const icon = statusDiv.querySelector('.status-icon');
          
          if (uniqueAvailableDoctorIds.length > 0) {
            // Smooth transition to success state
            statusDiv.style.opacity = '0';
            
            setTimeout(() => {
              statusDiv.classList.remove('alert-info', 'alert-warning');
              statusDiv.classList.add('alert-success');
              if (icon) {
                icon.className = 'status-icon bi bi-check-circle-fill';
                icon.innerHTML = ''; // Clear spinner SVG
              }
              
              // Minimal success message
              const doctorWord = uniqueAvailableDoctorIds.length === 1 ? 'doctor' : 'doctors';
              statusText.textContent = `${uniqueAvailableDoctorIds.length} ${doctorWord} on ${selectedDate} at ${selectedTime}`;
              
              // Fade in
              statusDiv.style.opacity = '1';
            }, 150);
          } else {
            // Smooth transition to warning state
            statusDiv.style.opacity = '0';
            
            setTimeout(() => {
              statusDiv.classList.remove('alert-info', 'alert-success');
              statusDiv.classList.add('alert-warning');
              if (icon) {
                icon.className = 'status-icon bi bi-exclamation-triangle-fill';
                icon.innerHTML = ''; // Clear spinner SVG
              }
              
              // Minimal warning message
              statusText.textContent = `No available doctors on ${selectedDate} at ${selectedTime}.`;
              
              // Fade in
              statusDiv.style.opacity = '1';
            }, 150);
          }
        }

        // Show no results message if all filtered out
        const visibleCards = Array.from(doctorCards).filter(card => {
          const parentVisible = !card.parentElement || card.parentElement.style.display !== 'none';
          const cardVisible = card.style.display !== 'none';
          return parentVisible && cardVisible;
        });
        
        const noResultsEl = container.querySelector('.no-results-message');
        
        if (visibleCards.length === 0) {
          if (!noResultsEl) {
            const noResults = document.createElement('div');
            noResults.className = 'col-12 no-results-message';
            noResults.innerHTML = `
              <div class="text-center py-5">
                <i class="bi bi-calendar-x fs-1 text-muted mb-3"></i>
                <h5 class="text-muted">No doctors available at this time</h5>
                <p class="text-muted">Try selecting a different date or time to see available doctors.</p>
              </div>
            `;
            container.appendChild(noResults);
          }
        } else {
          if (noResultsEl) noResultsEl.remove();
        }

      } catch (error) {
        console.error('Availability filtering error:', error);
        if (statusDiv && statusText) {
          statusDiv.classList.remove('alert-info', 'alert-success');
          statusDiv.classList.add('alert-warning');
          const icon = statusDiv.querySelector('.status-icon');
          if (icon) {
            icon.className = 'status-icon bi bi-x-circle-fill';
          }
          statusText.innerHTML = `Unable to check availability. <strong>Please try again</strong>`;
        }
      }
    }

    console.log('✅ Directory Availability Filter ready');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
