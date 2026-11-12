// FINN Fit — гишүүнчлэл эсвэл сорилтын элсэлтийн QPay нэхэмжлэх үүсгэнэ.
// Үнийг ЗӨВХӨН мэдээллийн сангаас уншина (сайтаас ирсэн үнэд итгэхгүй).
// Туслах функцууд
const L = require("./_lib.js");
const SB = require("./_sb.js");
const F = require("./_fit.js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!L.qpayReady() || !SB.ready()) return res.status(503).json({ ok: false, error: "not_configured" });
  // Нэг хаягаас 10 минутад 10 хүртэл
  if (L.limited(req, 10)) return res.status(429).json({ ok: false, error: "too_many" });
  // Заавал нэвтэрсэн байна (гишүүнчлэл хүнд холбогдоно)
  const me = await SB.userFrom(req).catch(() => null);
  if (!me) return res.status(401).json({ ok: false, error: "login" });
  const b = L.body(req);
  try {
    let row;
    if (b.kind === "member") {
      // Багц ба хугацаагаар үнийг олно
      const tier = b.tier === "vip" ? "vip" : "member", months = Number(b.months);
      const pl = await SB.rest(`fit_plans?tier=eq.${tier}&months=eq.${months}&active=eq.true&select=price`);
      if (!pl || !pl[0]) return res.status(400).json({ ok: false, error: "plan" });
      row = { kind: "member", tier, months, amount: pl[0].price };
    } else if (b.kind === "challenge") {
      const id = Number(b.id);
      const c = await SB.rest(`fit_challenges?id=eq.${id}&active=eq.true&select=id,fee,starts_on,days`);
      const ch = c && c[0];
      if (!ch || !(ch.fee > 0)) return res.status(400).json({ ok: false, error: "challenge" });
      // Дууссан сорилтод элсүүлэхгүй
      const end = new Date(ch.starts_on + "T00:00:00+08:00").getTime() + ch.days * 864e5;
      if (Date.now() > end) return res.status(409).json({ ok: false, error: "ended" });
      // Аль хэдийн нэгдсэн бол дахин төлүүлэхгүй
      const j = await SB.rest(`fit_challenge_members?challenge_id=eq.${id}&user_id=eq.${me.id}&select=user_id`);
      if (j && j.length) return res.status(409).json({ ok: false, error: "joined" });
      row = { kind: "challenge", challenge_id: id, amount: ch.fee };
    } else return res.status(400).json({ ok: false });

    // Төлбөрийн дугаар үүсгэж мэдээллийн санд "хүлээгдэж байна" гэж хадгална
    const code = F.newCode();
    const host = (process.env.SITE_URL || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "") || req.headers.host;
    const inv = await L.qpay("/v2/invoice", {
      invoice_code: process.env.QPAY_INVOICE_CODE,
      sender_invoice_no: code,
      invoice_receiver_code: "FIT",
      invoice_description: `FINN Fit ${code}`,
      amount: row.amount,
      callback_url: `https://${host}/api/fit-callback?code=${code}`
    });
    await SB.rest("fit_payments", { method: "POST", body: { code, user_id: me.id, invoice: inv.invoice_id, ...row } });
    return res.json({ ok: true, code, amount: row.amount, invoice_id: inv.invoice_id, sig: L.sign(inv.invoice_id, code),
      qr_image: inv.qr_image, urls: inv.urls || [] });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "server" });
  }
};
