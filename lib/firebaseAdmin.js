// Server-side Firebase Admin init. Used by api/ functions to:
//  - verify a client's ID token (Authorization: Bearer <token>)
//  - read/write parts of the database that client security rules deny
//    (otps, apiKeys) — the Admin SDK bypasses RTDB rules entirely.
//
// Requires one env var on Vercel:
//   FIREBASE_SERVICE_ACCOUNT  -> the full service-account JSON, as one line
// and:
//   FIREBASE_DB_URL           -> e.g. https://your-project-default-rtdb.firebaseio.com
//
// Get the service account JSON from:
// Firebase Console -> Project settings -> Service accounts -> Generate new private key

const admin = require("firebase-admin");

function getAdmin() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is missing");
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DB_URL,
    });
  }
  return admin;
}

// Verifies the Firebase ID token sent by the logged-in browser client.
// Returns the decoded token (contains uid, email, etc.) or throws.
async function verifyIdToken(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    const err = new Error("Missing Authorization: Bearer <idToken> header");
    err.status = 401;
    throw err;
  }
  try {
    return await getAdmin().auth().verifyIdToken(token);
  } catch (e) {
    const err = new Error("Invalid or expired session. Please log in again.");
    err.status = 401;
    throw err;
  }
}

function db() {
  return getAdmin().database();
}

module.exports = { getAdmin, verifyIdToken, db };
