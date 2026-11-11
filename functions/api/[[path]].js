// =====================================================================
// CLOUDFLARE PAGES FUNCTIONS: /api/* хүсэлтийг одоогийн api/*.js (Vercel хэлбэрийн) кодоор ажиллуулна.
// api/ хавтсын кодыг өөрчлөхгүй — энэ файл зөвхөн "орчуулагч" (адаптер).
// Cloudflare-ийн тохиргоо: Settings → Runtime → Compatibility flags: nodejs_compat
// =====================================================================

// Нээлттэй API-ууд (нэрээр нь). "_"-ээр эхэлсэн туслах файлуудыг гаднаас дуудах боломжгүй.
import admin from "../../api/admin.js";
import cancelOrder from "../../api/cancel-order.js";
import config from "../../api/config.js";
import keepalive from "../../api/keepalive.js";
import login from "../../api/login.js";
import order from "../../api/order.js";
import qpayCallback from "../../api/qpay-callback.js";
import qpayCheck from "../../api/qpay-check.js";
import qpayCreate from "../../api/qpay-create.js";
import signup from "../../api/signup.js";

// Хаягийн нэр → функц
const H = {
  "admin": admin, "cancel-order": cancelOrder, "config": config, "keepalive": keepalive, "login": login,
  "order": order, "qpay-callback": qpayCallback, "qpay-check": qpayCheck, "qpay-create": qpayCreate, "signup": signup
};

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  // Cloudflare-ийн нууц тохиргоог (SUPABASE_..., QPAY_... гэх мэт) process.env-д хуулна
  if (globalThis.process) Object.assign(process.env, Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v === "string")));
  // /api/<нэр>
  const name = String((Array.isArray(params.path) ? params.path[0] : params.path) || "").replace(/\.js$/, "");
  const fn = H[name];
  if (!fn) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  // ----- Vercel-ийн req хэлбэр -----
  const headers = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  // Хэрэглэгчийн жинхэнэ IP (хэт олон хүсэлтийн хязгаарт)
  headers["x-forwarded-for"] = request.headers.get("cf-connecting-ip") || headers["x-forwarded-for"] || "";
  let body = {};
  if (request.method !== "GET" && request.method !== "HEAD") {
    // Хэт том хүсэлтийг (64KB-аас их) шууд татгалзана — манай API-д ийм том өгөгдөл хэрэггүй
    const MAX = 64 * 1024;
    if (Number(headers["content-length"] || 0) > MAX) return new Response(JSON.stringify({ ok: false, error: "too_large" }), { status: 413, headers: { "Content-Type": "application/json" } });
    const ct = headers["content-type"] || "";
    const text = await request.text();
    // Content-length бичээгүй ч бодит хэмжээг дахин шалгана
    if (text.length > MAX) return new Response(JSON.stringify({ ok: false, error: "too_large" }), { status: 413, headers: { "Content-Type": "application/json" } });
    if (ct.includes("application/json")) { try { body = JSON.parse(text || "{}"); } catch (e) { body = {}; } }
    else if (ct.includes("application/x-www-form-urlencoded")) body = Object.fromEntries(new URLSearchParams(text));
    else body = text;
  }
  const req = { method: request.method, headers, query: Object.fromEntries(url.searchParams), body, url: url.pathname + url.search };

  // ----- Vercel-ийн res хэлбэр: хариуг цуглуулж Response болгоно -----
  let status = 200, out = null;
  const rh = new Headers();
  const res = {
    status(c) { status = c; return res; },
    setHeader(k, v) { rh.set(k, String(v)); return res; },
    json(o) { rh.set("Content-Type", "application/json; charset=utf-8"); out = JSON.stringify(o); return res; },
    send(s) { if (out === null) out = typeof s === "string" ? s : JSON.stringify(s); return res; },
    end(s) { if (out === null) out = s == null ? "" : String(s); return res; }
  };
  try {
    await fn(req, res);
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "server" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  // API хариуг хөтөч хадгалахгүй (config өөрөө тохируулдаг)
  if (!rh.has("Cache-Control")) rh.set("Cache-Control", "no-store");
  return new Response(out === null ? "" : out, { status, headers: rh });
}
