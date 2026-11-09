// Нэвтрэх: имэйл ЭСВЭЛ нэвтрэх нэр + нууц үгээр. Нэрээр орвол имэйлийг сервер дээр олно
// (имэйл хаягийг гадагш задруулахгүй), дараа нь Supabase-ээс нэвтрэх токен авч буцаана.
// Туслах функцууд
const L = require("./_lib.js");
// Supabase туслах
const SB = require("./_sb.js");

module.exports = async (req, res) => {
  // Зөвхөн POST
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!SB.ready()) return res.status(503).json({ ok: false, error: "not_configured" });
  // Нууц үг таах халдлагаас: 10 минутад 10 оролдлого
  if (L.limited(req, 10)) return res.status(429).json({ ok: false, error: "too_many" });
  const b = L.body(req);
  // Имэйл эсвэл нэр
  const id = L.clip(b.id, 120).toLowerCase();
  const password = String(b.password || "").slice(0, 72);
  if (!id || !password) return res.status(400).json({ ok: false, error: "empty" });
  try {
    // "@" байвал имэйл, үгүй бол нэрээр нь имэйлийг хайна
    let email = id, profile = null;
    if (!id.includes("@")) {
      const rows = await SB.rest(`profiles?username=eq.${encodeURIComponent(id)}&select=email,blocked`);
      profile = rows && rows[0];
      // Нэр олдохгүй бол ерөнхий алдаа (нэр байгаа эсэхийг задруулахгүй)
      if (!profile) return res.status(401).json({ ok: false, error: "wrong" });
      email = profile.email;
    }
    // Supabase-ээс нууц үгээр токен авна
    const r = await fetch(`${SB.URL_()}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: SB.ANON(), "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const j = await r.json().catch(() => ({}));
    // Имэйл баталгаажаагүй бол тусгай алдаа (код оруулах цонх руу шилжүүлнэ)
    if (!r.ok) {
      const unconfirmed = /confirm/i.test(j.error_code || j.msg || j.error_description || "");
      return res.status(401).json({ ok: false, error: unconfirmed ? "unconfirmed" : "wrong", email: unconfirmed ? email : undefined });
    }
    // Хаагдсан хэрэглэгч эсэхийг шалгана
    const rows = await SB.rest(`profiles?id=eq.${encodeURIComponent(j.user.id)}&select=blocked`);
    if (rows && rows[0] && rows[0].blocked) return res.status(403).json({ ok: false, error: "blocked" });
    // Токенуудыг буцаана (сайт эдгээрээр нэвтэрсэн төлөвт орно)
    return res.json({ ok: true, access_token: j.access_token, refresh_token: j.refresh_token });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "server" });
  }
};
