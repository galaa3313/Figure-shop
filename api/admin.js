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
    // ----- Сэргээх / өмнөх хувилбар руу буцаах -----
    if (b.action === "restore") {
      const id = parseInt(b.id, 10);
      if (!(id > 0)) return res.status(400).json({ ok: false });
      const r = await SB.rest(`admin_log?id=eq.${id}&select=*`); const l = r && r[0];
      if (!l || !l.detail) return res.status(400).json({ ok: false, error: "cannot_restore" });
      // (а) Устгасан захиалга, барааг буцааж оруулна
      if (l.action === "delete" && ["order", "product"].includes(l.entity)) {
        const table = l.entity === "order" ? "orders?on_conflict=code" : "products?on_conflict=id";
        await SB.rest(table, { method: "POST", prefer: "resolution=ignore-duplicates", body: l.detail });
        await log(me, "restore", l.entity, l.target, { from_log: id, name: l.detail.name });
        return res.json({ ok: true });
      }
      // (б) Тохиргоо эсвэл барааг засварын ӨМНӨХ хувилбар руу буцаана
      const snapId = parseInt(l.detail.snap, 10);
      if (!(snapId > 0) || !["settings", "product"].includes(l.entity)) return res.status(400).json({ ok: false, error: "cannot_restore" });
      const sr = await SB.rest(`admin_snap?id=eq.${snapId}&select=*`); const snap = sr && sr[0];
      if (!snap || !snap.data) return res.status(404).json({ ok: false, error: "no_snapshot" });
      // Одоогийн байдлыг хадгална: буцаасандаа дургүй бол дахин буцааж болно
      let cur, keep;
      if (l.entity === "settings") {
        cur = await SB.rest("settings?id=eq.site&select=data"); cur = cur && cur[0] ? cur[0].data : null;
        keep = await SB.rest("admin_snap", { method: "POST", prefer: "return=representation", body: { entity: "settings", target: "site", data: cur } });
        await SB.rest("settings?on_conflict=id", { method: "POST", prefer: "resolution=merge-duplicates", body: { id: "site", data: snap.data, updated_at: new Date().toISOString(), updated_by: me.id } });
      } else {
        cur = await SB.rest(`products?id=eq.${encodeURIComponent(snap.target)}&select=*`); cur = cur && cur[0];
        keep = cur ? await SB.rest("admin_snap", { method: "POST", prefer: "return=representation", body: { entity: "product", target: snap.target, data: cur } }) : null;
        await SB.rest("products?on_conflict=id", { method: "POST", prefer: "resolution=merge-duplicates", body: snap.data });
      }
      await log(me, "restore", l.entity, l.target, { from_log: id, at: l.at, name: snap.data.name || null, snap: keep && keep[0] ? keep[0].id : null, changed: l.detail.changed || [] });
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
      if (["delete", "hide", "unhide", "restore", "status", "insert", "update", "user", "cancel"].includes(b.act)) q += `&action=eq.${b.act}`;
      const rows = await SB.rest(q);
      return res.json({ ok: true, rows });
    }
    // ----- Би хэн бэ (супер админ эсэх, хүлээгдэж буй хүсэлтийн тоо) -----
    if (b.action === "whoami") {
      let pending = 0;
      if (me.is_super) { try { pending = ((await SB.rest("admin_requests?status=eq.pending&select=id")) || []).length; } catch (e) {} }
      return res.json({ ok: true, id: me.id, username: me.username, super: !!me.is_super, pending });
    }
    // ----- Хэрэглэгчдийн жагсаалт (+ хүлээгдэж буй админ хүсэлтүүд) -----
    if (b.action === "users") {
      const sel = "profiles?select=id,username,email,phone,role,blocked,created_at";
      const rows = await SB.rest(sel + ",is_super&order=created_at.desc&limit=500").catch(() => SB.rest(sel + "&order=created_at.desc&limit=500"));
      let reqs = [];
      try { reqs = await SB.rest("admin_requests?select=*&order=at.desc&limit=50"); } catch (e) {}
      return res.json({ ok: true, rows, requests: reqs || [], super: !!me.is_super, me: me.id });
    }
    // ----- Супер админ: админ эрхийн хүсэлтийг зөвшөөрөх / татгалзах -----
    if (b.action === "decide") {
      if (!me.is_super) return res.status(403).json({ ok: false, error: "not_super" });
      const id = Number(b.id), ok = b.approve === true;
      const r = await SB.rest(`admin_requests?id=eq.${id}&status=eq.pending&select=*`);
      const q = r && r[0]; if (!q) return res.status(404).json({ ok: false, error: "not_found" });
      // Зөвшөөрвөл тухайн хүн хаагдаагүй, бүртгэлтэй хэвээр байгаа эсэхийг шалгаад админ болгоно
      if (ok) {
        const t = await SB.rest(`profiles?id=eq.${q.target_id}&select=id,blocked`);
        if (!t || !t[0]) return res.status(404).json({ ok: false, error: "user_gone" });
        if (t[0].blocked) return res.status(409).json({ ok: false, error: "blocked" });
        await SB.rest(`profiles?id=eq.${q.target_id}`, { method: "PATCH", body: { role: "admin" } });
      }
      await SB.rest(`admin_requests?id=eq.${id}`, { method: "PATCH", body: { status: ok ? "approved" : "rejected", decided_by: me.username, decided_at: new Date().toISOString() } });
      await log(me, ok ? "approve" : "reject", "user", q.target_username, { requester: q.requester, role: "admin" });
      return res.json({ ok: true });
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
      // Тухайн хэрэглэгчийн одоогийн эрх
      const cur = await SB.rest(`profiles?id=eq.${id}&select=id,username,email,role`).then(r => r && r[0]);
      if (!cur) return res.status(404).json({ ok: false, error: "not_found" });
      // Супер админыг хэн ч хааж, эрхийг нь хасаж чадахгүй
      const tsup = await SB.rest(`profiles?id=eq.${id}&select=is_super`).then(r => !!(r && r[0] && r[0].is_super)).catch(() => false);
      if (tsup) return res.status(403).json({ ok: false, error: "is_super" });
      // Өөр админы эрхийг хасах, админыг хаах — зөвхөн супер админ
      if (cur.role === "admin" && !me.is_super && (patch.role === "user" || patch.blocked === true)) return res.status(403).json({ ok: false, error: "not_super" });
      // Шинээр админ болгох: супер админ шууд, бусад нь супер админы зөвшөөрөл хүсэх хүсэлт үүсгэнэ
      if (patch.role === "admin" && cur.role !== "admin" && !me.is_super) {
        const dup = await SB.rest(`admin_requests?target_id=eq.${id}&status=eq.pending&select=id`).catch(() => null);
        if (dup === null) return res.status(503).json({ ok: false, error: "no_table" });
        if (!dup.length) {
          await SB.rest("admin_requests", { method: "POST", body: { requester_id: me.id, requester: me.username, target_id: id, target_username: cur.username, target_email: cur.email } });
          await log(me, "request", "user", cur.username, { role: "admin" });
          // Супер админд Telegram-аар мэдэгдэнэ
          await L.telegram(`👑 Админ эрхийн хүсэлт\n${me.username} → «${cur.username}»-д админ эрх өгөхийг хүсэж байна.\nАдмин → Хэрэглэгч хэсгээс зөвшөөрнө үү.`).catch(() => {});
        }
        return res.json({ ok: true, pending: true });
      }
      await SB.rest(`profiles?id=eq.${id}`, { method: "PATCH", body: patch });
      // Супер админ шууд админ болгосон бол тухайн хүний хүлээгдэж буй хүсэлтийг хаана
      if (patch.role === "admin" && me.is_super) await SB.rest(`admin_requests?target_id=eq.${id}&status=eq.pending`, { method: "PATCH", body: { status: "approved", decided_by: me.username, decided_at: new Date().toISOString() } }).catch(() => {});
      // Хэн хэний эрхийг өөрчилснийг бичнэ
      const u = await SB.rest(`profiles?id=eq.${id}&select=username`);
      await log(me, "user", "user", u && u[0] ? u[0].username : id, patch);
      return res.json({ ok: true });
    }
    // ----- Нэг хэрэглэгчийн дэлгэрэнгүй (захиалга, сэтгэгдэл, сүүлд нэвтэрсэн) -----
    if (b.action === "userInfo") {
      const id = L.clip(b.id, 40);
      if (!/^[0-9a-f-]{36}$/.test(id)) return res.status(400).json({ ok: false });
      const [pr, orders, revs, favs, au] = await Promise.all([
        SB.rest(`profiles?id=eq.${id}&select=id,username,email,phone,role,blocked,created_at`),
        SB.rest(`orders?user_id=eq.${id}&select=code,total,status,created_at&order=created_at.desc&limit=50`).catch(() => []),
        SB.rest(`reviews?user_id=eq.${id}&select=id`).catch(() => []),
        SB.rest(`favorites?user_id=eq.${id}&select=product_id`).catch(() => []),
        // Нэвтрэлтийн мэдээлэл (сүүлд нэвтэрсэн, имэйл баталгаажсан) — зөвхөн сервер уншина
        fetch(`${SB.URL_()}/auth/v1/admin/users/${id}`, { headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + process.env.SUPABASE_SERVICE_KEY } }).then(r => r.ok ? r.json() : null).catch(() => null)
      ]);
      const u = pr && pr[0]; if (!u) return res.status(404).json({ ok: false, error: "not_found" });
      // Төлсөн захиалгын нийт дүн (цуцлагдсан, төлөөгүйг тооцохгүй)
      const PAID = ["Төлөгдсөн ✅", "Хүргэлтэнд гарсан", "Хүргэгдсэн"];
      const spent = (orders || []).filter(o => PAID.includes(o.status)).reduce((a, o) => a + Number(o.total || 0), 0);
      return res.json({ ok: true, user: u, orders: orders || [], spent, reviews: (revs || []).length, favorites: (favs || []).length,
        lastSignIn: au && au.last_sign_in_at || null, confirmed: !!(au && au.email_confirmed_at), provider: au && au.app_metadata && au.app_metadata.provider || "email" });
    }
    // ----- Хэрэглэгчийг бүрмөсөн устгах (захиалгууд нь хадгалагдана) -----
    if (b.action === "deleteUser") {
      const id = L.clip(b.id, 40);
      // Өөрийгөө устгахыг хориглоно
      if (!/^[0-9a-f-]{36}$/.test(id) || id === me.id) return res.status(400).json({ ok: false, error: "self" });
      const pr = await SB.rest(`profiles?id=eq.${id}&select=id,username,email,phone,role,blocked,created_at`);
      const u = pr && pr[0]; if (!u) return res.status(404).json({ ok: false, error: "not_found" });
      // Админыг шууд устгахгүй — эхлээд энгийн хэрэглэгч болгоно (санамсаргүй устгахаас хамгаална)
      if (u.role === "admin") return res.status(409).json({ ok: false, error: "is_admin" });
      // Нэвтрэх бүртгэлийг устгана → профайл, хадгалсан бараа, сэтгэгдэл хамт устна; захиалгууд үлдэнэ (эзэнгүй болно)
      const r = await fetch(`${SB.URL_()}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + process.env.SUPABASE_SERVICE_KEY } });
      if (!r.ok) return res.status(502).json({ ok: false, error: "server" });
      await log(me, "delete", "user", u.username, u);
      return res.json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: "action" });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "server" });
  }
};
