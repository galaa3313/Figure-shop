// FINN серверийн туслах функцууд (Vercel энэ файлыг хаяг болгож нээхгүй, учир нь "_"-ээр эхэлдэг).
// Нууц гарын үсэг (HMAC) үүсгэх Node-ийн сан
const crypto = require("crypto");
// Бараа, үнийн жагсаалт (_products.js)
const PRODUCTS = require("./_products.js");
// Supabase туслах (админы нэмсэн бараа, захиалгын хүснэгт)
const SB = require("./_sb.js");

// Текстийг заасан урттай болгож тайрна (хэт урт өгөгдлөөс хамгаална)
const clip = (v, n) => String(v ?? "").slice(0, n).trim();
// Тоог "95'000₮" хэлбэрт оруулна
const fmt = n => Number(n || 0).toLocaleString("en-US").replace(/,/g, "'") + "₮";
// Ирсэн хүсэлтийн өгөгдлийг JSON болгож уншина
const body = req => { let b = req.body || {}; if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } } return b; };

// Үнийг сервер дээр бараан жагсаалтаас тооцно (хэрэглэгч үнийг өөрчилж чадахгүй)
// Ирсэн захиалгыг шалгаж, нийт дүнг бодно. Буруу бол null буцаана
async function order(b) {
  const o = {
    code: clip(b.code, 20), name: clip(b.name, 80), phone: clip(b.phone, 20),
    delivery: clip(b.delivery, 20), address: clip(b.address, 300), note: clip(b.note, 300)
  };
  // AG + 5 оронтой дугаар, 8 оронтой утас, нэр заавал байх ёстой
  // Захиалгын дугаар: AG + огноо + 4 оронтой тоо (жишээ AG261104-4827). Хуучин AG12345 хэлбэр ч хүчинтэй
  if (!/^AG(\d{5}|\d{6}-\d{4})$/.test(o.code) || o.phone.replace(/\D/g, "").length !== 8 || !o.name) return null;
  // Хамгийн ихдээ 30 төрлийн бараа
  const items = Array.isArray(b.items) ? b.items.slice(0, 30) : [];
  const lines = []; let total = 0;
  // Бараа бүрийг шалгаж үнийг нэмнэ
  for (const it of items) {
    // Жагсаалтад байхгүй бараа бол захиалгыг хүлээж авахгүй
    // Эхлээд кодонд байгаа жагсаалтаас, олдохгүй бол админы нэмсэн (Supabase) бараанаас хайна
    const pid = clip(it && it.id, 40);
    // Эхлээд мэдээллийн сангаас (админы засварласан үнэ), олдохгүй бол кодын жагсаалтаас
    const dbp = await SB.productById(pid);
    if (dbp && dbp.inactive) return null;
    // Аюулгүй байдал: Supabase холбогдсон бол ЗӨВХӨН мэдээллийн сангийн бараа, үнийг хүлээн авна.
    // (Админ устгасан бараа, 100₮-ийн туршилтын бараа кодны хуучин жагсаалтаар захиалагдахаас сэргийлнэ)
    const p = dbp || (SB.ready() ? null : PRODUCTS[pid]); if (!p) return null;
    // Тоо ширхэг 1–20 хооронд
    const n = Math.min(20, Math.max(1, Math.round(Number(it.n) || 1)));
    // Бэлэн фигур 1 ширхэг л байдаг
    if (!p.pre && n > 1) return null;
    const opt = clip(it.opt, 60);
    // Өнгө/хэмжээ нь сайтад байгаа сонголтын нэг мөн эсэхийг шалгана
    if (p.options.length) {
      const parts = opt.split(" / ");
      if (parts.length !== p.options.length || parts.some((v, i) => !p.options[i].includes(v))) return null;
    }
    // Үнийг сервер дээрх жагсаалтаас авна
    total += p.price * n;
    lines.push(`${p.name} (${p.series})${opt ? ` [${opt}]` : ""}${n > 1 ? ` ×${n}` : ""}${p.pre ? " [захиалгаар]" : ""}`);
  }
  // Хоосон сагс хүлээж авахгүй
  if (!lines.length) return null;
  return { ...o, total, items: lines.join("; ") };
}

// Telegram-д илгээх захиалгын текст
function orderText(o, head) {
  return [
    `${head} ${o.code}`, `💰 ${fmt(o.total)}`, `👤 ${o.name} · ${o.phone}`,
    `🚚 ${o.delivery}${o.address ? ": " + o.address : ""}`, "",
    ...o.items.split("; ").map(s => "• " + s), o.note ? `\n📝 ${o.note}` : ""
  ].join("\n").trim();
}

// Telegram руу мессеж илгээнэ (TELEGRAM_CHAT_ID-д таслалаар олон хүн бичиж болно)
async function telegram(text) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chats } = process.env;
  if (!token || !chats) return false;
  const rs = await Promise.allSettled(chats.split(",").map(s => s.trim()).filter(Boolean).map(chat_id =>
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text, disable_web_page_preview: true })
    }).then(r => r.ok)));
  return rs.some(r => r.status === "fulfilled" && r.value);
}

// Google Sheets (Apps Script) руу илгээж, хариуг JSON-оор уншина
// Google Sheets (Apps Script) руу илгээнэ, SHEETS_KEY нууц түлхүүрийг хамт явуулна
async function sheets(params) {
  const url = process.env.SHEETS_URL; if (!url) return null;
  try {
    const r = await fetch(url, { method: "POST", body: new URLSearchParams(Object.fromEntries(Object.entries({ ...params, key: process.env.SHEETS_KEY || "" }).map(([k, v]) => [k, String(v ?? "")]))) });
    const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { ok: r.ok }; }
  } catch (e) { return null; }
}

// ---- QPay ----
// QPay-ийн серверийн хаяг (туршилтын бол QPAY_BASE_URL-д өөр хаяг бичнэ)
const QBASE = () => (process.env.QPAY_BASE_URL || "https://merchant.qpay.mn").replace(/\/$/, "");
// QPay-ийн 3 мэдээлэл Vercel-д оруулсан эсэх
const qpayReady = () => !!(process.env.QPAY_USERNAME && process.env.QPAY_PASSWORD && process.env.QPAY_INVOICE_CODE);
// QPay-ийн нэвтрэх токеныг 50 минут санаж байна
let tokenCache = { token: null, exp: 0 };
// QPay-ээс нэвтрэх токен авна
async function qpayToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const auth = Buffer.from(`${process.env.QPAY_USERNAME}:${process.env.QPAY_PASSWORD}`).toString("base64");
  const r = await fetch(QBASE() + "/v2/auth/token", { method: "POST", headers: { Authorization: "Basic " + auth } });
  if (!r.ok) throw new Error("qpay_auth_" + r.status);
  const j = await r.json();
  // QPay-ийн зааврын дагуу токеныг хугацаа нь дуустал дахин ашиглана.
  // expires_in нь unix timestamp (секунд) эсвэл үргэлжлэх секунд байж болно; 1 минутын нөөц үлдээнэ
  const e = Number(j.expires_in) || 0;
  const expMs = e > 1e9 ? e * 1000 : e > 0 ? Date.now() + e * 1000 : Date.now() + 50 * 60 * 1000;
  tokenCache = { token: j.access_token, exp: expMs - 60 * 1000 };
  return j.access_token;
}
// QPay API руу хүсэлт илгээх ерөнхий функц
async function qpay(path, payload, method = "POST") {
  const t = await qpayToken();
  const r = await fetch(QBASE() + path, {
    method, headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(payload)
  });
  if (!r.ok) throw new Error("qpay_" + path + "_" + r.status);
  return r.json();
}
// Нэхэмжлэх ба захиалгын дугаарыг холбосон гарын үсэг (хуурамч шалгалтаас хамгаална)
const sign = (inv, code) => crypto.createHmac("sha256", process.env.QPAY_PASSWORD || "x").update(inv + "|" + code).digest("hex").slice(0, 32);

// Нэхэмжлэх төлөгдсөн эсэх, хэдэн төгрөг орсныг QPay-ээс шалгана
async function isPaid(invoiceId) {
  const j = await qpay("/v2/payment/check", { object_type: "INVOICE", object_id: invoiceId, offset: { page_number: 1, page_limit: 100 } });
  const paid = (j.rows || []).filter(r => String(r.payment_status).toUpperCase() === "PAID");
  return { paid: (j.count || 0) > 0 && paid.length > 0, amount: Number(j.paid_amount) || paid.reduce((s, r) => s + Number(r.payment_amount || 0), 0) };
}

// Гарын үсгийг тогтмол хугацаанд харьцуулна (таах халдлагаас хамгаална)
function sigOk(sig, inv, code) {
  const a = Buffer.from(String(sig || "")), b = Buffer.from(sign(inv, code));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Нэг IP хаягаас хэт олон захиалга илгээхээс сэргийлнэ (спам).
// Серверийн нэг хувилбар дотор санана: 10 минутад хамгийн ихдээ 6 захиалга.
const hits = new Map();
function limited(req, max = 6, winMs = 10 * 60 * 1000) {
  // Хэрэглэгчийн IP (Vercel x-forwarded-for-д бичдэг)
  const ip = String((req.headers || {})["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  const now = Date.now();
  // Сүүлийн 10 минутын хүсэлтүүдийг үлдээнэ
  const arr = (hits.get(ip) || []).filter(t => now - t < winMs);
  arr.push(now); hits.set(ip, arr);
  // Санах ой дүүрэхээс сэргийлж хэт олон бол цэвэрлэнэ
  if (hits.size > 5000) hits.clear();
  // Хязгаар хэтэрсэн бол true
  return arr.length > max;
}

// Төлөгдсөн гэж тэмдэглэнэ. Sheets байгаа бол давхардлыг тэр шийднэ.
async function markPaid(code, amount, inv) {
  // Аюулгүй байдал: мэдээллийн санд энэ дугаартай захиалга байвал нэхэмжлэх нь таарч,
  // төлсөн дүн захиалгын нийт дүнгээс багагүй байх ёстой. Үгүй бол "төлөгдсөн" болгохгүй.
  const o = await SB.orderByCode(code);
  if (o && ((o.invoice && o.invoice !== inv) || Number(amount) < Number(o.total))) {
    await telegram(`⚠️ Сэжигтэй төлбөр ${code}\nНэхэмжлэх: ${inv} (захиалгынх: ${o.invoice || "—"})\nТөлсөн: ${fmt(amount)} · Захиалгын дүн: ${fmt(o.total)}\nТӨЛӨГДСӨН гэж тэмдэглээгүй — QPay-ээс гараар шалгана уу.`);
    return false;
  }
  // Supabase-ийн захиалгын хүснэгтэд ч тэмдэглэнэ
  await SB.markOrderPaid(code, inv);
  const s = await sheets({ action: "paid", code, invoice: inv, amount });
  const first = !s || s.changed !== false;
  if (first) await telegram(`✅ Төлөгдлөө ${code}\n💰 ${fmt(amount)} · QPay\nНэхэмжлэх: ${inv}`);
  return first;
}

// Бусад файлд ашиглах функцууд
module.exports = { clip, fmt, body, order, orderText, telegram, sheets, qpayReady, qpay, sign, sigOk, limited, isPaid, markPaid };
