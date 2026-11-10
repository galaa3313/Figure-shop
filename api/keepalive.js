// Өдөр бүр Vercel-ийн cron дуудна:
// 1) Supabase-ийн үнэгүй төсөл 7 хоног идэвхгүй бол түр зогсдог тул "сэрүүн" байлгана.
// 2) Хуучин түүхийг цэвэрлэж мэдээллийн санг дүүргэхгүй байлгана.
// Supabase туслах
const SB = require("./_sb.js");
// Засварын өмнөх хувилбарыг хэд хоног хадгалах (энэ хугацаанд "↶ Өмнөх рүү буцаах" ажиллана)
const SNAP_DAYS = 30;
// Түүхийн мөрийг (хэн, юу хийсэн, устгасан захиалга) хэд хоног хадгалах
const LOG_DAYS = 180;
// Өнөөдрөөс N хоногийн өмнөх огноо (ISO)
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
module.exports = async (req, res) => {
  // Зөвхөн Vercel-ийн cron (CRON_SECRET-тэй) дуудна
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  if (SB.ready()) {
    // Нэг жижиг асуулга илгээнэ (сэрүүн байлгана)
    try { await SB.rest("products?select=id&limit=1"); } catch (e) {}
    // 30 хоногоос хуучин хувилбаруудыг устгана
    try { await SB.rest(`admin_snap?at=lt.${encodeURIComponent(ago(SNAP_DAYS))}`, { method: "DELETE" }); } catch (e) {}
    // 180 хоногоос хуучин түүхийг устгана
    try { await SB.rest(`admin_log?at=lt.${encodeURIComponent(ago(LOG_DAYS))}`, { method: "DELETE" }); } catch (e) {}
  }
  res.status(200).send("ok");
};
