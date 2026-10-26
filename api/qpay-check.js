// Сайт 3 секунд тутам дуудаж төлбөр орсон эсэхийг шалгана.
// Туслах функцууд
const L = require("./_lib.js");

// Сайт 3 секунд тутам энд асууна
module.exports = async (req, res) => {
  // Нэхэмжлэх, захиалгын дугаар, гарын үсгийг уншина
  const inv = L.clip(req.query.inv, 80), code = L.clip(req.query.code, 10), sig = L.clip(req.query.sig, 64);
  // Гарын үсэг таарахгүй бол хуурамч хүсэлт тул татгалзана
  if (!L.qpayReady() || !inv || !/^AG\d{5}$/.test(code) || sig !== L.sign(inv, code)) return res.status(400).json({ paid: false });
  try {
    // QPay-ээс төлбөр орсон эсэхийг асууна
    const p = await L.isPaid(inv);
    // Төлөгдсөн бол Sheets-д тэмдэглээд Telegram-аар мэдэгдэнэ
    if (p.paid) await L.markPaid(code, p.amount, inv);
    return res.json({ paid: p.paid });
  } catch (e) {
    return res.status(502).json({ paid: false });
  }
};
