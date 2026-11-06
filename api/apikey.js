const crypto = require("crypto");
const { verifyIdToken, db } = require("../lib/firebaseAdmin");

function genKey() {
  return "wbk_" + crypto.randomBytes(24).toString("hex");
}

module.exports = async (req, res) => {
  let user;
  try {
    user = await verifyIdToken(req);
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  const uid = user.uid;
  const userKeyRef = db().ref(`users/${uid}/apiKey`);

  try {
    if (req.method === "GET") {
      const key = (await userKeyRef.get()).val();
      return res.status(200).json({ apiKey: key || null });
    }

    if (req.method === "POST") {
      // revoke any previous key's lookup record first
      const old = (await userKeyRef.get()).val();
      if (old) await db().ref(`apiKeys/${old}`).remove();

      const key = genKey();
      await db().ref(`apiKeys/${key}`).set({ uid, createdAt: Date.now() });
      await userKeyRef.set(key);

      return res.status(200).json({ apiKey: key });
    }

    if (req.method === "DELETE") {
      const old = (await userKeyRef.get()).val();
      if (old) await db().ref(`apiKeys/${old}`).remove();
      await userKeyRef.remove();
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "GET, POST or DELETE only" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "API key operation failed." });
  }
};
