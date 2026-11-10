// Админы үйлдлүүд: захиалгууд, төлөв солих, хэрэглэгчид, эрх/хаалт.
// Зөвхөн admin эрхтэй хэрэглэгч ашиглаж чадна (токеноос нь шалгана).
// Туслах функцууд
const L = require("./_lib.js");
// Supabase туслах
const SB = require("./_sb.js");
// Захиалгын зөвшөөрөгдсөн төлвүүд
const STATUSES = ["Төлбөр шалгах", "QPay хүлээгдэж байна", "Төлөгдсөн ✅", "Хүргэлтэнд гарсан", "Хүргэгдсэн", "Цуцлагдсан"];

// Захиалгын дугаарын хэлбэр шалгана
const okCode = c => /^AG(\d{5}|\d{6}-\d{4})$/.test(c);
// Үйлдлийг түүхэнд бичнэ (алдаа гарвал үндсэн үйлдлийг зогсоохгүй)
async function log(me, action, entity, target, detail){
  try { await SB.rest("admin_log", { method: "POST", body: { actor_id: me.id, actor: me.username, action, entity, target: target == null ? null : String(target), detail: detail || null } }); } catch (e) {}
}
// Нэг захиалгыг уншина
async function getOrder(code){ const r = await SB.rest(`orders?code=eq.${encodeURIComponent(code)}&select=*`); return r && r[0]; }

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
      // Нуусан захиалгыг тусад нь харна ("hidden" сонголт), бусад үед далдална
      const hid = b.status === "hidden" ? "&hidden=eq.true" : "&hidden=eq.false";
      let rows;
      try { rows = await SB.rest(`orders?select=*&order=created_at.desc&limit=300${st}${hid}`); }
      // SQL (hidden багана) хараахан ажиллуулаагүй бол хуучин байдлаар
      catch (e) { rows = await SB.rest(`orders?select=*&order=created_at.desc&limit=300${st}`); }
      return res.json({ ok: true, rows, statuses: STATUSES });
    }
    // ----- Захиалгын төлөв солих -----
    if (b.action === "setStatus") {
      const code = L.clip(b.code, 20);
      if (!okCode(code) || !STATUSES.includes(b.status)) return res.status(400).json({ ok: false });
      // Өмнөх төлвийг түүхэнд бичихээр авна
      const old = await getOrder(code);
      // Төлөв өөрчлөгдөөгүй бол юу ч хийхгүй
      if (old && old.status === b.status) return res.json({ ok: true, same: true });
      await log(me, "status", "order", code, { from: old ? old.status : null, to: b.status, name: old && old.name });
      await SB.rest(`orders?code=eq.${encodeURIComponent(code)}`, { method: "PATCH", body: { status: b.status } });
      // Google Sheets-ийг ч шинэчилнэ (Төлөгдсөн болгосон бол)
      if (b.status === "Төлөгдсөн ✅") await L.sheets({ action: "paid", code, invoice: "", amount: 0 });
      return res.json({ ok: true });
    }
    // ----- Захиалга нуух / буцааж харуулах -----
    if (b.action === "hideOrder") {
      const code = L.clip(b.code, 20);
      if (!okCode(code) || typeof b.hidden !== "boolean") return res.status(400).json({ ok: false });
      const o = await getOrder(code);
      if (!o) return res.status(404).json({ ok: false, error: "not_found" });
      // Аль хэдийн тийм төлөвтэй бол (давхар дарсан) түүхэнд дахин бичихгүй
      if (!!o.hidden === b.hidden) return res.json({ ok: true, same: true });
      await SB.rest(`orders?code=eq.${encodeURIComponent(code)}`, { method: "PATCH", body: { hidden: b.hidden } });
      await log(me, b.hidden ? "hide" : "unhide", "order", code, { name: o && o.name, total: o && o.total });
      return res.json({ ok: true });
    }
    // ----- Захиалга устгах (бүрэн хуулбарыг түүхэнд хадгалж, дараа сэргээж болно) -----
    if (b.action === "deleteOrder") {
      const code = L.clip(b.code, 20);
      if (!okCode(code)) return res.status(400).json({ ok: false });
      const o = await getOrder(code);
      if (!o) return res.status(404).json({ ok: false, error: "not_found" });
      await log(me, "delete", "order", code, o);
      await SB.rest(`orders?code=eq.${encodeURIComponent(code)}`, { method: "DELETE" });
      return res.json({ ok: true });
    }
    // ----- Устгасныг сэргээх (захиалга, бараа) -----
    if (b.action === "restore") {
      const id = parseInt(b.id, 10);
      if (!(id > 0)) return res.status(400).json({ ok: false });
      const r = await SB.rest(`admin_log?id=eq.${id}&select=*`); const l = r && r[0];
      if (!l || l.action !== "delete" || !l.detail || !["order", "product"].includes(l.entity)) return res.status(400).json({ ok: false, error: "cannot_restore" });
      // Хуучин мөрийг буцааж оруулна (ижил дугаартай байвал алгасна)
      const table = l.entity === "order" ? "orders?on_conflict=code" : "products?on_conflict=id";
      await SB.rest(table, { method: "POST", prefer: "resolution=ignore-duplicates", body: l.detail });
      await log(me, "restore", l.entity, l.target, { from_log: id });
      return res.json({ ok: true });
    }
    // ----- Түүх: огноо, төрөл, үйлдлээр шүүнэ -----
    if (b.action === "log") {
      const d = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? s : null;
      const from = d(b.from), to = d(b.to);
      let q = "admin_log?select=*&order=at.desc&limit=500";
      // Монголын цагаар (UTC+8) өдрийн эхлэл, төгсгөл
      if (from) q += `&at=gte.${encodeURIComponent(from + "T00:00:00+08:00")}`;
      if (to) q += `&at=lte.${encodeURIComponent(to + "T23:59:59.999+08:00")}`;
      if (["order", "product", "review", "settings", "user"].includes(b.entity)) q += `&entity=eq.${b.entity}`;
      if (["delete", "hide", "unhide", "restore", "status", "insert", "update", "user"].includes(b.act)) q += `&action=eq.${b.act}`;
      const rows = await SB.rest(q);
      return res.json({ ok: true, rows });
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
      // Хэн хэний эрхийг өөрчилснийг бичнэ
      const u = await SB.rest(`profiles?id=eq.${id}&select=username`);
      await log(me, "user", "user", u && u[0] ? u[0].username : id, patch);
      return res.json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: "action" });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "server" });
  }
};
