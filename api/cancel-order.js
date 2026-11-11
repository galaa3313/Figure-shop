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
  const b = L.body(req);
  const code = L.clip(b.code, 20);
  if (!/^AG(\d{5}|\d{6}-\d{4})$/.test(code)) return res.status(400).json({ ok: false });
  // Эрх: (1) захиалга өгөх үед сервер өгсөн цуцлах түлхүүр (зочинд), эсвэл (2) нэвтэрсэн эзэн
  const byToken = !!b.ct && L.cancelOk(L.clip(b.ct, 64), code);
  const me = await SB.userFrom(req).catch(() => null);
  if (!byToken && !me) return res.status(401).json({ ok: false, error: "login" });
  try {
    // Захиалгыг уншиж эзэн, төлвийг шалгана
    const r = await SB.rest(`orders?code=eq.${encodeURIComponent(code)}&select=code,user_id,status,name,phone,total,items`);
    const o = r && r[0];
    if (!o || (!byToken && o.user_id !== me.id)) return res.status(404).json({ ok: false, error: "not_found" });
    if (!PENDING.includes(o.status)) return res.status(409).json({ ok: false, error: "not_pending" });
    // Зөвхөн хүлээгдэж байсан үед л цуцална (давхар хамгаалалт)
    await SB.rest(`orders?code=eq.${encodeURIComponent(code)}&status=in.(${encodeURIComponent('"QPay хүлээгдэж байна","Төлбөр шалгах"')})`, { method: "PATCH", body: { status: "Цуцлагдсан" } });
    // Telegram-д мэдэгдэж, Google Sheets дээрх төлвийг "Цуцлагдсан ❌" болгоно (алдаа гарвал цуцлалтыг зогсоохгүй)
    await Promise.allSettled([
      L.telegram(`❌ Захиалагч цуцаллаа ${code}\n💰 ${L.fmt(o.total)}\n👤 ${o.name || ""} · ${o.phone || ""}\nӨмнөх төлөв: ${o.status}${o.items ? "\n\n• " + String(o.items).split("; ").join("\n• ") : ""}`),
      L.sheets({ action: "cancel", code })
    ]);
    // Админы түүхэнд бичнэ (хэрэглэгч өөрөө цуцалсан)
    try { await SB.rest("admin_log", { method: "POST", body: { actor_id: me ? me.id : null, actor: me ? me.username : "зочин", action: "cancel", entity: "order", target: code, detail: { from: o.status, name: o.name, total: o.total, by_customer: true } } }); } catch (e) {}
    return res.json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "server" });
  }
};
