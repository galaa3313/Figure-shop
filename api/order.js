// Дансаар шилжүүлэх захиалгыг Telegram болон Google Sheets руу дамжуулна.
// Туслах функцууд
const L = require("./_lib.js");

// Сайтаас "Төлбөр төлсөн" дарахад энд ирнэ
module.exports = async (req, res) => {
  // Зөвхөн POST хүсэлт хүлээж авна
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  // Захиалгыг шалгаж, үнийг сервер дээр бодно
  const o = L.order(L.body(req));
  // Буруу захиалга бол татгалзана
  if (!o) return res.status(400).json({ ok: false, error: "invalid" });
  // Telegram болон Sheets руу зэрэг илгээнэ
  const [t, s] = await Promise.allSettled([
    L.telegram(L.orderText(o, "🛒 Шинэ захиалга (дансаар)") + `\n\nХаан банкнаас "${o.code}" утгаар шалгаарай.`),
    L.sheets({ ...o, status: "Төлбөр шалгах" })
  ]);
  // Аль нэг нь амжилттай бол OK
  const ok = (t.status === "fulfilled" && t.value) || (s.status === "fulfilled" && s.value && s.value.ok !== false);
  return res.status(ok ? 200 : 502).json({ ok: !!ok });
};
