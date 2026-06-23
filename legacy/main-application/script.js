// Firebase config is loaded by the legacy HTML pages from ../../js/config/firebase-config.js.
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();

// Global State
//let html5QrCode = null;
//let scannerActive = false;

let scanner = null;
let scannerActive = false;

// --- 1. Authentication & Redirection Guard ---
auth.onAuthStateChanged((user) => {
    const currentPage = window.location.pathname.split("/").pop();

    if (user) {
        if (currentPage === "login.html" || currentPage === "signup.html" || currentPage === "") {
            window.location.href = 'welcome.html';
        }
    } else {
        if (currentPage === "qrscan.html" || currentPage === "welcome.html") {
            window.location.href = 'login.html';
        }
    }
});

// --- 2. Google Sign-In Logic ---
async function handleGoogleSignIn(response) {
    try {
        const credential = firebase.auth.GoogleAuthProvider.credential(response.credential);
        await auth.signInWithCredential(credential);
        window.location.href = 'welcome.html';
    } catch (error) {
        console.error('Google sign-in error:', error);
        alert('Error signing in with Google: ' + error.message);
    }
}

function setupGoogleButton() {
    const container = document.getElementById('google-signin-container');
    if (!container) return;

    if (typeof google === 'undefined' || !google.accounts) {
        setTimeout(setupGoogleButton, 500); 
        return;
    }

    try {
        google.accounts.id.initialize({
            client_id: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com', 
            callback: handleGoogleSignIn
        });

        google.accounts.id.renderButton(
            container,
            { theme: 'filled_blue', size: 'large', width: 300 }
        );
    } catch (error) {
        console.error('Google Button Error:', error);
    }
}

// --- 3. Page Element Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const logoutBtn = document.getElementById('logout-btn');
    const copyBtn = document.getElementById('copy-btn');

    setupGoogleButton();

    // Email/Password Login[cite: 4]
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            try {
                await auth.signInWithEmailAndPassword(email, password);
                window.location.href = 'welcome.html';
            } catch (error) {
                handleAuthError(error);
            }
        });
    }

    // Email/Password Signup[cite: 1, 3]
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signup-email').value.trim();
            const password = document.getElementById('signup-password').value;

            if (password.length < 6) {
                alert('Password must be at least 6 characters.');
                return;
            }

            try {
                await auth.createUserWithEmailAndPassword(email, password);
                alert('Account Created!');
                window.location.href = 'welcome.html';
            } catch (error) {
                handleAuthError(error);
            }
        });
    }

    // Logout Functionality[cite: 4]
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (scannerActive) await stopScanner();
            await auth.signOut();
            window.location.href = 'login.html';
        });
    }

    // Copy Result to Clipboard[cite: 4]
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const resultText = document.getElementById('scan-result').textContent;
            if (resultText && !resultText.includes("No result")) {
                navigator.clipboard.writeText(resultText).then(() => {
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = "✓ Copied!";
                    setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
                });
            }
        });
    }

    // Auto-start scanner if on qrscan page[cite: 4]
    if (window.location.pathname.includes('qrscan.html')) {
        setTimeout(initScanner, 500);
    }
});

const resumeBtn = document.getElementById('resume-btn');

// --- 4. QR Scanner Engine ---
/*async function initScanner() {
    const scanResultBox = document.getElementById('scan-result');
    if (!scanResultBox || scannerActive) return;

    try {
        html5QrCode = new Html5Qrcode("reader");
        const config = { 
            fps: 15, // Higher FPS for smoother detection
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0 
        };

        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                // Success: Stop scanner and show results
                stopScanner(); 
                scanResultBox.textContent = "Redirecting to Kiosk...";
                scanResultBox.classList.add('success-glow'); // Add a visual cue
                
                window.location.href = `service.html?kioskid=${encodeURIComponent(decodedText)}`;
            },
            (errorMessage) => {
                // Optional: handle scan failures silently or log them
            }
        );
        scannerActive = true;
        scanResultBox.textContent = "📷 Positioning QR code...";
    } catch (err) {
        scanResultBox.textContent = "❌ Camera Error: " + err.message;
    }
}

// Logic for the Scan Again button
if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
        document.getElementById('scan-result').textContent = "No result yet";
        document.getElementById('scan-result').classList.remove('success-glow');
        resumeBtn.classList.add('hidden');
        document.getElementById('copy-btn').classList.add('hidden');
        initScanner();
    });
}
    */
   async function initScanner() {
    const scanResultBox = document.getElementById('scan-result');
    const video = document.getElementById('reader');

    if (!scanResultBox || scannerActive) return;

    try {

        scanner = new QrScanner(
            video,
            (result) => {

                scanner.stop();
                scannerActive = false;

                scanResultBox.textContent = "Redirecting to Kiosk...";
                scanResultBox.classList.add('success-glow');

                const qrData = result.data || result;

                setTimeout(() => {
                    window.location.href =
                       // `service.html?kioskid=${encodeURIComponent(qrData)}`;
                       `service.html?orgId=${encodeURIComponent(qrData)}&kioskId=WALK_IN`;
                }, 500);
            },
            {
                preferredCamera: 'environment',
                highlightScanRegion: true,
                highlightCodeOutline: true,
                returnDetailedScanResult: true,
            }
        );

        await scanner.start();

        scannerActive = true;

        scanResultBox.textContent =
            "📷 Position QR code inside the frame";

    } catch (err) {

        console.error(err);

        scanResultBox.textContent =
            "❌ Camera Error: " + err.message;
    }
}

/*async function stopScanner() {
    if (html5QrCode && scannerActive) {
        await html5QrCode.stop();
        html5QrCode.clear();
        scannerActive = false;
    }
}
*/

async function stopScanner() {

    if (scanner) {

        await scanner.stop();

        scannerActive = false;
    }
}
// --- 5. Error Helper ---
function handleAuthError(error) {
    if (error.code === 'auth/user-not-found') alert('No account found with this email.');
    else if (error.code === 'auth/wrong-password') alert('Incorrect password.');
    else if (error.code === 'auth/email-already-in-use') alert('Email already registered.');
    else alert('Error: ' + error.message);
}

// Pause/Resume scanner on tab switch
document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopScanner();
    else if (window.location.pathname.includes('qrscan.html')) initScanner();
});
