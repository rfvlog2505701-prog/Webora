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
export async function aiGenerate(prompt, existing, image) {
  return send("/api/ai", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await token()) }, body: JSON.stringify({ prompt, existing, image }) }, 290000);
}

// Streams the AI generator's response via SSE so the UI can show real
// progress instead of a fake timer. onEvent receives { type: "delta"|"done"|"error", ... }.
// Can't use the native EventSource here (it can't send an Authorization
// header or a POST body), so this parses the "data: ...\n\n" frames by hand
// from fetch's own streaming body.
export async function aiGenerateStream(prompt, existing, onEvent, image) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 290000);
  let res;
  try {
    res = await fetch("/api/ai", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: "Bearer " + (await token()) },
      body: JSON.stringify({ prompt, existing, image, stream: true }),
    });
  } catch (e) {
    clearTimeout(timeout);
    throw new Error(e.name === "AbortError" ? "The request timed out." : "Network problem — check your connection.");
  }
  if (!res.ok || !res.body || !/text\/event-stream/.test(res.headers.get("content-type") || "")) {
    clearTimeout(timeout);
    let data = {}; try { data = await res.json(); } catch (e) { /* ignore */ }
    const err = new Error(data.error || `Request failed (${res.status}).`); err.status = res.status; throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finalResult = null, finalError = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        let evt; try { evt = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
        if (evt.type === "done") finalResult = evt;
        else if (evt.type === "error") finalError = evt;
        onEvent(evt);
      }
    }
  } finally { clearTimeout(timeout); }
  if (finalError) { const e = new Error(finalError.message || "Generation failed."); e.status = finalError.status; throw e; }
  if (!finalResult) throw new Error("The connection closed before the AI finished. Please retry.");
  return finalResult;
}
export async function analytics(params) {
  const q = new URLSearchParams(params).toString();
  return send("/api/analytics?" + q, { headers: { Authorization: "Bearer " + (await token()) } }, 30000);
}
export function requireUser(onUser, redirectTo) {
  return import("/assets/firebase-client.js").then(({ auth, onAuthStateChanged }) => onAuthStateChanged(auth, (u) => {
    if (!u) return (location.href = "/auth/login?next=" + encodeURIComponent(redirectTo || location.pathname + location.search));
    onUser(u);
  }));
}
