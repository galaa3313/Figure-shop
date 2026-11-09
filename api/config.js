// Сайтад Supabase-ийн НИЙТЭД НЭЭЛТТЭЙ тохиргоог өгнө (нууц түлхүүр биш).
// Ингэснээр index.html-д юу ч бичих шаардлагагүй, Vercel-ийн тохиргооноос уншина.
module.exports = (req, res) => {
  // 5 минут хөтөчид хадгалуулна
  res.setHeader("Cache-Control", "public, max-age=300");
  // Хаяг ба anon түлхүүр (anon түлхүүр нь RLS дүрмээр хамгаалагдсан, нийтэд нээлттэй байж болно)
  res.json({ supabaseUrl: process.env.SUPABASE_URL || "", supabaseAnon: process.env.SUPABASE_ANON_KEY || "", siteUrl: process.env.SITE_URL || "" });
};
