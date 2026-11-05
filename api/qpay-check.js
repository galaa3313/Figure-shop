// Харилцагчийн дэлгэц 5 секунд тутам энд асууна: "миний захиалга төлөгдсөн үү?"
// QPay-ийн дүрмээр гүйлгээг байнга шалгахыг хориглодог тул энд QPay-ээс асуухгүй,
// харин callback-ийн дараа хадгалсан төлөвийг Google хүснэгтээс уншина.
// Туслах функцууд
const L = require("./_lib.js");

module.exports = async (req, res) => {
  // Нэхэмжлэх, захиалгын дугаар, гарын үсэг, гараар дарсан эсэхийг уншина
  const inv = L.clip(req.query.inv, 80), code = L.clip(req.query.code, 20), sig = L.clip(req.query.sig, 64);
  const manual = req.query.manual === "1";
  // Гарын үсэг таарахгүй бол хуурамч хүсэлт тул татгалзана
  if (!L.qpayReady() || !inv || !/^AG(\d{5}|\d{6}-\d{4})$/.test(code) || !L.sigOk(sig, inv, code)) return res.status(400).json({ paid: false });
  try {
    // 1) Хүснэгтээс төлөвийг уншина (callback ирсэн бол "Төлөгдсөн ✅" болсон байна)
    const st = await L.sheets({ action: "get", code });
    if (st && String(st.status || "").indexOf("Төлөгдсөн") === 0) return res.json({ paid: true });
    // 2) Харилцагч "Төлбөрөө шалгах" товчийг өөрөө дарсан үед л QPay-ээс НЭГ удаа асууна
    //    (callback хоцорсон эсвэл ирээгүй тохиолдолд)
    if (manual) {
      const p = await L.isPaid(inv);
      if (p.paid) { await L.markPaid(code, p.amount, inv); return res.json({ paid: true }); }
    }
    // Хараахан төлөгдөөгүй
    return res.json({ paid: false });
  } catch (e) {
    return res.status(502).json({ paid: false });
  }
};
