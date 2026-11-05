// QPay төлбөр ормогц энэ хаягийг өөрөө дуудна (callback).
// QPay-ийн зааврын дагуу: callback ирэхэд POST /v2/payment/check-ээр нэг удаа баталгаажуулна.
// Харилцагч хуудсаа хаасан ч захиалга "Төлөгдсөн" гэж хадгалагдана.
// Туслах функцууд
const L = require("./_lib.js");

module.exports = async (req, res) => {
  // Захиалгын дугаар (нэхэмжлэх үүсгэхэд callback хаягт оруулсан)
  const code = L.clip(req.query.code, 20);
  // QPay-ийн илгээсэн төлбөрийн дугаар (байвал)
  const pid = L.clip(req.query.qpay_payment_id || req.query.payment_id || (L.body(req) || {}).payment_id, 80);
  // QPay тохируулаагүй эсвэл дугаар буруу бол юу ч хийхгүй
  if (!L.qpayReady() || !/^AG(\d{5}|\d{6}-\d{4})$/.test(code)) return res.status(200).send("SUCCESS");
  try {
    // 1) Хүснэгтээс энэ захиалгын QPay нэхэмжлэхийн дугаарыг олно
    const st = await L.sheets({ action: "get", code });
    const inv = st && st.invoice;
    if (inv) {
      // 2) QPay-ээс төлөгдсөн эсэхийг баталгаажуулна (POST /v2/payment/check)
      const p = await L.isPaid(inv);
      // 3) Төлөгдсөн бол хүснэгтэд тэмдэглэж, Telegram-аар мэдэгдэнэ
      if (p.paid) await L.markPaid(code, p.amount, inv);
    } else if (!st) {
      // Хүснэгт ажиллахгүй байна (захиалга олдохгүй биш).
      // Гаднаас ирсэн дугаарт итгэж "төлөгдсөн" гэж тэмдэглэхгүй,
      // харин танд Telegram-аар гараар шалгахыг мэдэгдэнэ (хуурамч callback-аас хамгаална)
      await L.telegram(`⚠️ QPay callback ирлээ ${code}, гэхдээ хүснэгтээс нэхэмжлэх олдсонгүй. QPay дээрээс гараар шалгана уу.${pid ? "\nТөлбөрийн дугаар: " + pid : ""}`);
    }
  } catch (e) {}
  // QPay-д "хүлээж авлаа" гэж хариулна
  return res.status(200).send("SUCCESS");
};
