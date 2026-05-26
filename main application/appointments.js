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

// Initialize Firebase safely
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

document.addEventListener('DOMContentLoaded', () => {
    const spinner = document.getElementById('loading-spinner');
    const organizationsList = document.getElementById('organizations-list');
    const noServicesMsg = document.getElementById('no-services');

    // Get the Organization ID from the URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const targetOrgId = urlParams.get('orgId'); 

    // Listen for Auth State
    auth.onAuthStateChanged((user) => {
        if (user) {
            console.log(`Logged In Customer UID: ${user.uid}`);
            
            if (targetOrgId) {
                // Method 1: If a single specific orgId is requested in the URL, load only that one
                loadSingleOrgServices(targetOrgId);
            } else {
                // Method 2: Global scan - fetch and compile online services from ALL business nodes
                console.log("No specific 'orgId' parameter in URL. Fetching all available online services...");
                loadAllGlobalOnlineServices();
            }
        } else {
            window.location.href = 'login.html';
        }
    });

    // NEW METHOD: Scans ALL users and aggregates ALL online appointments seamlessly
    function loadAllGlobalOnlineServices() {
        const usersRef = db.ref('users');

        usersRef.on('value', (snapshot) => {
            if (spinner) spinner.style.display = 'none';
            organizationsList.innerHTML = '';

            if (snapshot.exists()) {
                const allUsers = snapshot.val();
                const globalOnlineServices = [];

                // Loop through every user node safely
                Object.keys(allUsers).forEach((orgId) => {
                    const userNode = allUsers[orgId];
                    
                    // Check if this user has any services setup
                    if (userNode.services) {
                        Object.keys(userNode.services).forEach((serviceId) => {
                            const service = userNode.services[serviceId];
                            const serviceName = service.name || "Unnamed Service";

                            // Match rules for identifying online appointments
                            const isOnlineAppointment = serviceName.toLowerCase().includes("online") || 
                                                        
                                                        service.isOnline;

                            if (isOnlineAppointment) {
                                globalOnlineServices.push({
                                    id: service.id || serviceId,
                                    name: serviceName,
                                    description: service.description || "Book an appointment online",
                                    orgId: orgId, // CRITICAL: Saved from the loop so booking goes to the right owner!
                                    status: service.status || 'available',
                                    category: service.category || 'Appointment',
                                    isOnlineAppointment: true
                                });
                            }
                        });
                    }
                });

                if (globalOnlineServices.length > 0) {
                    if (noServicesMsg) noServicesMsg.classList.add('hidden');
                    renderOnlineServices(globalOnlineServices);
                } else {
                    if (noServicesMsg) noServicesMsg.classList.remove('hidden');
                }
            } else {
                if (noServicesMsg) noServicesMsg.classList.remove('hidden');
            }
        }, (error) => {
            console.error("Global fetch error:", error);
            if (spinner) spinner.style.display = 'none';
            organizationsList.innerHTML = '<p class="error">⚠️ Unable to load appointments. Please check permissions.</p>';
        });
    }

   

    function renderOnlineServices(services) {
        const container = document.getElementById('organizations-list');
        container.innerHTML = '';

        services.forEach((service) => {
            const card = document.createElement('div');
            card.className = 'service-card-modern glass-effect';
            card.style.cursor = 'pointer';
            card.style.transition = 'transform 0.2s ease, border-color 0.2s ease';

            card.innerHTML = `
                <div class="card-body">
                    <div class="card-header-row">
                        <div>
                            <h3 class="service-title">${escapeHtml(service.name)}</h3>
                            <p class="service-id-text">📅 Online Appointment</p>
                        </div>
                        <span class="service-tag" style="background: rgba(16, 185, 129, 0.2); color: #10b981;">✓ Available</span>
                    </div>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0.75rem 0 0 0;">
                        ${escapeHtml(service.description)}
                    </p>
                </div>
                <div class="card-actions">
                    <button class="open-service-btn">Book Appointment Now</button>
                </div>
            `;

            card.querySelector('.open-service-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                bookService(service.id, service.name, service.orgId);
            });

            // Hover effect
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-4px)';
                card.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
                card.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            });

            container.appendChild(card);
        });
    }

    // Book a service - redirect to token page
    window.bookService = function (serviceId, serviceName, orgId) {
        const user = firebase.auth().currentUser;
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        const params = new URLSearchParams({
            orgId: orgId,
            serviceId: serviceId,
            serviceName: serviceName, 
            kioskId: 'ONLINE',
            bookingType: 'online'
        });

        window.location.href = 'bookAppointment.html?' + params.toString();
    };

    // Helper function to escape HTML string inputs safely
    function escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
});