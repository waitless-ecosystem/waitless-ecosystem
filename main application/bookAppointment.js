// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "AIzaSyDQF6Ax8-96AKns_8XpgM-MDrtaVDc78CU",
    authDomain: "ecosystem-e703c.firebaseapp.com",
    databaseURL: "https://ecosystem-e703c-default-rtdb.firebaseio.com",
    projectId: "ecosystem-e703c",
    storageBucket: "ecosystem-e703c.firebasestorage.app",
    messagingSenderId: "127085232481",
    appId: "1:127085232481:web:edc94cfe0b5a86d8a40520",
    measurementId: "G-6FNBEKNFSQ"
};

// Initialize Firebase
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

document.addEventListener('DOMContentLoaded', () => {
    const bookingForm = document.getElementById('appointment-form');
    const spinner = document.getElementById('booking-spinner');
    const serviceDisplay = document.getElementById('service-display-name');

    // Extract booking params routed from appointments.html
    const urlParams = new URLSearchParams(window.location.search);
    const orgId = urlParams.get('orgId');
    const serviceId = urlParams.get('serviceId');
    const serviceName = urlParams.get('serviceName') || "Online Appointment";

    if (!orgId || !serviceId) {
        alert("⚠️ Invalid booking session parameters. Returning to main directory.");
        window.location.href = 'appointments.html';
        return;
    }

    // Render targeted booking context text header
    serviceDisplay.textContent = `Booking for: ${serviceName}`;

    // Verify authentication and prefill fields if available
    auth.onAuthStateChanged((user) => {
        if (user) {
            if (spinner) spinner.style.display = 'none';
            bookingForm.style.display = 'block';

            // Autofill profile properties from auth object to reduce manual inputs
            if (user.displayName) document.getElementById('customer-name').value = user.displayName;
            if (user.email) document.getElementById('customer-email').value = user.email;
            if (user.phoneNumber) document.getElementById('customer-phone').value = user.phoneNumber;
            
            // Limit date field selections starting minimum from today onwards
            document.getElementById('appointment-date').min = new Date().toISOString().split('T')[0];
        } else {
            window.location.href = 'login.html';
        }
    });

    // Handle form submission logic
    bookingForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const nameValue = document.getElementById('customer-name').value.trim();
        const phoneValue = document.getElementById('customer-phone').value.trim();
        const emailValue = document.getElementById('customer-email').value.trim();
        const dateValue = document.getElementById('appointment-date').value;
        const timeValue = document.getElementById('appointment-time').value;

        // Create a unique appointment ID reference node under the specific organization
        const orgAppointmentsRef = db.ref(`users/${orgId}/onlineAppointments`).push();
        const appointmentId = orgAppointmentsRef.key;

        // Construct the custom payload requested
        const appointmentData = {
            appointmentId: appointmentId,
            customerId: currentUser.uid, // Logged-in person's UID
            customerName: nameValue,
            mobileNumber: phoneValue,
            email: emailValue,
            appointmentDate: dateValue,
            appointmentTime: timeValue
        };

        // Save strictly under the organization's node path
        orgAppointmentsRef.set(appointmentData)
            .then(() => {
                alert("🎉 Appointment Booked Successfully!");
                // Redirect back to the main appointments overview directory
                window.location.href = 'appointments.html';
            })
            .catch((error) => {
                console.error("Booking submit error:", error);
                alert(`⚠️ Database error: ${error.message}`);
            });
    });
});