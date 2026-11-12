// FINN Fit — QPay төлбөр ормогц энэ хаягийг дуудна. QPay-ээс өөрөө баталгаажуулж идэвхжүүлнэ.
const L = require("./_lib.js");
const SB = require("./_sb.js");
const F = require("./_fit.js");

module.exports = async (req, res) => {
  const code = L.clip(req.query.code, 20);
  try {
    if (L.qpayReady() && SB.ready()) {
      const p = await F.payment(code);
      // Гаднаас ирсэн дохионд итгэхгүй — QPay-ээс шалгана
      if (p && p.status === "pending" && p.invoice) {
        const q = await L.isPaid(p.invoice);
        if (q.paid) await F.activate(p, q.amount);
      }
    }
  } catch (e) {}
  // QPay-д "хүлээж авлаа"
  return res.status(200).send("SUCCESS");
};
