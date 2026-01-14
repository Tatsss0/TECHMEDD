/**
 * Constraint Programming Based Appointment Scheduler
 * Automatically finds optimal appointment slots based on multiple constraints
 */
(function () {
  'use strict';

  class ConstraintScheduler {
    constructor(doctor, existingAppointments) {
      this.doctor = doctor;
      this.existingAppointments = existingAppointments || [];
      this.constraints = this.buildConstraints();
    }

    buildConstraints() {
      return {
        // Hard constraints (must be satisfied)
        hard: {
          doctorAvailability: this.checkDoctorAvailability.bind(this),
          noOverlap: this.checkNoOverlap.bind(this),
          workingHours: this.checkWorkingHours.bind(this),
          maxDailyAppointments: this.checkMaxDailyAppointments.bind(this),
          notInPast: this.checkNotInPast.bind(this),
        },
        // Soft constraints (preferences, scored)
        soft: {
          patientPreference: { weight: 10 },
          minimizeGaps: { weight: 5 },
          consecutiveSameType: { weight: 3 },
          lunchBreak: { weight: 8 },
          morningPreference: { weight: 4 },
        }
      };
    }

    // Hard constraint: Doctor must be available
    checkDoctorAvailability(slot) {
      const schedule = this.doctor.schedule;
      
      // No schedule at all - reject
      if (!schedule) {
        console.log('⚠️ No schedule found for doctor');
        return false;
      }
      
      // Check new format first (specific dates with times)
      if (Array.isArray(schedule)) {
        if (schedule.length === 0) {
          console.log('⚠️ Schedule array is empty');
          return false;
        }
        
        const year = slot.getFullYear();
        const month = String(slot.getMonth() + 1).padStart(2, '0');
        const day = String(slot.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        const availableSlot = schedule.find(s => s.date === dateStr);
        if (availableSlot && availableSlot.time) {
          // Check if slot time is within the available time range
          const slotHour = slot.getHours();
          const [startTime, endTime] = availableSlot.time.split(' - ');
          const startHour = this.parseTime12Hour(startTime.trim());
          const endHour = this.parseTime12Hour(endTime.trim());
          const isWithinRange = slotHour >= startHour && slotHour < endHour;
          return isWithinRange;
        }
        
        // Check if schedule object has weeklySchedule property
        if (schedule.weeklySchedule) {
          return this.checkWeeklySchedule(slot, schedule.weeklySchedule);
        }
        
        // No match found for this date in specific dates
        return false;
      }
      
      // Old format: check weekly schedule
      const dayIndex = slot.getDay();
      const timeMinutes = slot.getHours() * 60 + slot.getMinutes();
      
      // Check if it's a working day
      const workingDays = schedule.workingDays || [];
      if (workingDays.length > 0 && !workingDays.includes(dayIndex)) {
        return false;
      }

      // Check time range
      const daySchedule = schedule.byDay?.[dayIndex];
      if (daySchedule) {
        const startMin = this.parseHHMM(daySchedule.startHour);
        const endMin = this.parseHHMM(daySchedule.endHour);
        if (startMin !== null && endMin !== null) {
          return timeMinutes >= startMin && timeMinutes < endMin;
        }
      }

      // Check global start/end hours
      if (schedule.startHour && schedule.endHour) {
        const startMin = this.parseHHMM(schedule.startHour);
        const endMin = this.parseHHMM(schedule.endHour);
        if (startMin !== null && endMin !== null) {
          return timeMinutes >= startMin && timeMinutes < endMin;
        }
      }

      return true; // Default to available if no restrictions
    }

    checkWeeklySchedule(slot, weeklySchedule) {
      const dayIndex = slot.getDay();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = dayNames[dayIndex];
      
      const daySchedule = weeklySchedule.find(s => 
        s.day?.toLowerCase() === dayName || s.dayIndex === dayIndex
      );
      
      if (!daySchedule) return false;
      if (daySchedule.off || daySchedule.closed) return false;
      
      if (daySchedule.startHour && daySchedule.endHour) {
        const slotMinutes = slot.getHours() * 60 + slot.getMinutes();
        const startMin = this.parseHHMM(daySchedule.startHour);
        const endMin = this.parseHHMM(daySchedule.endHour);
        return slotMinutes >= startMin && slotMinutes < endMin;
      }
      
      return true;
    }

    // Hard constraint: No overlapping appointments
    checkNoOverlap(slot, durationMinutes) {
      const slotEnd = new Date(slot.getTime() + durationMinutes * 60000);
      
      return !this.existingAppointments.some(apt => {
        if (!apt.startAt) return false;
        
        const aptStart = apt.startAt.toDate ? apt.startAt.toDate() : new Date(apt.startAt);
        const aptDuration = apt.duration || apt.durationMinutes || 60;
        const aptEnd = new Date(aptStart.getTime() + aptDuration * 60000);
        
        // Check if slots overlap
        return (slot < aptEnd && slotEnd > aptStart);
      });
    }

    // Hard constraint: Within reasonable working hours (8 AM to 6 PM)
    checkWorkingHours(slot) {
      const hour = slot.getHours();
      return hour >= 8 && hour < 18;
    }

    // Hard constraint: Max appointments per day
    checkMaxDailyAppointments(slot) {
      const maxPerDay = this.doctor.maxDailyAppointments || 20;
      const sameDay = this.existingAppointments.filter(apt => {
        if (!apt.startAt) return false;
        const aptDate = apt.startAt.toDate ? apt.startAt.toDate() : new Date(apt.startAt);
        return this.isSameDay(aptDate, slot);
      });
      return sameDay.length < maxPerDay;
    }

    // Hard constraint: Not in the past
    checkNotInPast(slot) {
      return slot.getTime() > Date.now();
    }

    // Find optimal slots for given criteria
    async findOptimalSlots(criteria) {
      const {
        preferredDates = null,
        preferredTimes = null,
        durationMinutes = 60,
        urgency = 'normal', // low, normal, high, emergency
        appointmentType = 'consultation',
        maxResults = 10
      } = criteria;

      console.log('🔍 Finding optimal slots with criteria:', criteria);

      const candidateSlots = this.generateCandidateSlots(preferredDates);
      console.log(`📊 Generated ${candidateSlots.length} candidate slots`);
      
      const scoredSlots = [];

      for (const slot of candidateSlots) {
        // Check all hard constraints
        if (!this.satisfiesHardConstraints(slot, durationMinutes)) {
          continue;
        }

        // Calculate soft constraint score
        const score = this.calculateSoftScore(slot, criteria);
        scoredSlots.push({ slot, score });
      }

      console.log(`✅ Found ${scoredSlots.length} valid slots after constraint checking`);

      // Sort by score (highest first)
      scoredSlots.sort((a, b) => b.score - a.score);

      // Return top N slots
      return scoredSlots.slice(0, maxResults).map(s => ({
        slot: s.slot,
        score: s.score
      }));
    }

    satisfiesHardConstraints(slot, durationMinutes) {
      const checks = [
        { name: 'notInPast', fn: () => this.constraints.hard.notInPast(slot) },
        { name: 'workingHours', fn: () => this.constraints.hard.workingHours(slot) },
        { name: 'doctorAvailability', fn: () => this.constraints.hard.doctorAvailability(slot) },
        { name: 'noOverlap', fn: () => this.constraints.hard.noOverlap(slot, durationMinutes) },
        { name: 'maxDailyAppointments', fn: () => this.constraints.hard.maxDailyAppointments(slot) },
      ];

      for (const check of checks) {
        if (!check.fn()) {
          return false;
        }
      }

      return true;
    }

    calculateSoftScore(slot, criteria) {
      let score = 0;

      // Preference for patient's preferred times
      if (criteria.preferredTimes && Array.isArray(criteria.preferredTimes)) {
        const slotHour = slot.getHours();
        const prefMatches = criteria.preferredTimes.some(pref => {
          return Math.abs(slotHour - pref) <= 1;
        });
        if (prefMatches) {
          score += this.constraints.soft.patientPreference.weight;
        }
      }

      // Minimize gaps in schedule
      const gapScore = this.calculateGapScore(slot);
      score += gapScore * this.constraints.soft.minimizeGaps.weight;

      // Avoid lunch hours (12-1 PM)
      const hour = slot.getHours();
      if (hour === 12) {
        score -= this.constraints.soft.lunchBreak.weight;
      }

      // Morning preference (9-11 AM is often preferred)
      if (hour >= 9 && hour <= 11) {
        score += this.constraints.soft.morningPreference.weight;
      }

      // Urgency bonus
      if (criteria.urgency === 'high') score += 15;
      if (criteria.urgency === 'emergency') score += 30;

      // Prefer earlier available slots
      const daysFromNow = (slot.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysFromNow <= 3) score += 5;
      if (daysFromNow <= 7) score += 3;

      return score;
    }

    calculateGapScore(slot) {
      // Prefer slots that minimize gaps in the schedule (pack appointments)
      const before = this.findNearestAppointment(slot, -1);
      const after = this.findNearestAppointment(slot, 1);
      
      let gapScore = 0;
      
      if (before) {
        const beforeDate = before.startAt.toDate ? before.startAt.toDate() : new Date(before.startAt);
        const gapMinutes = (slot.getTime() - beforeDate.getTime()) / 60000;
        if (gapMinutes <= 60) gapScore += 2; // Minimal gap is good
        if (gapMinutes <= 120) gapScore += 1;
      }
      
      if (after) {
        const afterDate = after.startAt.toDate ? after.startAt.toDate() : new Date(after.startAt);
        const gapMinutes = (afterDate.getTime() - slot.getTime()) / 60000;
        if (gapMinutes <= 60) gapScore += 2;
        if (gapMinutes <= 120) gapScore += 1;
      }
      
      return gapScore;
    }

    generateCandidateSlots(preferredDates) {
      const slots = [];
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30); // Look ahead 30 days

      let currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        // Generate hourly slots for each day (8 AM to 6 PM)
        for (let hour = 8; hour < 18; hour++) {
          const slot = new Date(currentDate);
          slot.setHours(hour, 0, 0, 0);
          
          // Skip if in the past
          if (slot.getTime() > Date.now()) {
            slots.push(slot);
          }
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return slots;
    }

    // Utility methods
    parseHHMM(hhmm) {
      if (!hhmm) return null;
      const [h, m] = (hhmm || '').split(':').map(v => parseInt(v, 10));
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      return h * 60 + m;
    }

    parseTime12Hour(timeStr) {
      if (!timeStr) return null;
      const [time, period] = timeStr.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      let hour24 = hours;
      
      if (period === 'PM' && hours !== 12) {
        hour24 = hours + 12;
      } else if (period === 'AM' && hours === 12) {
        hour24 = 0;
      }
      
      return hour24;
    }

    isSameDay(date1, date2) {
      return date1.getFullYear() === date2.getFullYear() &&
             date1.getMonth() === date2.getMonth() &&
             date1.getDate() === date2.getDate();
    }

    findNearestAppointment(slot, direction) {
      const sorted = [...this.existingAppointments].sort((a, b) => {
        const aTime = a.startAt.toDate ? a.startAt.toDate().getTime() : new Date(a.startAt).getTime();
        const bTime = b.startAt.toDate ? b.startAt.toDate().getTime() : new Date(b.startAt).getTime();
        return direction > 0 ? aTime - bTime : bTime - aTime;
      });

      return direction > 0
        ? sorted.find(apt => {
            const aptTime = apt.startAt.toDate ? apt.startAt.toDate() : new Date(apt.startAt);
            return aptTime.getTime() > slot.getTime();
          })
        : sorted.find(apt => {
            const aptTime = apt.startAt.toDate ? apt.startAt.toDate() : new Date(apt.startAt);
            return aptTime.getTime() < slot.getTime();
          });
    }
  }

  // Export for use
  if (typeof window !== 'undefined') {
    window.ConstraintScheduler = ConstraintScheduler;
  }

  console.log('✅ Constraint Scheduler loaded');
})();
