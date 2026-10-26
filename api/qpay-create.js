// Захиалгад QPay нэхэмжлэх үүсгэж, QR болон банкны холбоосыг буцаана.
// Туслах функцууд
const L = require("./_lib.js");

// Сайтаас "Захиалга үүсгэх" дарахад энд ирнэ
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  // QPay тохируулаагүй бол сайт дансаар шилжүүлэх хувилбар руу шилжинэ
  if (!L.qpayReady()) return res.status(503).json({ ok: false, error: "qpay_not_configured" });
  // Захиалгыг шалгаж, үнийг сервер дээр бодно
  const o = L.order(L.body(req));
  if (!o) return res.status(400).json({ ok: false, error: "invalid" });
  try {
    // Төлбөр ормогц QPay мэдэгдэх хаяг
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    // QPay-ээс тухайн дүнтэй нэхэмжлэх үүсгэнэ
    const inv = await L.qpay("/v2/invoice", {
      invoice_code: process.env.QPAY_INVOICE_CODE,
      sender_invoice_no: o.code,
      invoice_receiver_code: o.phone.replace(/\D/g, ""),
      invoice_description: `FigureBox ${o.code}`,
      amount: o.total,
      callback_url: `https://${host}/api/qpay-callback?code=${o.code}`
    });
    // Танд Telegram мэдэгдэл, Sheets-д мөр нэмнэ
    await Promise.allSettled([
      L.telegram(L.orderText(o, "🕐 Шинэ захиалга (QPay төлбөр хүлээгдэж байна)")),
      L.sheets({ ...o, status: "QPay хүлээгдэж байна", invoice: inv.invoice_id })
    ]);
    // Сайтад QR, банкны холбоос, гарын үсэг буцаана
    return res.json({
      ok: true, invoice_id: inv.invoice_id, sig: L.sign(inv.invoice_id, o.code),
      qr_image: inv.qr_image, urls: inv.urls || [], short: inv.qPay_shortUrl, total: o.total
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "qpay_error" });
  }
};
