// Verifies the OTP code against CloudNest. CloudNest is the source of
// truth for whether a code matches/expired/was already used — we just
// relay its answer.

const CLOUDNEST_BASE = process.env.CLOUDNEST_BASE_URL || "https://cloudnest.pythonanywhere.com";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const apiKey = process.env.CLOUDNEST_API_KEY;
    if (!apiKey) throw new Error("CLOUDNEST_API_KEY env var is missing");

    const { email, code, otp } = req.body || {};
    const clean = String(email || "").trim().toLowerCase();
    const otpValue = String(otp ?? code ?? "").trim();
    if (!clean || !otpValue) return res.status(400).json({ error: "Email and code are required." });

    const r = await fetch(`${CLOUDNEST_BASE}/api/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, email: clean, otp: otpValue }),
    });
    const j = await r.json().catch(() => ({}));

    if (!r.ok || j.success === false || j.verified === false) {
      return res.status(r.ok ? 400 : r.status).json({ error: j.error || j.message || "Incorrect or expired code." });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Verification failed." });
  }
};
