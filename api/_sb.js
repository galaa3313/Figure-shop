// Supabase-тэй серверээс ажиллах туслах функцууд ("_"-ээр эхэлсэн тул нээлттэй хаяг болохгүй).
// SUPABASE_SERVICE_KEY нь бүх эрхтэй нууц түлхүүр — зөвхөн Vercel-ийн Environment Variables-д байна.

// Supabase төслийн хаяг (жишээ: https://abcd.supabase.co)
const URL_ = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
// Нийтэд нээлттэй (anon) түлхүүр
const ANON = () => process.env.SUPABASE_ANON_KEY || "";
// Нууц (service role) түлхүүр
const SERVICE = () => process.env.SUPABASE_SERVICE_KEY || "";
// Supabase тохируулсан эсэх
const ready = () => !!(URL_() && ANON() && SERVICE());

// Мэдээллийн сангийн хүснэгт рүү (REST) нууц түлхүүрээр хүсэлт илгээнэ
async function rest(path, { method = "GET", body, prefer } = {}) {
  const r = await fetch(`${URL_()}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE(), Authorization: "Bearer " + SERVICE(),
      "Content-Type": "application/json",
      // return=representation: бичсэн мөрийг буцаана
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  // Хариуг текстээр уншаад JSON болгоно
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) throw new Error("sb_" + r.status + "_" + (j && (j.message || j.code) || ""));
  return j;
}

// Хэрэглэгчийн нэвтрэх токеноос хэн болохыг (ба профайлыг) олно. Буруу бол null
async function userFrom(req) {
  if (!ready()) return null;
  // "Authorization: Bearer <token>" толгойгоос токеныг авна
  const h = String((req.headers || {}).authorization || "");
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token || token.length > 4000) return null;
  // Supabase-ээс токен хүчинтэй эсэхийг шалгана
  const r = await fetch(`${URL_()}/auth/v1/user`, { headers: { apikey: ANON(), Authorization: "Bearer " + token } });
  if (!r.ok) return null;
  const u = await r.json();
  // Профайл (нэр, эрх, хаагдсан эсэх) уншина
  // is_super (супер админ) багана байхгүй бол (finn-super.sql ажиллуулаагүй) түүнгүйгээр дахин уншина
  const base = `profiles?id=eq.${encodeURIComponent(u.id)}&select=id,username,email,role,blocked`;
  const rows = await rest(base + ",is_super").catch(() => rest(base));
  const p = rows && rows[0];
  // Хаагдсан хэрэглэгч бол нэвтрээгүйтэй адил
  if (!p || p.blocked) return null;
  return p;
}

// Захиалгыг orders хүснэгтэд хадгална (давхардвал алгасна)
async function saveOrder(o, userId, method, status, invoice) {
  if (!ready()) return false;
  try {
    await rest("orders?on_conflict=code", {
      method: "POST", prefer: "resolution=ignore-duplicates",
      body: { code: o.code, user_id: userId || null, name: o.name, phone: o.phone, delivery: o.delivery,
              address: o.address, note: o.note, items: o.items, total: o.total, method, status, invoice: invoice || null }
    });
    return true;
  } catch (e) { return false; }
}

// Захиалгыг "Төлөгдсөн ✅" болгоно
async function markOrderPaid(code, invoice) {
  if (!ready()) return false;
  try {
    await rest(`orders?code=eq.${encodeURIComponent(code)}`, { method: "PATCH", body: { status: "Төлөгдсөн ✅", paid_at: new Date().toISOString(), ...(invoice ? { invoice } : {}) } });
    return true;
  } catch (e) { return false; }
}

// Мэдээллийн сангаас барааг id-гаар нь авна (үнийг сервер дээр шалгахад). Нуусан бол { inactive: true }
async function productById(id) {
  if (!ready()) return null;
  try {
    const rows = await rest(`products?id=eq.${encodeURIComponent(id)}&select=id,name,series,price,pre,options,active`);
    const p = rows && rows[0]; if (!p) return null;
    // Админ нуусан бараа: захиалга авахгүй
    if (!p.active) return { inactive: true };
    // _products.js-тэй ижил хэлбэрт оруулна: options = [[утга, утга], ...]
    return { name: p.name, series: p.series || "", price: p.price, pre: !!p.pre, options: (p.options || []).map(o => o.values || []) };
  } catch (e) { return null; }
}

// Захиалгыг дугаараар нь уншина (байхгүй бол null)
async function orderByCode(code) {
  if (!ready()) return null;
  try { const r = await rest(`orders?code=eq.${encodeURIComponent(code)}&select=code,total,invoice,status,user_id`); return r && r[0] || null; }
  catch (e) { return null; }
}

// Бусад файлд ашиглах
module.exports = { ready, rest, userFrom, saveOrder, markOrderPaid, productById, orderByCode, URL_, ANON };
