// FINN Fit — серверийн туслах функцууд (гишүүнчлэл идэвхжүүлэх, хөнгөлөлт).
// "_"-ээр эхэлсэн тул гаднаас хаяг болж нээгдэхгүй.
// Supabase туслах
const SB = require("./_sb.js");
// Ерөнхий туслах (Telegram, мөнгөн дүн)
const L = require("./_lib.js");

// Төлбөрийн дугаар: FT + ЖЖССӨӨ + "-" + 4 санамсаргүй орон (жишээ: FT261112-4821)
function newCode() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = n => String(n).padStart(2, "0");
  return `FT${String(d.getUTCFullYear()).slice(2)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${String(Math.floor(1000 + Math.random() * 9000))}`;
}

// Нэг төлбөрийг уншина
async function payment(code) {
  if (!/^FT\d{6}-\d{4}$/.test(code)) return null;
  const r = await SB.rest(`fit_payments?code=eq.${encodeURIComponent(code)}&select=*`);
  return r && r[0] || null;
}

// Гишүүний одоогийн багц ба дэлгүүрийн хөнгөлөлт (%) — гишүүн биш бол 0
async function discount(userId) {
  if (!userId || !SB.ready()) return 0;
  try {
    const [m, c] = await Promise.all([
      SB.rest(`fit_members?user_id=eq.${encodeURIComponent(userId)}&until=gt.${encodeURIComponent(new Date().toISOString())}&select=tier`),
      SB.rest("fit_config?id=eq.1&select=member_disc,vip_disc")
    ]);
    const tier = m && m[0] && m[0].tier, cfg = (c && c[0]) || { member_disc: 0, vip_disc: 0 };
    if (!tier) return 0;
    return Math.max(0, Math.min(50, Number(tier === "vip" ? cfg.vip_disc : cfg.member_disc) || 0));
  } catch (e) { return 0; }   // Fit хүснэгт байхгүй (SQL ажиллуулаагүй) бол хөнгөлөлтгүй
}

// Төлөгдсөн төлбөрийг идэвхжүүлнэ: гишүүнчлэлийг сунгах эсвэл сорилтод нэгтгэх.
// Нэг төлбөрийг ХОЁР удаа идэвхжүүлэхгүй (зөвхөн pending → paid шилжилт хийгдсэн үед ажиллана).
async function activate(p, paidAmount) {
  // Дутуу төлсөн бол идэвхжүүлэхгүй, танд анхааруулна
  if (Number(paidAmount) < Number(p.amount)) {
    await L.telegram(`⚠️ FINN Fit сэжигтэй төлбөр ${p.code}\nТөлсөн: ${L.fmt(paidAmount)} · Дүн: ${L.fmt(p.amount)}\nИДЭВХЖҮҮЛЭЭГҮЙ — QPay-ээс шалгана уу.`).catch(() => {});
    return false;
  }
  // pending → paid (өөр хүсэлт аль хэдийн шилжүүлсэн бол хоосон буцна)
  const upd = await SB.rest(`fit_payments?code=eq.${encodeURIComponent(p.code)}&status=eq.pending`,
    { method: "PATCH", body: { status: "paid", paid_at: new Date().toISOString() }, prefer: "return=representation" });
  if (!upd || !upd.length) return true;
  // Хэрэглэгчийн нэр (мэдэгдэлд)
  const pr = await SB.rest(`profiles?id=eq.${p.user_id}&select=username`).catch(() => null);
  const who = pr && pr[0] ? pr[0].username : "";
  if (p.kind === "member") {
    // Одоогийн гишүүнчлэл: хугацаа дуусаагүй бол түүний араас нэмнэ, VIP-ийг бууруулахгүй
    const cur = await SB.rest(`fit_members?user_id=eq.${p.user_id}&select=tier,until`);
    const c = cur && cur[0], now = Date.now();
    const active = c && new Date(c.until).getTime() > now;
    const base = active ? new Date(c.until).getTime() : now;
    const until = new Date(base); until.setMonth(until.getMonth() + Number(p.months || 1));
    const tier = active && c.tier === "vip" ? "vip" : p.tier;
    await SB.rest("fit_members?on_conflict=user_id", { method: "POST", prefer: "resolution=merge-duplicates",
      body: { user_id: p.user_id, tier, until: until.toISOString(), updated_at: new Date().toISOString() } });
    await L.telegram(`💪 FINN Fit гишүүнчлэл\n👤 ${who}\n${tier === "vip" ? "VIP" : "Гишүүн"} · ${p.months} сар · ${L.fmt(p.amount)}\n${until.toISOString().slice(0, 10)} хүртэл`).catch(() => {});
  } else if (p.kind === "challenge") {
    await SB.rest("fit_challenge_members?on_conflict=challenge_id,user_id", { method: "POST", prefer: "resolution=ignore-duplicates",
      body: { challenge_id: p.challenge_id, user_id: p.user_id } });
    await L.telegram(`🏁 Сорилтод нэгдлээ\n👤 ${who} · ${L.fmt(p.amount)}`).catch(() => {});
  }
  return true;
}

module.exports = { newCode, payment, discount, activate };
