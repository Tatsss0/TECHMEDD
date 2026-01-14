<!DOCTYPE html>
<html lang="en">
  
<head>
  
  <meta charset="UTF-8">
  <title>TechMed Admin Panel</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <script>import { query, orderByChild, onValue, ref } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";</script>

  <!-- Firebase SDK -->
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
  
  <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
  <script>
    document.addEventListener("DOMContentLoaded", function () {
      emailjs.init('hL2tHCUwDzi8UnuSz'); 
    });
  </script>
  


  <!-- Reschedule Modal -->
<div id="reschedule-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.5); justify-content:center; align-items:center; z-index: 9999;">
  <div style="background:white; padding:2rem; border-radius:10px; width:90%; max-width:400px; text-align:center;">
    <h2>Reschedule Appointment</h2>
    <div style="margin-bottom:1rem;">
      <label for="new-date">New Date:</label><br>
      <input type="date" id="new-date" style="padding:0.5rem; width:100%; margin-top:0.5rem;">
    </div>
    <div style="margin-bottom:1rem;">
      <label for="new-time">New Time:</label><br>
      <input type="time" id="new-time" style="padding:0.5rem; width:100%; margin-top:0.5rem;">
    </div>
    <button onclick="confirmReschedule()" style="background:#1D3557; color:white; padding:0.5rem 1rem; border:none; border-radius:5px; margin-right:1rem;">Save</button>
    <button onclick="closeModal()" style="background:#ccc; padding:0.5rem 1rem; border:none; border-radius:5px;">Cancel</button>
  </div>
</div>


  
  <script>
    const firebaseConfig = {
      apiKey: "AIzaSyCwCjmcUTTz8S34svqAxmhHmhO8QNnz5t8",
      authDomain: "t-echmed.firebaseapp.com",
      databaseURL: "https://t-echmed-default-rtdb.firebaseio.com",
      projectId: "t-echmed",
      storageBucket: "t-echmed.appspot.com",
      messagingSenderId: "290352510024",
      appId: "1:290352510024:web:c9e2fbdec8d36f35ca547d"
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    console.log("✅ Firebase initialized");

  </script>


  <link rel="stylesheet" href="admin.css">
 
</head>

<body>

<header>
  <div><strong>TechMed Admin</strong></div>
  <nav>
    <a href="#">Dashboard</a>
    <a href="#">Logout</a>
  </nav>
</header>

<div class="container">
  <div class="tabs">
    <button class="tab-button active" onclick="showTab('appointments')">Patient Appointments</button>
    <button class="tab-button" onclick="showTab('schedule')">Doctor Schedules</button>
  </div>

  <!-- Patient Appointments Tab -->
  <div id="appointments-tab" class="tab-content active">
  <h2>Patient Appointments</h2>
  
  <!-- Updated Filter section -->
  <div class="filter-section">
    <div>
      <label for="filter">Filter by Status:</label>
      <select id="filter" onchange="filterAppointments()">
        <option value="all">All</option>
        <option value="upcoming">Upcoming</option>
        <option value="past">Past</option>
      </select>
    </div>

    <div id="doctor-filter-container" style="display:none;">
      <label for="doctor-filter">Filter by Doctor:</label>
      <select id="doctor-filter" onchange="filterAppointments()">
        <option value="all">All Doctors</option>
      </select>
    </div>
  </div>
  
  <table id="appointments-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Contact</th>
        <th>Age</th>
        <th>Gender</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Doctor</th> 
        <th>Action</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
</div>

  <!-- Doctor Schedules Tab -->
  <div id="schedule-tab" class="tab-content">
    <h2>Manage Doctor Schedules</h2>

    <!-- Select Doctor to Edit -->
    <div class="form-group">
      <label for="doctor-select">Select Doctor:</label>
      <select id="doctor-select" onchange="loadDoctor(this.value)">
      <option value="select"></option>
        <option value="stephen">Dr. Stephen Halili</option>
        <option value="lester">Dr. Lester Ramirez</option>
        <option value="mea">Dr. Mea Cabana</option>
        <option value="lizton">Dr. Lizton Canlas</option> 
      </select>
    </div>

    <!-- Doctor Info -->
    <div class="doctor-info" id="doctor-info"></div>

    <!-- Doctor Schedule Edit Form -->
    <div class="form-group">
      <label>Available Days:</label>
      <div class="available-days">
        <label><input type="checkbox" value="0"> Sunday</label>
        <label><input type="checkbox" value="1"> Monday</label>
        <label><input type="checkbox" value="2"> Tuesday</label>
        <label><input type="checkbox" value="3"> Wednesday</label>
        <label><input type="checkbox" value="4"> Thursday</label>
        <label><input type="checkbox" value="5"> Friday</label>
        <label><input type="checkbox" value="6"> Saturday</label>
      </div>
    </div>

    <div class="form-group">
      <label for="available-time">Available Time (example: 8:00AM - 12:00NN):</label>
      <input type="text" id="available-time">
    </div>

    <button onclick="saveChanges()">Save Changes</button>
  </div>
</div>

<script>

let currentEditingDoctorId = null;


// Switching tabs
function showTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.getElementById(tabName + '-tab').classList.add('active');
  
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.tab-button[onclick="showTab('${tabName}')"]`).classList.add('active');
}

// Load Appointments
let appointmentsData = [];

db.collection("appointments").onSnapshot(snapshot => {
  appointmentsData = [];
  const doctorSet = new Set();

  snapshot.forEach(doc => {
    const data = doc.data();
    data.docId = doc.id;
    appointmentsData.push(data);

    if (data.doctor) {
      doctorSet.add(data.doctor);
    }
  });

  populateDoctorFilter([...doctorSet]);
  filterAppointments();
});

// Populate Doctor Filter Dropdown
function populateDoctorFilter(doctors) {
  const doctorFilterContainer = document.getElementById('doctor-filter-container');
  const doctorFilter = document.getElementById('doctor-filter');

  if (doctors.length > 0) {
    doctorFilterContainer.style.display = 'block';
    doctorFilter.innerHTML = '<option value="all">All Doctors</option>';
    doctors.forEach(doctorName => {
      const option = document.createElement('option');
      option.value = doctorName;
      option.textContent = doctorName;
      doctorFilter.appendChild(option);
    });
  } else {
    doctorFilterContainer.style.display = 'none';
  }
}

// Filter Appointments
function filterAppointments() {
  const filter = document.getElementById("filter").value;
  const doctorFilter = document.getElementById("doctor-filter") ? document.getElementById("doctor-filter").value : 'all';
  const tbody = document.querySelector("#appointments-table tbody");
  tbody.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  appointmentsData.forEach(data => {
    const appointmentDate = new Date(data.date);
    appointmentDate.setHours(0, 0, 0, 0);

    let shouldShow = true;

    if (filter === "upcoming" && appointmentDate < today) {
      shouldShow = false;
    } else if (filter === "past" && appointmentDate >= today) {
      shouldShow = false;
    }

    if (doctorFilter !== "all" && data.doctor !== doctorFilter) {
      shouldShow = false;
    }

    if (shouldShow) {
      const tr = document.createElement("tr");
      tr.className = appointmentDate >= today ? 'upcoming' : 'past';
      tr.innerHTML = `
        <td>${data.name}</td>
        <td>${data.email}</td>
        <td>${data.contact}</td>
        <td>${data.age}</td>
        <td>${data.gender}</td>
        <td>${data.date}</td>
        <td>${data.time}</td>
        <td>${data.status}</td>
        <td>${data.doctor || '-'}</td>
        <td><button onclick="rescheduleAppointment('${data.docId}', '${data.date}', '${data.time}', '${data.doctor}')">Reschedule</button></td>
      `;
      tbody.appendChild(tr);
    }
  });
}

// Load Doctor Info
const doctors = {
  stephen: {
    name: "Dr. Stephen Halili",
    specialty: "Endocrinologist",
    availableDays: [1, 2], 
    availableTimeRange: { start: "08:00", end: "12:00" },
  },
  lester: {
    name: "Dr. Lester Ramirez",
    specialty: "Endocrinologist",
    availableDays: [3, 5],
    availableTimeRange: { start: "08:00", end: "12:00" },
  },
  mea: {
  name: "Dr. Mea Cabana",
  specialty: "Endocrinologist",
  availableDays: [1, 4],
  availableTimeRange: { start: "08:00", end: "12:00" },
  },
  lizton: {
    name: "Dr. Lizton Canlas",
    specialty: "Endocrinologist",
    availableDays: [3, 4], 
    availableTimeRange: { start: "08:00", end: "12:00" },
  }
};

function loadDoctor(doctorId) {
  currentEditingDoctorId = doctorId;
  const doctor = doctors[doctorId];
  if (!doctor) return;

  // Show edit section and hide main section
  document.getElementById("main-section").classList.add("hidden");
  document.getElementById("edit-section").classList.remove("hidden");

  const doctorDetails = document.getElementById("doctor-details");
  doctorDetails.innerHTML = `
    <h2>Edit Doctor - ${doctor.fullname}</h2>
    <p>Email: ${doctor.email}</p>
    <p>Specialization: ${doctor.specialization}</p>
    <p>Available Days: ${doctor.availableDays.map(day => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ")}</p>
    <p>Available Time: ${doctor.availableTimeRange?.start || ""} - ${doctor.availableTimeRange?.end || ""}</p>
  `;

  // Pre-fill form values
  document.getElementById("available-time").value = `${doctor.availableTimeRange?.start || ""} - ${doctor.availableTimeRange?.end || ""}`;
  document.querySelectorAll('.available-days input').forEach(input => {
    input.checked = doctor.availableDays.includes(parseInt(input.value));
  });
}


// Save Changes to Doctor Schedule
function saveChanges() {
  const availableTime = document.getElementById("available-time").value;
  const availableDays = Array.from(document.querySelectorAll('.available-days input:checked')).map(input => parseInt(input.value));

  const doctor = doctors[currentEditingDoctorId];
  if (!doctor) return;

  // Parse "hh:mm AM/PM - hh:mm AM/PM" format into 24-hour time
  const [start, end] = availableTime.split(" - ").map(t => {
    const [time, period] = t.trim().split(/(?<=\d{1,2}:\d{2})(?=\s?[APMapm]{2})/);
    const [hours, minutes] = time.split(":").map(Number);
    let hour = hours;
    if (/PM/i.test(period) && hour < 12) hour += 12;
    if (/AM/i.test(period) && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  });

  doctor.availableDays = availableDays;
  doctor.availableTime = availableTime; 
  doctor.availableTimeRange = { start, end };

  // Save to Firebase
  db.collection("doctors").doc(currentEditingDoctorId).set({
  availableDays,
  availableTime,
  availableTimeRange: { start, end }
}, { merge: true })
    .then(() => {
      alert("Changes saved successfully!");
      document.getElementById("edit-section").classList.add("hidden");
      document.getElementById("main-section").classList.remove("hidden");
      fetchDoctors(); // Refresh list
    })
    .catch((error) => {
      console.error("Error saving changes:", error);
      alert("Failed to save changes.");
    });
}


function timeToMinutes(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number);
  return hour * 60 + minute;
}



function rescheduleAppointment(docId, currentDate, currentTime, doctorName) {
  const appointmentDate = new Date(currentDate);
  const doctorKey = findDoctorKey(doctorName);
  const doctor = doctors[doctorKey];

  if (!doctor) {
    alert("Doctor schedule not found!");
    return;
  }

  const startMinutes = timeToMinutes(doctor.availableTimeRange.start);
  const endMinutes = timeToMinutes(doctor.availableTimeRange.end);
  const slotInterval = 60; // minutes per appointment

  const generateTimeSlots = () => {
    const slots = [];
    for (let mins = startMinutes; mins + slotInterval <= endMinutes; mins += slotInterval) {
      const hours = Math.floor(mins / 60).toString().padStart(2, '0');
      const minutes = (mins % 60).toString().padStart(2, '0');
      slots.push(`${hours}:${minutes}`);
    }
    return slots;
  };

  const findAvailableSlot = async () => {
  // Check if the current appointment is the same as today's date
  const today = new Date();
  const appointmentDate = new Date(currentDate); // Use the original appointment date
  if (appointmentDate.toDateString() === today.toDateString()) {
    alert("You cannot reschedule to the same day.");
    return null; // Prevent rescheduling to the same day
  }

  // Check within the next 30 days for available slots
  for (let daysToAdd = 1; daysToAdd <= 30; daysToAdd++) {
  const newDate = new Date(appointmentDate);
  newDate.setDate(newDate.getDate() + daysToAdd);

  // Normalize both dates to midnight for accurate comparison
  appointmentDate.setHours(0, 0, 0, 0);
  newDate.setHours(0, 0, 0, 0);

  // Prevent rescheduling to the same day
  if (newDate.getTime() === appointmentDate.getTime()) {
    continue;
  }

  const dayOfWeek = newDate.getDay();

    // Check if the doctor is available on this day
    if (!doctor.availableDays.includes(dayOfWeek)) {
      console.log(`Doctor is not available on this day: ${newDate.toISOString().split('T')[0]}`);
      continue;
    }

    // Log that the doctor is available
    console.log(`Doctor is available on: ${newDate.toISOString().split('T')[0]}`);

    const formattedDate = newDate.toISOString().split('T')[0]; // Format to YYYY-MM-DD
    const querySnapshot = await db.collection("appointments")
      .where("date", "==", formattedDate)
      .where("doctor", "==", doctor.name)
      .get();

    const bookedTimes = querySnapshot.docs.map(doc => doc.data().time);
    const availableSlots = generateTimeSlots().filter(time => !bookedTimes.includes(time));

    // Log the available slots
    console.log(`Available slots for ${formattedDate}: ${availableSlots}`);

    // If there are available slots, return the first one
    if (availableSlots.length > 0) {
      console.log(`First available slot: ${availableSlots[0]}`);
      return { 
        date: formattedDate, 
        time: availableSlots[0], 
        day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek] 
      };
    }
  }

  console.log("No available slots found within the next 30 days.");
  return null; // No available slot found within the next 30 days
};


  findAvailableSlot().then(available => {
    if (!available) {
      alert("No available schedule within the next 30 days!");
      return;
    }

    db.collection("appointments").doc(docId).update({
      date: available.date,
      time: available.time,
      status: "Rescheduled",
      day: available.day
    })
    .then(() => {
      alert(`Appointment rescheduled to ${available.date} at ${available.time}`);

      // Send an email notification using EmailJS
      const appointment = appointmentsData.find(app => app.docId === docId);
      if (appointment) {
        emailjs.send("service_techmed", "template_resched", {
          to_name: appointment.name,
          appointment_date: available.date,
          appointment_time: available.time,
          doctor_name: appointment.doctor || "Unknown",
          user_email: appointment.email,
        })
        .then((response) => {
          if (response.status === 200) {
            alert(`📧 A confirmation email has been sent to ${appointment.email}`);
          } else {
            console.error("❌ Failed to send email. Response:", response);
            alert("❌ Failed to send reschedule email.");
          }
        })
        .catch((error) => {
          console.error("❌ Error sending email:", error); // Make sure this line is detailed
          alert("Failed to reschedule appointment. Check console for error details.");
        });
      }
    })
    .catch((error) => {
      console.error("Error updating appointment:", error);
      alert("Failed to reschedule appointment.");
    });
  });
}


function findDoctorKey(name) {
  return Object.keys(doctors).find(key => doctors[key].name === name);
}

const appointmentsRef = query(ref(database, "appointments"), orderByChild("appointmentDate"));

onValue(appointmentsRef, (snapshot) => {
  const data = snapshot.val();
  appointmentTableBody.innerHTML = "";

  if (data) {
    // Convert to array
    const appointments = Object.entries(data).map(([id, appointment]) => ({
      id,
      ...appointment,
    }));
  }
});


// Helper to map doctor name to doctor key
function findDoctorKey(doctorName) {
  for (let key in doctors) {
    if (doctors[key].name === doctorName) {
      return key;
    }
  }
  return null;
}



</script>

</body>
</html>
