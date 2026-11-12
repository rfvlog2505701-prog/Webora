import { auth, db, ref, set, googleProvider, signInWithPopup, onAuthStateChanged } from "/assets/firebase-client.js";
import { hideLoader } from "/assets/layout.js";

export function goNext() {
  const n = new URLSearchParams(location.search).get("next");
  location.href = n && n.startsWith("/") ? n : "/app/dashboard";
}
export async function saveProfile(user, provider) {
  await set(ref(db, `users/${user.uid}/profile`), {
    email: user.email || null, displayName: user.displayName || null, provider, createdAt: Date.now(),
  }).catch(() => {});
}
export function redirectIfLoggedIn() {
  onAuthStateChanged(auth, (u) => { hideLoader(); if (u) goNext(); });
}
export async function googleLogin() {
  const cred = await signInWithPopup(auth, googleProvider);
  await saveProfile(cred.user, "google");
  goNext();
}
