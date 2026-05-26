// --- Firebase Config (Ensure this matches your script.js) ---
/*const firebaseConfig = {
    apiKey: "AIzaSyA0RZ_9PjrRMjcGoYUvEKlZeGtGQbDbBEg",
    authDomain: "queue-manage-653af.firebaseapp.com",
    projectId: "queue-manage-653af",
    databaseURL: "https://queue-manage-653af-default-rtdb.firebaseio.com/", // Ensure this is present
    storageBucket: "queue-manage-653af.firebasestorage.app",
    messagingSenderId: "327457406558",
    appId: "1:327457406558:web:c6d71a24bb7485e5e0fecf"
};*/
const firebaseConfig = {

    apiKey: "AIzaSyDQF6Ax8-96AKns_8XpgM-MDrtaVDc78CU",
    authDomain: "ecosystem-e703c.firebaseapp.com",
    databaseURL: "https://ecosystem-e703c-default-rtdb.firebaseio.com",
    projectId: "ecosystem-e703c",
    storageBucket: "ecosystem-e703c.firebasestorage.app",
    messagingSenderId: "127085232481",
    appId: "1:127085232481:web:edc94cfe0b5a86d8a40520",
    measurementId: "G-6FNBEKNFSQ"
}

// Initialize
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

document.addEventListener('DOMContentLoaded', () => {
    // 1. Get Kiosk ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const kioskId = urlParams.get('kioskid') || 'WALK_IN'; // Default to WALK_IN if not provided
    const orgId = urlParams.get('orgId') || urlParams.get('kioskid');
    const display = document.getElementById('kiosk-display');
    const servicesGrid = document.getElementById('services-list');
    const spinner = document.getElementById('loading-spinner');

    /* if (!kioskId) {
         alert("Invalid Kiosk Access!");
         window.location.href = 'qrscan.html';
         return;
     }*/

    if (!orgId) {
        alert("Invalid QR Code Scanned!");
        window.location.href = 'qrscan.html';
        return;
    }

    // display.textContent = `Kiosk ID: ${kioskId}`;
    display.textContent = `Organization ID: ${orgId}`;

    // 2. Listen for Auth State
    auth.onAuthStateChanged((user) => {
        if (user) {
            // Display user UID
            console.log(`User UID: ${user.uid}`);
            //display.textContent = ` KIOSK UID: ${user.uid}`;
            // loadKioskServices(user.uid, kioskId);
            loadOrganizationServices(orgId, kioskId);
        } else {
            window.location.href = 'login.html';
        }
    });

    function loadOrganizationServices(organizationId, kid) {
        // Fetch services from the Organization's database node
        const servicesRef = db.ref(`users/${organizationId}/services`);

        servicesRef.on('value', (snapshot) => {
            spinner.style.display = 'none';
            servicesGrid.innerHTML = ''; // Clear existing

            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {

                    const childData = childSnapshot.val();
                    const childKey = childSnapshot.key;
                    const service = {
                        id: childData.id || childKey,
                        name: childData.name || "Unnamed Service"
                    };
                    renderServiceCard(service, organizationId, kid);
                });
            } else {
                servicesGrid.innerHTML = '<p class="error">No services available for this organization right now.</p>';
            }
        }, (error) => {
            console.error("Database Error:", error);
            servicesGrid.innerHTML = '<p class="error">Access Denied. Check Firebase Rules.</p>';
        });
    }

    async function loadKioskServices(uid, kid) {
        // Path matches your JSON Rules: users/$uid/kiosks/$kioskId/services
        const servicesRef = db.ref(`users/${uid}/services`);

        servicesRef.on('value', (snapshot) => {
            spinner.style.display = 'none';
            servicesGrid.innerHTML = ''; // Clear existing

            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    const service = childSnapshot.val();
                    renderServiceCard(service);
                });
            } else {
                servicesGrid.innerHTML = '<p class="error">No services available for this kiosk.</p>';
            }
        }, (error) => {
            console.error("Database Error:", error);
            servicesGrid.innerHTML = '<p class="error">Access Denied. Check your Firebase Rules.</p>';
        });
    }

  function renderServiceCard(service, organizationId, kid) {
    const card = document.createElement('div');
    card.className = 'service-card-modern glass-effect';
    card.innerHTML = `
        <div class="card-body">
            <div class="card-header-row">
                <h3 class="service-title">${service.name}</h3>
                
            </div>
           
        </div>
        <div class="card-actions">
            <button onclick="requestToken('${service.id}', '${service.name}', '${organizationId}', '${kid}')" class="open-service-btn">
                Get Token
            </button>
        </div>
    `;
    servicesGrid.appendChild(card);
}
});

// Global function to handle token generation
window.requestToken = function (serviceId, serviceName, orgId, kioskId) {
    const user = firebase.auth().currentUser;
    if (!user) { window.location.href = 'login.html'; return; }

    const params = new URLSearchParams({
        orgId: orgId,
        serviceId: serviceId,
        serviceName: serviceName, // Added to URL parameters
        kioskId: kioskId,
    });

    window.location.href = 'token.html?' + params.toString();
};
/*function requestToken(serviceId) {
    // orgId = the logged-in user's UID (the organisation that owns this kiosk)
    const user = firebase.auth().currentUser;
    if (!user) { window.location.href = 'login.html'; return; }

    const urlParams = new URLSearchParams(window.location.search);
    const kioskId   = urlParams.get('kioskid') || 'WALK_IN';

    const params = new URLSearchParams({
       orgId:     user.uid,
      
        serviceId: serviceId,
        kioskId:   kioskId,
    });

    window.location.href = 'token.html?' + params.toString();
};*/