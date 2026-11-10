// Хэрэглэгч өөрийн ТӨЛӨГДӨӨГҮЙ захиалгаа цуцлах (жагсаалтаасаа хасах).
// Зөвхөн нэвтэрсэн хэрэглэгч, зөвхөн өөрийн захиалга, зөвхөн хүлээгдэж буй төлөвтэй үед.
// Туслах функцууд
const L = require("./_lib.js");
// Supabase туслах
const SB = require("./_sb.js");
// Цуцалж болох төлвүүд (төлбөр ороогүй)
const PENDING = ["QPay хүлээгдэж байна", "Төлбөр шалгах"];

module.exports = async (req, res) => {
  // Зөвхөн POST
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!SB.ready()) return res.status(503).json({ ok: false, error: "not_configured" });
  // Нэг IP-ээс хэт олон удаа дуудахаас сэргийлнэ
  if (L.limited(req, 20)) return res.status(429).json({ ok: false, error: "too_many" });
  // Хэн болохыг токеноос шалгана
  const me = await SB.userFrom(req).catch(() => null);
  if (!me) return res.status(401).json({ ok: false, error: "login" });
  const code = L.clip(L.body(req).code, 20);
  if (!/^AG(\d{5}|\d{6}-\d{4})$/.test(code)) return res.status(400).json({ ok: false });
  try {
    // Захиалгыг уншиж эзэн, төлвийг шалгана
    const r = await SB.rest(`orders?code=eq.${encodeURIComponent(code)}&select=code,user_id,status,name,total`);
    const o = r && r[0];
    if (!o || o.user_id !== me.id) return res.status(404).json({ ok: false, error: "not_found" });
    if (!PENDING.includes(o.status)) return res.status(409).json({ ok: false, error: "not_pending" });
    // Зөвхөн хүлээгдэж байсан үед л цуцална (давхар хамгаалалт)
    await SB.rest(`orders?code=eq.${encodeURIComponent(code)}&status=in.(${encodeURIComponent('"QPay хүлээгдэж байна","Төлбөр шалгах"')})`, { method: "PATCH", body: { status: "Цуцлагдсан" } });
    // Админы түүхэнд бичнэ (хэрэглэгч өөрөө цуцалсан)
    try { await SB.rest("admin_log", { method: "POST", body: { actor_id: me.id, actor: me.username, action: "cancel", entity: "order", target: code, detail: { from: o.status, name: o.name, total: o.total, by_customer: true } } }); } catch (e) {}
    return res.json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "server" });
  }
};
