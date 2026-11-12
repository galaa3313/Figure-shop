// FINN Fit — төлбөр төлөгдсөн эсэхийг шалгана (сайт хэдэн секунд тутам асууна).
// QPay-ийн дүрмээр байнга асуухгүй: мэдээллийн сангийн төлвийг уншина,
// харилцагч "Төлбөрөө шалгах" товч дарсан үед л QPay-ээс НЭГ удаа асууна.
const L = require("./_lib.js");
const SB = require("./_sb.js");
const F = require("./_fit.js");

module.exports = async (req, res) => {
  const code = L.clip(req.query.code, 20), sig = L.clip(req.query.sig, 64), manual = req.query.manual === "1";
  if (!SB.ready() || L.limited(req, 120)) return res.status(429).json({ paid: false });
  try {
    const p = await F.payment(code);
    // Гарын үсэг таарахгүй бол хуурамч хүсэлт
    if (!p || !p.invoice || !L.sigOk(sig, p.invoice, code)) return res.status(400).json({ paid: false });
    if (p.status === "paid") return res.json({ paid: true });
    if (manual && p.status === "pending") {
      const q = await L.isPaid(p.invoice);
      if (q.paid && await F.activate(p, q.amount) && q.amount >= p.amount) return res.json({ paid: true });
    }
    return res.json({ paid: false });
  } catch (e) {
    return res.status(502).json({ paid: false });
  }
};
