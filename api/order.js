// Дансаар шилжүүлэх захиалгыг Telegram болон Google Sheets руу дамжуулна.
// Туслах функцууд
const L = require("./_lib.js");
// Supabase: нэвтэрсэн хэрэглэгч, захиалгын хүснэгт
const SB = require("./_sb.js");

// Сайтаас "Төлбөр төлсөн" дарахад энд ирнэ
module.exports = async (req, res) => {
  // Зөвхөн POST хүсэлт хүлээж авна
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  // Нэг хүнээс богино хугацаанд хэт олон захиалга ирвэл (спам) татгалзана
  // 10 минутад нэг хаягаас 10 хүртэл захиалга (нэг сүлжээнд олон хүн байж болох тул арай өргөн)
  if (L.limited(req, 10)) return res.status(429).json({ ok: false, error: "too_many" });
  // Захиалгыг шалгаж, үнийг сервер дээр бодно
  const o = await L.order(L.body(req));
  // Нэвтэрсэн хэрэглэгч бол түүний id-г захиалгад холбоно (зочин бол null)
  const user = await SB.userFrom(req).catch(() => null);
  // Буруу захиалга бол татгалзана
  if (!o) return res.status(400).json({ ok: false, error: "invalid" });
  // Telegram болон Sheets руу зэрэг илгээнэ
  const [t, s] = await Promise.allSettled([
    L.telegram(L.orderText(o, "🛒 Шинэ захиалга (дансаар)") + `\n\nХудалдаа хөгжлийн банкны дансаас "${o.code}" утгаар шалгаарай.`),
    L.sheets({ ...o, status: "Төлбөр шалгах" }),
    // Supabase-д хадгална (миний захиалгууд, админд харагдана)
    SB.saveOrder(o, user && user.id, "bank", "Төлбөр шалгах")
  ]);
  // Аль нэг нь амжилттай бол OK
  const ok = (t.status === "fulfilled" && t.value) || (s.status === "fulfilled" && s.value && s.value.ok !== false);
  // ct: зочин захиалагч дараа нь энэ захиалгаа цуцлахад хэрэглэх түлхүүр
  return res.status(ok ? 200 : 502).json({ ok: !!ok, ct: ok ? L.cancelToken(o.code) : undefined });
};
