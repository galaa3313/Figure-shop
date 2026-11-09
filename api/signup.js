// Шинэ хэрэглэгч бүртгэнэ: имэйл, нэвтрэх нэр, нууц үгийг шалгаад Supabase-ээр
// имэйл рүү 6 оронтой баталгаажуулах код илгээнэ.
// Туслах функцууд
const L = require("./_lib.js");
// Supabase туслах
const SB = require("./_sb.js");

module.exports = async (req, res) => {
  // Зөвхөн POST
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  // Supabase тохируулаагүй бол
  if (!SB.ready()) return res.status(503).json({ ok: false, error: "not_configured" });
  // Нэг IP-ээс 10 минутад 5-аас олон бүртгэл оролдохыг хориглоно
  if (L.limited(req, 5)) return res.status(429).json({ ok: false, error: "too_many" });
  const b = L.body(req);
  // Утгуудыг цэвэрлэнэ
  const email = L.clip(b.email, 120).toLowerCase();
  const username = L.clip(b.username, 20).toLowerCase();
  const password = String(b.password || "");
  const phone = L.clip(b.phone, 20).replace(/[^\d+]/g, "");
  // Хувийн мэдээллийн бодлогыг зөвшөөрсөн байх ёстой
  if (b.consent !== true) return res.status(400).json({ ok: false, error: "consent" });
  // Имэйлийн хэлбэр шалгана
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false, error: "email" });
  // Нэр: 3–20 тэмдэгт, латин жижиг үсэг, тоо, _ .
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) return res.status(400).json({ ok: false, error: "username" });
  // Нууц үг: хамгийн багадаа 8 тэмдэгт, үсэг ба тоо агуулсан
  if (password.length < 8 || password.length > 72 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) return res.status(400).json({ ok: false, error: "password" });
  try {
    // Нэр эсвэл имэйл аль хэдийн бүртгэлтэй эсэхийг шалгана
    const taken = await SB.rest(`profiles?or=(username.eq.${encodeURIComponent(username)},email.eq.${encodeURIComponent(email)})&select=username,email`);
    if (taken && taken.length) return res.status(409).json({ ok: false, error: taken.some(t => t.username === username) ? "username_taken" : "email_taken" });
    // Supabase-д бүртгэнэ: тэр өөрөө имэйл рүү 6 оронтой код илгээнэ
    // Баталгаажуулах холбоос дарсны дараа үргэлж үндсэн сайт руу буцаана
    // (Vercel-ийн түр/хамгаалагдсан deployment хаяг руу биш)
    const site = (process.env.SITE_URL || "https://figure-shop-gamma.vercel.app").replace(/\/$/, "");
    const r = await fetch(`${SB.URL_()}/auth/v1/signup?redirect_to=${encodeURIComponent(site + "/")}`, {
      method: "POST", headers: { apikey: SB.ANON(), "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, data: { username, phone } })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(400).json({ ok: false, error: j.error_code || j.msg || "signup" });
    // Амжилттай: хэрэглэгч имэйлээ шалгаж кодоо оруулна
    return res.json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "server" });
  }
};
