// QPay төлбөр ормогц энэ хаяг руу мэдэгдэнэ. Хэрэглэгч хуудсаа хаасан ч захиалга төлөгдсөн гэж хадгалагдана.
// Туслах функцууд
const L = require("./_lib.js");

// QPay төлбөр ормогц өөрөө энэ хаягийг дуудна
module.exports = async (req, res) => {
  // Захиалгын дугаар
  const code = L.clip(req.query.code, 10);
  // QPay-ийн төлбөрийн дугаар
  const pid = L.clip(req.query.qpay_payment_id || req.query.payment_id || (L.body(req) || {}).payment_id, 80);
  if (!L.qpayReady() || !/^AG\d{5}$/.test(code) || !pid) return res.status(200).send("SUCCESS");
  try {
    // Төлбөрийг QPay-ээс дахин шалгана (хуурамч дуудлагаас хамгаална)
    const p = await L.qpay("/v2/payment/" + encodeURIComponent(pid), null, "GET");
    // Төлсөн бол хадгалж, мэдэгдэнэ
    if (String(p.payment_status).toUpperCase() === "PAID") {
      await L.markPaid(code, Number(p.payment_amount) || 0, p.object_id || pid);
    }
  } catch (e) {}
  // QPay-д "хүлээж авлаа" гэж хариулна
  return res.status(200).send("SUCCESS");
};
