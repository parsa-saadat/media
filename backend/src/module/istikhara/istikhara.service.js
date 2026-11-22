import { HttpError } from "../../utils/http/http.util.js";

/**
 * استخاره با قرآن — the traditional method as narrated in the sources (e.g. hawzah.net, Bihar al-Anwar):
 * after seeking good from God, open the Mushaf and read the FIRST verse of the RIGHT-hand page.
 * A verse of mercy or a command to good = خوب; of wrath, punishment or a prohibition = بد;
 * ambiguous = میانه.
 *
 * Text comes from Al Quran Cloud (api.alquran.cloud): Arabic Uthmani script plus a Persian translation.
 * The standard Mushaf has 604 pages; in a right-to-left book the right-hand page is the even one.
 */
const API = "https://api.alquran.cloud/v1";
const MUSHAF_PAGES = 604;
export const TRANSLATIONS = {
  "fa.makarem": "مکارم شیرازی",
  "fa.ansarian": "انصاریان",
  "fa.fooladvand": "فولادوند",
  "fa.ghomshei": "الهی قمشه‌ای",
};

// ---- cache: the Quran never changes, so a fetched page is kept for the life of the process ----
const cache = new Map();
const CACHE_MS = 24 * 60 * 60 * 1000;

async function fetchPage(page, edition) {
  const key = `${page}:${edition}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ayahs;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`${API}/page/${page}/${edition}`, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new HttpError(502, "دسترسی به منبع قرآن ممکن نشد؛ کمی بعد دوباره تلاش کنید");
    const json = await res.json();
    if (json.code !== 200 || !json.data?.ayahs?.length) throw new HttpError(502, "پاسخ نامعتبر از منبع قرآن");
    cache.set(key, { ayahs: json.data.ayahs, at: Date.now() });
    return json.data.ayahs;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(504, "منبع قرآن در دسترس نیست؛ اتصال اینترنت سرور را بررسی کنید");
  } finally {
    clearTimeout(timer);
  }
}

// ---- classification cues (Persian translation) ----
// Mercy / glad tidings / commands to good
const GOOD = ["رحمت", "رحیم", "بخشنده", "آمرزش", "مغفرت", "بهشت", "بشارت", "پاداش", "نعمت", "هدایت", "رستگار", "رستگاری", "ایمان آوردند", "عمل صالح", "نیکوکار", "نیکی", "خیر", "برکت", "شکیبا", "توکل", "یاری", "پیروزی", "نور", "آرامش", "فضل", "روزی", "باغ", "صلح", "گشایش", "آسانی"];
// Wrath / punishment / prohibition
const BAD = ["عذاب", "آتش", "دوزخ", "جهنم", "لعنت", "خشم", "غضب", "هلاک", "نابود", "کافران", "منافقان", "ستمکاران", "ستمگران", "دروغ", "فریب", "عقوبت", "کیفر", "زیان", "گمراه", "گمراهی", "تکذیب", "مجازات", "نفرین", "شکست", "وای بر", "مباد", "نکنید", "نپردازید", "دور شوید"];

export function classify(translation) {
  const text = translation.replace(/\u200c/g, " ");
  const good = GOOD.filter((w) => text.includes(w));
  const bad = BAD.filter((w) => text.includes(w));
  // "و" at the start of a verse often continues a previous thought → leans to middle.
  if (good.length && !bad.length) return { verdict: "good", cues: good.slice(0, 4) };
  if (bad.length && !good.length) return { verdict: "caution", cues: bad.slice(0, 4) };
  if (good.length && bad.length) return { verdict: "middle", cues: [...good.slice(0, 2), ...bad.slice(0, 2)] };
  return { verdict: "middle", cues: [] };
}

export async function draw(translationId) {
  // Right-hand (even) page, 2..604. Page 1 is a left-hand opener in a printed Mushaf.
  const page = 2 * (1 + Math.floor(Math.random() * (MUSHAF_PAGES / 2)));
  const [ar, fa] = await Promise.all([fetchPage(page, "quran-uthmani"), fetchPage(page, translationId)]);
  const a = ar[0];
  const f = fa.find((x) => x.number === a.number) ?? fa[0];
  const { verdict, cues } = classify(f.text);
  return {
    page,
    surah: a.surah,
    ayah: a.numberInSurah,
    arabic: a.text,
    translation: f.text,
    translator: TRANSLATIONS[translationId],
    translationId,
    verdict,
    cues,
    source: {
      text: "متن عربی (رسم عثمانی) و ترجمهٔ فارسی از Al Quran Cloud",
      url: `https://alquran.cloud/ayah/${a.number}`,
      method: "روش سنتی: نگاه به نخستین آیهٔ صفحهٔ سمت راست پس از طلب خیر از خداوند (منقول در بحارالانوار؛ شرح در پایگاه حوزه)",
      methodUrl: "https://hawzah.net/fa/Article/View/4516",
    },
  };
}
