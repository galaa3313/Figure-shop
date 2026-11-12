// FINN Fit — АДМИН хичээлийн видеог Bunny Stream руу шууд оруулна.
// Сервер Bunny дээр хоосон видео үүсгэж, хөтчид түр (2 цаг) гарын үсэг өгнө.
// Bunny-ийн API түлхүүр хөтөч рүү ХЭЗЭЭ Ч очихгүй.
const crypto = require("node:crypto");
const L = require("./_lib.js");
const SB = require("./_sb.js");

const LIB = () => process.env.BUNNY_LIBRARY_ID;
const KEY = () => process.env.BUNNY_API_KEY;
// Bunny Stream API-д хүсэлт илгээнэ
async function bunny(path, opt = {}) {
  const r = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(LIB())}${path}`, {
    method: opt.method || "GET",
    headers: { AccessKey: KEY(), Accept: "application/json", ...(opt.body ? { "Content-Type": "application/json" } : {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });
  if (!r.ok) throw new Error("bunny " + r.status);
  return r.status === 204 ? null : r.json();
}
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!LIB() || !KEY() || !SB.ready()) return res.status(503).json({ ok: false, error: "not_configured" });
  if (L.limited(req, 30)) return res.status(429).json({ ok: false, error: "too_many" });
  // Зөвхөн админ
  const me = await SB.userFrom(req).catch(() => null);
  if (!me || me.role !== "admin") return res.status(403).json({ ok: false, error: "admin" });
  const b = L.body(req);
  try {
    // 1) Шинэ видео үүсгэж, оруулах гарын үсэг өгнө
    if (b.action === "create") {
      const v = await bunny("/videos", { method: "POST", body: { title: L.clip(b.title || "FINN Fit", 120) } });
      const expire = Math.floor(Date.now() / 1000) + 2 * 3600;
      // SHA256(library_id + api_key + expiration_time + video_id)
      const signature = crypto.createHash("sha256").update(String(LIB()) + KEY() + expire + v.guid).digest("hex");
      return res.json({ ok: true, videoId: v.guid, libraryId: String(LIB()), expire, signature });
    }
    // 2) Видео боловсруулагдаж дууссан эсэх (status 4 = бэлэн, 5 = алдаа)
    if (b.action === "status") {
      if (!GUID.test(b.id)) return res.status(400).json({ ok: false });
      const v = await bunny(`/videos/${b.id}`);
      return res.json({ ok: true, status: v.status, progress: v.encodeProgress || 0, length: v.length || 0 });
    }
    // 3) Хуучин видеог устгах (солих, хичээл устгах үед)
    if (b.action === "delete") {
      if (!GUID.test(b.id)) return res.status(400).json({ ok: false });
      await bunny(`/videos/${b.id}`, { method: "DELETE" });
      return res.json({ ok: true });
    }
    return res.status(400).json({ ok: false });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "bunny" });
  }
};
