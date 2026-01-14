// appointment-reminder.js - In-app reminder banner for appointments
(function() {
  'use strict';

  // Check if already initialized
  if (window.AppointmentReminder) return;

  class AppointmentReminder {
    constructor() {
      this.checkInterval = null;
      this.currentUserId = null;
      this.userType = null;
      this.listener = null;
    }

    /**
     * Initialize reminder system for a user
     * @param {string} userId - User's Firebase UID
     * @param {string} userType - 'patient' or 'doctor'
     */
    async initialize(userId, userType) {
      this.currentUserId = userId;
      this.userType = userType;

      // Create reminder banner container if it doesn't exist
      this.createReminderUI();

      // Set up real-time listener for upcoming appointments
      this.setupAppointmentListener();

      // Check for upcoming appointments every minute
      this.checkInterval = setInterval(() => {
        this.checkUpcomingAppointments();
      }, 60000); // Check every minute

      // Initial check
      this.checkUpcomingAppointments();

      console.log('✅ Appointment reminder system initialized');
    }

    /**
     * Create reminder banner UI
     */
    createReminderUI() {
      // Check if banner already exists
      if (document.getElementById('appointment-reminder-banner')) return;

      const banner = document.createElement('div');
      banner.id = 'appointment-reminder-banner';
      banner.className = 'reminder-banner hidden';
      banner.innerHTML = `
        <div class="reminder-content">
          <div class="reminder-text">
            <div class="reminder-title"></div>
            <div class="reminder-message"></div>
          </div>
          <button class="reminder-close" onclick="window.AppointmentReminder.hideReminder()">
            <i class="bi bi-x"></i>
          </button>
        </div>
      `;

      // Add CSS styles that match your system's design
      const style = document.createElement('style');
      style.textContent = `
        .reminder-banner {
          position: fixed;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          width: 90%;
          max-width: 500px;
          background: #ffffff;
          color: #363f40;
          border: 2px solid #099aa7;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(9, 154, 167, 0.15);
          z-index: 9999;
          animation: slideDown 0.3s ease-out;
          transition: all 0.3s ease;
          font-family: var(--default-font, 'Roboto', sans-serif);
        }

        .reminder-banner.hidden {
          display: none;
        }

        .reminder-banner.urgent {
          border-color: #dc3545;
          box-shadow: 0 4px 12px rgba(220, 53, 69, 0.25);
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        .reminder-content {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
        }

        .reminder-text {
          flex: 1;
        }

        .reminder-title {
          font-size: 15px;
          font-weight: 600;
          color: #1f2f31;
          margin-bottom: 2px;
          font-family: var(--heading-font, 'Ubuntu', sans-serif);
        }

        .reminder-message {
          font-size: 14px;
          color: #363f40;
          line-height: 1.4;
        }

        .reminder-close {
          background: transparent;
          border: none;
          color: #6c757d;
          width: 28px;
          height: 28px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          min-width: 28px;
        }

        .reminder-close:hover {
          background: #f8f9fa;
          color: #363f40;
        }

        @media (max-width: 768px) {
          .reminder-banner {
            top: 70px;
            width: 95%;
            margin: 0 2.5%;
          }

          .reminder-content {
            padding: 14px 16px;
            gap: 10px;
          }

          .reminder-title {
            font-size: 14px;
          }

          .reminder-message {
            font-size: 13px;
          }

          .reminder-close {
            width: 24px;
            height: 24px;
            font-size: 14px;
          }
        }
      `;

      document.head.appendChild(style);
      document.body.appendChild(banner);
    }

    /**
     * Set up real-time listener for appointments
     */
    setupAppointmentListener() {
      if (!window.db || !this.currentUserId) return;

      const collectionQuery = this.userType === 'patient'
        ? window.db.collection('appointments').where('patientId', '==', this.currentUserId)
        : window.db.collection('appointments').where('doctorId', '==', this.currentUserId);

      // Listen for appointment changes
      this.listener = collectionQuery.onSnapshot((snapshot) => {
        console.log('📡 Appointments updated, checking for reminders...');
        this.checkUpcomingAppointments();
      });
    }

    /**
     * Check for upcoming appointments and show reminders
     */
    async checkUpcomingAppointments() {
      if (!window.db || !this.currentUserId) return;

      try {
        const now = new Date();
        const nowMs = now.getTime();
        
        // Query upcoming appointments
        const collectionQuery = this.userType === 'patient'
          ? window.db.collection('appointments').where('patientId', '==', this.currentUserId)
          : window.db.collection('appointments').where('doctorId', '==', this.currentUserId);

        const snapshot = await collectionQuery
          .where('status', 'in', ['confirmed', 'pending', 'rescheduled'])
          .get();

        let closestAppointment = null;
        let minTimeDiff = Infinity;

        snapshot.forEach((doc) => {
          const data = doc.data();
          let appointmentTime = null;

          // Parse appointment time
          if (data.startAt && data.startAt.toDate) {
            appointmentTime = data.startAt.toDate();
          } else if (data.appointmentDate && data.appointmentTime) {
            // Parse from appointmentDate and appointmentTime strings
            const dateStr = data.appointmentDate; // e.g., "2024-12-25"
            const timeStr = data.appointmentTime; // e.g., "10:00 AM"
            appointmentTime = this.parseAppointmentDateTime(dateStr, timeStr);
          }

          if (!appointmentTime) return;

          const timeDiff = appointmentTime.getTime() - nowMs;
          
          // Only consider appointments in the future within next 24 hours
          if (timeDiff > 0 && timeDiff < 24 * 60 * 60 * 1000 && timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff;
            closestAppointment = {
              ...data,
              id: doc.id,
              appointmentTime: appointmentTime,
              timeDiff: timeDiff
            };
          }
        });

        // Show reminder if appointment is within 10 minutes
        if (closestAppointment && minTimeDiff <= 10 * 60 * 1000) {
          this.showReminder(closestAppointment);
        } else {
          this.hideReminder();
        }
      } catch (error) {
        console.error('❌ Error checking upcoming appointments:', error);
      }
    }

    /**
     * Parse appointment date and time strings
     */
    parseAppointmentDateTime(dateStr, timeStr) {
      try {
        // Parse date (YYYY-MM-DD)
        const [year, month, day] = dateStr.split('-').map(Number);
        
        // Parse time (h:mm AM/PM)
        const timeMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!timeMatch) return null;

        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const period = timeMatch[3].toUpperCase();

        // Convert to 24-hour format
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;

        return new Date(year, month - 1, day, hours, minutes);
      } catch (error) {
        console.error('Error parsing appointment time:', error);
        return null;
      }
    }

    /**
     * Show reminder banner
     */
    showReminder(appointment) {
      const banner = document.getElementById('appointment-reminder-banner');
      if (!banner) return;

      const timeDiff = appointment.timeDiff;
      const minutes = Math.floor(timeDiff / (60 * 1000));
      
      // Update banner content
      const titleEl = banner.querySelector('.reminder-title');
      const messageEl = banner.querySelector('.reminder-message');

      titleEl.textContent = 'Appointment Starting Soon!';
      messageEl.textContent = `Your appointment starts in ${minutes} minute${minutes !== 1 ? 's' : ''}. Please prepare to join.`;

      banner.classList.remove('hidden');

      // Store appointment ID for potential actions
      banner.dataset.appointmentId = appointment.id;
    }

    /**
     * Hide reminder banner
     */
    hideReminder() {
      const banner = document.getElementById('appointment-reminder-banner');
      if (banner) {
        banner.classList.add('hidden');
      }
    }

    /**
     * Handle push notification data (called from notification-manager.js)
     */
    handlePushNotification(data) {
      console.log('📩 Push notification received:', data);
      
      // Force check appointments
      this.checkUpcomingAppointments();
    }

    /**
     * Clean up
     */
    destroy() {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
      }
      if (this.listener) {
        this.listener();
      }
      this.hideReminder();
    }
  }

  // Create and expose global instance
  window.AppointmentReminder = new AppointmentReminder();

  // Expose showInAppReminder for notification-manager.js
  window.showInAppReminder = function(data) {
    if (window.AppointmentReminder) {
      window.AppointmentReminder.handlePushNotification(data);
    }
  };

  console.log('📱 Appointment Reminder UI loaded');
})();
