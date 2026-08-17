import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

if (!admin.apps.length) {
  try {
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else {
      // Read local JSON file safely in ES Module context
      const keyPath = resolve('serviceAccountKey.json');
      serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
    }

    admin.initializeApp({ 
      credential: admin.credential.cert(serviceAccount) 
    });

    console.log('Firebase Admin initialized successfully.');

  } catch (err) {
    console.error('Firebase Admin initialization error:', err.message);
    throw new Error(`Failed to initialize Firebase Admin: ${err.message}`);
  }
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// Exports both named (db, admin) and a default export for flexibility
export { admin, db };
export default admin;