// Firebase client SDK. The config is NOT hard-coded: it is fetched from
// /api/config, which reads the FIREBASE_* environment variables set in
// Vercel -> Project Settings -> Environment Variables.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, get, remove, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const cfg = await fetch("/api/config").then((r) => r.json());
if (!cfg.apiKey) throw new Error("Firebase env vars are missing on the server.");

const app = initializeApp(cfg);
const auth = getAuth(app);
const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

export {
  app, auth, db, googleProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, ref, set, get, remove, update,
};
