const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const uid = process.argv[2] || 'tcWCQtILJNcahfAQA3qakrUP9Nv1';
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!serviceAccountPath) {
  console.error('Missing GOOGLE_APPLICATION_CREDENTIALS environment variable.');
  process.exit(1);
}

const absolutePath = path.resolve(serviceAccountPath);
if (!fs.existsSync(absolutePath)) {
  console.error('Service account file not found at:', absolutePath);
  process.exit(1);
}

const serviceAccount = require(absolutePath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

admin
  .auth()
  .setCustomUserClaims(uid, { superadmin: true, admin: true })
  .then(async () => {
    console.log('Custom claims applied for UID:', uid);
    const user = await admin.auth().getUser(uid);
    console.log('Current custom claims:', user.customClaims || {});
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed to set claims:', err.message);
    process.exit(1);
  });
