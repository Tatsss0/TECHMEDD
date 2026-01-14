<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="utf-8">
  <meta content="width=device-width, initial-scale=1.0" name="viewport">
  <title>TECHMED</title>
  <link rel="manifest" href="manifest.json" />
  <meta name="theme-color" content="#2c3e50" />
  <meta http-equiv="Content-Security-Policy" content="script-src 'self';" />

  <!-- Favicons -->
  <link href="logo512.png" rel="icon">
  <link href="assets/img/apple-touch-icon.png" rel="apple-touch-icon">

  <!-- Fonts -->
  <link href="https://fonts.googleapis.com" rel="preconnect">
  <link href="https://fonts.gstatic.com" rel="preconnect" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&family=Ubuntu:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400;1,500;1,700&display=swap" rel="stylesheet">

  <!-- Vendor CSS Files -->
  <link href="assets/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet">
  <link href="assets/vendor/bootstrap-icons/bootstrap-icons.css" rel="stylesheet">
  <link href="assets/vendor/aos/aos.css" rel="stylesheet">
  <link href="assets/vendor/glightbox/css/glightbox.min.css" rel="stylesheet">
  <link href="assets/vendor/fontawesome-free/css/all.min.css" rel="stylesheet">
  <link href="assets/vendor/swiper/swiper-bundle.min.css" rel="stylesheet">

  <!-- Main CSS File -->
  <link href="assets/css/main.css" rel="stylesheet">

  <!-- =======================================================
  * Template Name: MediNest
  * Template URL: https://bootstrapmade.com/medinest-bootstrap-hospital-template/
  * Updated: Aug 11 2025 with Bootstrap v5.3.7
  * Author: BootstrapMade.com
  * License: https://bootstrapmade.com/license/
  ======================================================== -->

  
</head>

<style>
    body {
      font-family: Arial, sans-serif;
      background: #f5f7fa;
      margin: 0;
      padding: 0;
    }
    .profile-container {
      max-width: 500px;
      margin: 40px auto;
      background: #fff;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    .profile-header {
      text-align: center;
      margin-bottom: 20px;
    }
    .profile-header h2 {
      margin: 0;
      color: #2c3e50;
    }
    .profile-info {
      display: grid;
      gap: 15px;
    }
    .profile-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .profile-item label {
      font-weight: bold;
      color: #34495e;
      width: 120px;
    }
    .profile-item input,
    .profile-item select {
      flex: 1;
      padding: 6px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: #2c3e50;
    }
    .profile-item input.editable,
    .profile-item select.editable {
      border: 1px solid #ccc;
      background: #fff;
    }
    .btn {
      margin-top: 20px;
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 16px;
    }
    .edit-btn { background: #2980b9; color: white; }
    .edit-btn:hover { background: #1f6391; }
    .logout-btn { background: #e74c3c; color: white; }
    .logout-btn:hover { background: #c0392b; }
    .password-section {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
    }
    .password-section h3 {
      margin-bottom: 15px;
      color: #2c3e50;
    }
  </style>
<!---------------------------------------------------- First Section -------------------------------------------------->
<body class="index-page">

  <header id="header" class="header d-flex align-items-center fixed-top">
    <div class="container position-relative d-flex align-items-center justify-content-between">

      <a href="techmed.php" class="logo d-flex align-items-center me-auto me-xl-0">
        <!-- Uncomment the line below if you also wish to use an image logo -->
        <!-- <img src="assets/img/logo.webp" alt=""> -->
        <h1 class="sitename">TECH<span>MED</span></h1>
      </a>

      <nav id="navmenu" class="navmenu">
        <ul>
          <li><a href="techmed.php" class="active">Home</a></li>
          <li><a href="about.php">About</a></li>
          <li><a href="contact.php">Contact</a></li>
          <li><a href="doctor.php">Doctors</a></li>
          <li class="dropdown"><a href="#"><span>More Pages</span> <i class="bi bi-chevron-down toggle-dropdown"></i></a>
            <ul>
              <li><a href="department-details.html">Medical Certificate</a></li>
              <li><a href="service-details.html">E-Prescription</a></li>
              <li><a href="service-details.html">Apply to be a Doctor</a></li>

            </ul>
          </li>

          <li class="dropdown"><a href="#"><span>Account</span> <i class="bi bi-chevron-down toggle-dropdown"></i></a>
            <ul>
              <li><a>Name</a></li>
                  <li><a href="patientprofile.php">Profile</a></li>
                  <li><a href="login.php">Log Out</a></li>
            </ul>
          </li>
          
        </ul>
        <i class="mobile-nav-toggle d-xl-none bi bi-list"></i>
      </nav>

      <a class="btn-getstarted" href="#find-a-doctor">Apointment</a>

    </div>
  </header>

  <main class="main">

  <div class="profile-container">
    <div class="profile-header">
      <i class="fa-solid fa-user-circle fa-4x" style="color:#2c3e50"></i>
      <h2 id="profileName">Loading...</h2>
    </div>

    <div class="profile-info">
      <div class="profile-item">
        <label>First Name:</label> <input type="text" id="profileFirst" disabled />
      </div>
      <div class="profile-item">
        <label>Last Name:</label> <input type="text" id="profileLast" disabled />
      </div>
      <div class="profile-item">
        <label>Email:</label> <input type="email" id="profileEmail" disabled />
      </div>
      <div class="profile-item">
        <label>Phone:</label> <input type="text" id="profilePhone" disabled />
      </div>
      <div class="profile-item">
        <label>Birth Date:</label> <input type="date" id="profileBirth" disabled />
      </div>
      <div class="profile-item">
        <label>Gender:</label>
        <select id="profileGender" disabled>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </select>
      </div>
      <div class="profile-item">
        <label>Role:</label> <input type="text" id="profileRole" disabled />
      </div>
    </div>

    <button class="btn edit-btn" id="editBtn">Edit Profile</button>
    <button class="btn logout-btn" id="logoutBtn">Logout</button>

    <!-- Change Password Section -->
    <div class="password-section">
      <h3>Change Password</h3>
      <div class="profile-item">
        <label>Current Password:</label>
        <input type="password" id="currentPassword" />
      </div>
      <div class="profile-item">
        <label>New Password:</label>
        <input type="password" id="newPassword" />
      </div>
      <button class="btn edit-btn" id="changePasswordBtn">Update Password</button>

      <h3 style="margin-top:30px;">Forgot Password?</h3>
      <button class="btn edit-btn" id="resetPasswordBtn">Send Reset Link</button>
    </div>
  </div>

  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
    import { getAuth, onAuthStateChanged, signOut, reauthenticateWithCredential, updatePassword, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
    import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

    const firebaseConfig = {
      apiKey: "AIzaSyCwCjmcUTTz8S34svqAxmhHmhO8QNnz5t8",
      authDomain: "t-echmed.firebaseapp.com",
      databaseURL: "https://t-echmed-default-rtdb.firebaseio.com",
      projectId: "t-echmed",
      storageBucket: "t-echmed.appspot.com",
      messagingSenderId: "290352510024",
      appId: "1:290352510024:web:c9e2fbdec8d36f35ca547d"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getDatabase(app);

    let currentUser;

    // Load profile
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        const snapshot = await get(ref(db, "users/" + user.uid));
        if (snapshot.exists()) {
          const data = snapshot.val();
          document.getElementById("profileName").innerText = data.firstName + " " + data.lastName;
          document.getElementById("profileFirst").value = data.firstName;
          document.getElementById("profileLast").value = data.lastName;
          document.getElementById("profileEmail").value = data.email;
          document.getElementById("profilePhone").value = data.phone;
          document.getElementById("profileBirth").value = data.birthDate;
          document.getElementById("profileGender").value = data.gender;
          document.getElementById("profileRole").value = data.role;
        }
      } else {
        window.location.href = "login.php"; // redirect if not logged in
      }
    });

    // Edit / Save Profile
    const editBtn = document.getElementById("editBtn");
    editBtn.addEventListener("click", async () => {
      const inputs = document.querySelectorAll("#profileFirst, #profileLast, #profileEmail, #profilePhone, #profileBirth, #profileGender, #profileRole");

      if (editBtn.innerText === "Edit Profile") {
        inputs.forEach(el => el.disabled = false);
        editBtn.innerText = "Save Changes";
      } else {
        const updates = {
          firstName: document.getElementById("profileFirst").value,
          lastName: document.getElementById("profileLast").value,
          email: document.getElementById("profileEmail").value,
          phone: document.getElementById("profilePhone").value,
          birthDate: document.getElementById("profileBirth").value,
          gender: document.getElementById("profileGender").value,
          role: document.getElementById("profileRole").value,
        };

        await update(ref(db, "users/" + currentUser.uid), updates);

        document.getElementById("profileName").innerText = updates.firstName + " " + updates.lastName;

        inputs.forEach(el => el.disabled = true);
        editBtn.innerText = "Edit Profile";
        alert("Profile updated successfully!");
      }
    });

    // Change Password
    document.getElementById("changePasswordBtn").addEventListener("click", async () => {
      const currentPassword = document.getElementById("currentPassword").value;
      const newPassword = document.getElementById("newPassword").value;

      if (!currentPassword || !newPassword) {
        alert("Please fill out both fields.");
        return;
      }

      try {
        // Reauthenticate user
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);

        // Update password
        await updatePassword(currentUser, newPassword);

        alert("Password updated successfully!");
        document.getElementById("currentPassword").value = "";
        document.getElementById("newPassword").value = "";
      } catch (error) {
        alert("Error: " + error.message);
      }
    });

    // Logout
    document.getElementById("logoutBtn").addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "login.php";
    });
  </script>

  </main>

  <footer id="footer" class="footer position-relative">

    <div class="container footer-top">
      <div class="row gy-4">
        <div class="col-lg-4 col-md-6 footer-about">
          <a href="index.html" class="logo d-flex align-items-center">
            <span class="sitename">TECHMED</span>
          </a>
          <div class="footer-contact pt-3">
            <p>City College of Angeles</p>
            <p>Angeles City, Pampanga</p>
            <p class="mt-3"><strong>Phone:</strong> <span>+6391234567890</span></p>
            <p><strong>Email:</strong> <span>ourtechmedcompany@gmail.com</span></p>
          </div>
          <div class="social-links d-flex mt-4">
            <a href=""><i class="bi bi-twitter-x"></i></a>
            <a href=""><i class="bi bi-facebook"></i></a>
            <a href=""><i class="bi bi-instagram"></i></a>
            <a href=""><i class="bi bi-linkedin"></i></a>
          </div>
        </div>

        <div class="col-lg-2 col-md-3 footer-links">
          <h4>Useful Links</h4>
          <ul>
            <li><a href="#">Home</a></li>
            <li><a href="#">About us</a></li>
            <li><a href="#">Services</a></li>
            <li><a href="#">Terms of service</a></li>
            <li><a href="#">Privacy policy</a></li>
          </ul>
        </div>

        <div class="col-lg-2 col-md-3 footer-links">
          <h4>Our Services</h4>
          <ul>
            <li><a href="#">Web Design</a></li>
            <li><a href="#">Web Development</a></li>
            <li><a href="#">Product Management</a></li>
            <li><a href="#">Marketing</a></li>
            <li><a href="#">Graphic Design</a></li>
          </ul>
        </div>

        <div class="col-lg-2 col-md-3 footer-links">
          <h4>Hic solutasetp</h4>
          <ul>
            <li><a href="#">Molestiae accusamus iure</a></li>
            <li><a href="#">Excepturi dignissimos</a></li>
            <li><a href="#">Suscipit distinctio</a></li>
            <li><a href="#">Dilecta</a></li>
            <li><a href="#">Sit quas consectetur</a></li>
          </ul>
        </div>

        <div class="col-lg-2 col-md-3 footer-links">
          <h4>Nobis illum</h4>
          <ul>
            <li><a href="#">Ipsam</a></li>
            <li><a href="#">Laudantium dolorum</a></li>
            <li><a href="#">Dinera</a></li>
            <li><a href="#">Trodelas</a></li>
            <li><a href="#">Flexo</a></li>
          </ul>
        </div>

      </div>
    </div>

    <div class="container copyright text-center mt-4">
      <p>© <span>Copyright</span> <strong>TECHMED</strong>&nbsp;<span>All Rights Reserved</span></p>
      <div class="credits">
        <!-- All the links in the footer should remain intact. -->
        <!-- You can delete the links only if you've purchased the pro version. -->
        <!-- Licensing information: https://bootstrapmade.com/license/ -->
        <!-- Purchase the pro version with working PHP/AJAX contact form: [buy-url] -->
        Designed by <a href="">Lester Ramirez</a>
      </div>
    </div>

  </footer>

  <!-- Scroll Top -->
  <a href="#" id="scroll-top" class="scroll-top d-flex align-items-center justify-content-center"><i class="bi bi-arrow-up-short"></i></a>

  <!-- Preloader -->
  <div id="preloader"></div>

  <!-- Vendor JS Files -->
  <script src="assets/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
  <script src="assets/vendor/php-email-form/validate.js"></script>
  <script src="assets/vendor/aos/aos.js"></script>
  <script src="assets/vendor/glightbox/js/glightbox.min.js"></script>
  <script src="assets/vendor/purecounter/purecounter_vanilla.js"></script>
  <script src="assets/vendor/imagesloaded/imagesloaded.pkgd.min.js"></script>
  <script src="assets/vendor/isotope-layout/isotope.pkgd.min.js"></script>
  <script src="assets/vendor/swiper/swiper-bundle.min.js"></script>

  <!-- Main JS File -->
  <script src="assets/js/main.js"></script>

</body>

</html>