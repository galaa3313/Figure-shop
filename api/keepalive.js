// Supabase-ийн үнэгүй төсөл 7 хоног идэвхгүй бол түр зогсдог.
// Vercel өдөр бүр энэ хаягийг дуудаж (cron) Supabase-ийг "сэрүүн" байлгана.
// Supabase туслах
const SB = require("./_sb.js");
module.exports = async (req, res) => {
  // Зөвхөн Vercel-ийн cron (CRON_SECRET-тэй) дуудна
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  // Нэг жижиг асуулга илгээнэ
  try { if (SB.ready()) await SB.rest("products?select=id&limit=1"); } catch (e) {}
  res.status(200).send("ok");
};
