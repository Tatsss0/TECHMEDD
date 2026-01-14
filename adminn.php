<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>TechMed — Admin Dashboard</title>
  <style>
    :root {
      --bg:#f4f7fb;
      --card:#ffffff;
      --muted:#6b7280;
      --accent:#2563eb;
      --accent-hover:#1d4ed8;
      --success:#16a34a;
      --danger:#dc2626;
    }
    * {box-sizing:border-box;margin:0;padding:0;font-family:Arial, sans-serif;}
    body {background:var(--bg);color:#111;}

    header {
      background:var(--accent);
      color:#fff;
      padding:1rem;
      text-align:center;
      font-size:1.3rem;
      font-weight:bold;
    }

    .container {
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:1.5rem;
      padding:1.5rem;
    }

    .card {
      background:var(--card);
      border-radius:12px;
      padding:1rem;
      box-shadow:0 2px 6px rgba(0,0,0,0.08);
    }

    h2 {
      font-size:1.2rem;
      margin-bottom:1rem;
      color:var(--accent);
    }

    table {width:100%;border-collapse:collapse;}
    th, td {
      padding:.6rem;
      text-align:left;
      font-size:.9rem;
      border-bottom:1px solid #eee;
    }
    th {background:#f9fafb;}

    .status {
      font-size:.8rem;
      font-weight:bold;
      padding:.2rem .6rem;
      border-radius:12px;
    }
    .available {background:var(--success);color:#fff;}
    .unavailable {background:var(--danger);color:#fff;}
    .pending {background:#facc15;color:#111;}
    .confirmed {background:var(--success);color:#fff;}
    .cancelled {background:var(--danger);color:#fff;}

    button, select {
      background:var(--accent);
      color:#fff;
      border:none;
      padding:.4rem .8rem;
      font-size:.8rem;
      border-radius:6px;
      cursor:pointer;
    }
    button:hover {background:var(--accent-hover);}
    select {
      background:#f1f5f9;
      color:#111;
      border:1px solid #ddd;
      cursor:pointer;
    }
  </style>
</head>
<body>
  <header>TechMed — Admin Dashboard</header>

  <div class="container">
    <!-- Patients Appointments -->
    <div class="card">
      <h2>Patients’ Appointments</h2>
      <table>
        <thead>
          <tr>
            <th>Patient</th>
            <th>Doctor</th>
            <th>Date</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="appointmentsTable">
          <tr>
            <td>Maria Santos</td>
            <td>Dr. Cruz</td>
            <td>Sept 23, 2025 — 10:00 AM</td>
            <td><span class="status pending">Pending</span></td>
            <td>
              <button onclick="updateStatus(this,'confirmed')">Confirm</button>
              <button onclick="updateStatus(this,'cancelled')">Cancel</button>
            </td>
          </tr>
          <tr>
            <td>Juan Dela Cruz</td>
            <td>Dr. Reyes</td>
            <td>Sept 24, 2025 — 2:00 PM</td>
            <td><span class="status confirmed">Confirmed</span></td>
            <td>
              <button onclick="updateStatus(this,'cancelled')">Cancel</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Doctors Availability -->
    <div class="card">
      <h2>Doctors’ Availability</h2>
      <table>
        <thead>
          <tr>
            <th>Doctor</th>
            <th>Specialty</th>
            <th>Schedule</th>
            <th>Status</th>
            <th>Update</th>
          </tr>
        </thead>
        <tbody id="doctorsTable">
          <tr>
            <td>Dr. Cruz</td>
            <td>Endocrinologist</td>
            <td>Mon-Fri (9:00 AM - 4:00 PM)</td>
            <td><span class="status available">Available</span></td>
            <td>
              <select onchange="changeAvailability(this)">
                <option value="available" selected>Available</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </td>
          </tr>
          <tr>
            <td>Dr. Reyes</td>
            <td>Endocrinologist</td>
            <td>Tue-Thu (1:00 PM - 5:00 PM)</td>
            <td><span class="status unavailable">Unavailable</span></td>
            <td>
              <select onchange="changeAvailability(this)">
                <option value="available">Available</option>
                <option value="unavailable" selected>Unavailable</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    // Update appointment status
    function updateStatus(button,newStatus){
      const row=button.closest("tr");
      const statusCell=row.querySelector(".status");

      if(newStatus==="confirmed"){
        statusCell.textContent="Confirmed";
        statusCell.className="status confirmed";
      } else if(newStatus==="cancelled"){
        statusCell.textContent="Cancelled";
        statusCell.className="status cancelled";
      }
    }

    // Update doctor's availability
    function changeAvailability(select){
      const row=select.closest("tr");
      const statusCell=row.querySelector(".status");
      const value=select.value;

      if(value==="available"){
        statusCell.textContent="Available";
        statusCell.className="status available";
      } else {
        statusCell.textContent="Unavailable";
        statusCell.className="status unavailable";
      }
    }
  </script>
</body>
</html>
