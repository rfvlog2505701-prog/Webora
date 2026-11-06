// Thin authenticated client for Webora's server APIs.
import { auth } from "/assets/firebase-client.js";

async function token() {
  const u = auth.currentUser;
  if (!u) { const e = new Error("You are signed out. Please log in again."); e.status = 401; throw e; }
  return u.getIdToken();
}
async function send(url, opts, timeoutMs = 60000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try { res = await fetch(url, { ...opts, signal: ctrl.signal }); }
  catch (e) { const err = new Error(e.name === "AbortError" ? "The request timed out." : "Network problem — check your connection."); err.network = true; throw err; }
  finally { clearTimeout(t); }
  let data = {}; try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) { const err = new Error(data.error || `Request failed (${res.status}).`); err.status = res.status; err.data = data; throw err; }
  return data;
}
export async function api(action, body = {}) {
  return send("/api/projects", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await token()) }, body: JSON.stringify({ action, ...body }) }, 45000);
}
export async function aiGenerate(prompt, existing) {
  return send("/api/ai", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await token()) }, body: JSON.stringify({ prompt, existing }) }, 70000);
}
export async function analytics(params) {
  const q = new URLSearchParams(params).toString();
  return send("/api/analytics?" + q, { headers: { Authorization: "Bearer " + (await token()) } }, 30000);
}
export function requireUser(onUser, redirectTo) {
  return import("/assets/firebase-client.js").then(({ auth, onAuthStateChanged }) => onAuthStateChanged(auth, (u) => {
    if (!u) return (location.href = "/login.html?next=" + encodeURIComponent(redirectTo || location.pathname + location.search));
    onUser(u);
  }));
}
