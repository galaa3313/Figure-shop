// FINN Fit — хичээлийн Bunny видеог тоглуулах ХУГАЦААТАЙ холбоос гаргана.
// Үзэх эрхтэй хүнд л (үнэгүй хичээл, эсвэл идэвхтэй гишүүн, эсвэл админ) холбоос өгнө.
// Холбоосыг хуулж бусдад өгсөн ч 3 цагийн дараа ажиллахаа болино.
const crypto = require("node:crypto");
const L = require("./_lib.js");
const SB = require("./_sb.js");

// Bunny тохиргоо бэлэн эсэх
const ready = () => !!(process.env.BUNNY_LIBRARY_ID && process.env.BUNNY_TOKEN_KEY);

module.exports = async (req, res) => {
  if (!ready() || !SB.ready()) return res.status(503).json({ ok: false, error: "not_configured" });
  if (L.limited(req, 60)) return res.status(429).json({ ok: false, error: "too_many" });
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ ok: false });
  try {
    // Хичээл ба хөтөлбөрийг сервер (бүрэн эрхээр) уншина
    const r = await SB.rest(`fit_lessons?id=eq.${id}&active=eq.true&select=id,free,bunny_id,program_id,fit_programs(premium,active)`);
    const l = r && r[0];
    if (!l || !l.bunny_id || !l.fit_programs || !l.fit_programs.active) return res.status(404).json({ ok: false });
    // Үнэгүй биш бол гишүүн эсэхийг шалгана
    if (!l.free && l.fit_programs.premium) {
      const me = await SB.userFrom(req).catch(() => null);
      if (!me) return res.status(401).json({ ok: false, error: "login" });
      if (me.role !== "admin") {
        const m = await SB.rest(`fit_members?user_id=eq.${me.id}&until=gt.${encodeURIComponent(new Date().toISOString())}&select=tier`);
        if (!m || !m.length) return res.status(403).json({ ok: false, error: "member" });
      }
    }
    // Bunny-ийн токен: SHA256_HEX(token_key + video_id + expires)
    const expires = Math.floor(Date.now() / 1000) + 3 * 3600;
    const token = crypto.createHash("sha256").update(process.env.BUNNY_TOKEN_KEY + l.bunny_id + expires).digest("hex");
    const url = `https://iframe.mediadelivery.net/embed/${encodeURIComponent(process.env.BUNNY_LIBRARY_ID)}/${l.bunny_id}?token=${token}&expires=${expires}&autoplay=false&preload=true&responsive=true`;
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, url });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "server" });
  }
};
