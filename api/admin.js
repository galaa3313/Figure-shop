// Админы үйлдлүүд: захиалгууд, төлөв солих, хэрэглэгчид, эрх/хаалт.
// Зөвхөн admin эрхтэй хэрэглэгч ашиглаж чадна (токеноос нь шалгана).
// Туслах функцууд
const L = require("./_lib.js");
// Supabase туслах
const SB = require("./_sb.js");
// Захиалгын зөвшөөрөгдсөн төлвүүд
const STATUSES = ["Төлбөр шалгах", "QPay хүлээгдэж байна", "Төлөгдсөн ✅", "Хүргэлтэнд гарсан", "Хүргэгдсэн", "Цуцлагдсан"];

module.exports = async (req, res) => {
  // Зөвхөн POST
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!SB.ready()) return res.status(503).json({ ok: false, error: "not_configured" });
  // Хэн болохыг шалгана, админ биш бол татгалзана
  const me = await SB.userFrom(req).catch(() => null);
  if (!me || me.role !== "admin") return res.status(403).json({ ok: false, error: "forbidden" });
  const b = L.body(req);
  try {
    // ----- Захиалгын жагсаалт (сүүлийн 300) -----
    if (b.action === "orders") {
      // "unpaid" = QR үүсгээд төлөөгүй ба дансаар шалгагдаагүй захиалгууд (эргэж залгах жагсаалт)
      const st = b.status === "unpaid" ? `&status=in.(${encodeURIComponent('"QPay хүлээгдэж байна","Төлбөр шалгах"')})`
        : STATUSES.includes(b.status) ? `&status=eq.${encodeURIComponent(b.status)}` : "";
      const rows = await SB.rest(`orders?select=*&order=created_at.desc&limit=300${st}`);
      return res.json({ ok: true, rows, statuses: STATUSES });
    }
    // ----- Захиалгын төлөв солих -----
    if (b.action === "setStatus") {
      const code = L.clip(b.code, 20);
      if (!/^AG(\d{5}|\d{6}-\d{4})$/.test(code) || !STATUSES.includes(b.status)) return res.status(400).json({ ok: false });
      await SB.rest(`orders?code=eq.${encodeURIComponent(code)}`, { method: "PATCH", body: { status: b.status } });
      // Google Sheets-ийг ч шинэчилнэ (Төлөгдсөн болгосон бол)
      if (b.status === "Төлөгдсөн ✅") await L.sheets({ action: "paid", code, invoice: "", amount: 0 });
      return res.json({ ok: true });
    }
    // ----- Хэрэглэгчдийн жагсаалт -----
    if (b.action === "users") {
      const rows = await SB.rest("profiles?select=id,username,email,phone,role,blocked,created_at&order=created_at.desc&limit=500");
      return res.json({ ok: true, rows });
    }
    // ----- Хэрэглэгчийн эрх, хаалт өөрчлөх -----
    if (b.action === "setUser") {
      const id = L.clip(b.id, 40);
      // Өөрийгөө хааж, эрхээ хасахаас сэргийлнэ
      if (!/^[0-9a-f-]{36}$/.test(id) || id === me.id) return res.status(400).json({ ok: false });
      const patch = {};
      if (b.role === "user" || b.role === "admin") patch.role = b.role;
      if (typeof b.blocked === "boolean") patch.blocked = b.blocked;
      if (!Object.keys(patch).length) return res.status(400).json({ ok: false });
      await SB.rest(`profiles?id=eq.${id}`, { method: "PATCH", body: patch });
      return res.json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: "action" });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "server" });
  }
};
