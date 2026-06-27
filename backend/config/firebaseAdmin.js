const admin = require('firebase-admin');

let db;

try {
  if (admin.apps.length === 0) {
    let serviceAccount;
    
    // Use environment variable if available, otherwise use serviceAccountKey.json
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else {
      serviceAccount = require('../serviceAccountKey.json');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin initialized successfully.');
  }
  
  db = admin.firestore();
} catch (err) {
  console.error("Firebase Admin initialization error:", err.message);
}

module.exports = { admin, db };

