// =====================================================================
// FINN Fit — БҮХ Fit API-г нэг функцэд нэгтгэсэн "чиглүүлэгч".
// Шалтгаан: Vercel-ийн үнэгүй (Hobby) багц нэг төсөлд 12-оос олон функц зөвшөөрдөггүй.
// Сайт хуучин хаягаараа (/api/fit-pay, /api/fit-check …) дуудна —
// vercel.json-ийн rewrites тэдгээрийг /api/fit?op=pay гэх мэтээр энд илгээнэ.
// Жинхэнэ код нь "_"-ээр эхэлсэн файлуудад (Vercel тэднийг тусдаа функц гэж тоолдоггүй).
// =====================================================================
const H = {
  // Гишүүнчлэл, сорилтын QPay төлбөр үүсгэх
  pay: require("./_fit-pay.js"),
  // Төлбөр төлөгдсөн эсэхийг шалгах
  check: require("./_fit-check.js"),
  // QPay-ээс ирэх мэдэгдэл
  callback: require("./_fit-callback.js"),
  // Хичээлийн видеог үзэх хугацаатай холбоос
  video: require("./_fit-video.js"),
  // Админ: Bunny-д видео оруулах, устгах
  upload: require("./_fit-upload.js")
};

module.exports = async (req, res) => {
  // Аль үйлдэл вэ (rewrites-ээс ирсэн ?op=...)
  const op = String((req.query && req.query.op) || "");
  const fn = Object.prototype.hasOwnProperty.call(H, op) ? H[op] : null;
  if (!fn) return res.status(404).json({ ok: false, error: "not_found" });
  // Хэт олон хүсэлтийн тоолуур хаягаар тоолдог тул үйлдэл бүрийг өөрийн хуучин хаягаар тоолуулна
  const qs = String(req.url || "").split("?")[1] || "";
  req.url = "/api/fit-" + op + (qs ? "?" + qs : "");
  return fn(req, res);
};
