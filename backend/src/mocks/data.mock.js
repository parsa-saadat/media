import { ADMIN_ROLE_NAME } from "../config/permissions.config.js";

/**
 * MOCK DATA — ready-made accounts and sample chats so the app can be tried without registering.
 * Every mock account uses the same password. Disable with SEED_MOCK_DATA=false (or STATUS=PROD).
 */
export const MOCK_PASSWORD = "Voxsy123!";

export const MOCK_USERS = [
  { phone: "09120000000", username: "voxsy_demo", displayName: "مدیر آزمایشی", bio: "حساب مدیر برای آزمودن همه بخش‌ها", avatarColor: "#8b5cf6", roles: [ADMIN_ROLE_NAME, "کاربر"], label: "مدیر کل" },
  { phone: "09121111111", username: "voxsy_friend", displayName: "دوست آزمایشی", bio: "برای آزمودن گفتگو و تماس صوتی", avatarColor: "#06b6d4", roles: ["کاربر"], label: "کاربر عادی" },
  { phone: "09122222222", username: "sara_ahmadi", displayName: "سارا احمدی", bio: "ناظر اتاق‌ها", avatarColor: "#ec4899", roles: ["ناظر", "کاربر"], label: "ناظر" },
  { phone: "09123333333", username: "reza_karimi", displayName: "رضا کریمی", bio: "برنامه‌نویس و علاقه‌مند به موسیقی", avatarColor: "#22c55e", roles: ["کاربر"], label: "کاربر عادی" },
  { phone: "09124444444", username: "maryam_hosseini", displayName: "مریم حسینی", bio: "دوست‌دار کتاب و شعر", avatarColor: "#f97316", roles: ["کاربر"], label: "کاربر عادی" },
];

export const MOCK_CHATS = [
  {
    type: "group",
    name: "گفتگوی آزاد inebuly",
    description: "گروه آزمایشی برای چت، تماس صوتی و اشتراک صفحه",
    emoji: "music",
    owner: "voxsy_demo",
    members: ["voxsy_friend", "sara_ahmadi", "reza_karimi", "maryam_hosseini"],
    messages: [
      ["sara_ahmadi", "سلام به همه، به inebuly خوش آمدید."],
      ["reza_karimi", "سلام. کسی تماس صوتی گروهی را امتحان کرده؟"],
      ["voxsy_friend", "من امتحان کردم، کیفیت صدا خوب بود."],
      ["maryam_hosseini", "ربات موسیقی هم جالب است؛ هر کسی می‌تواند آهنگ خودش را پخش کند."],
      ["voxsy_demo", "هر پیشنهادی برای بهتر شدن اینجا دارید همین‌جا بنویسید."],
    ],
  },
  {
    type: "group",
    name: "برنامه‌نویسی",
    description: "گروه خصوصی؛ پرسش و پاسخ و تجربه‌های کدنویسی",
    emoji: "rocket",
    owner: "reza_karimi",
    members: ["voxsy_demo", "sara_ahmadi"],
    messages: [
      ["reza_karimi", "این اتاق برای پرسش و پاسخ برنامه‌نویسی است."],
      ["sara_ahmadi", "کسی با MongoDB و Node.js کار کرده؟ برای طراحی مجموعه‌ها سؤال دارم."],
      ["reza_karimi", "بله، بپرس. من داده‌هایی را که با هم خوانده می‌شوند در یک سند نگه می‌دارم."],
      ["voxsy_demo", "کدها را می‌توانید به شکل فایل هم بفرستید."],
    ],
  },
  {
    type: "group",
    name: "کتاب و شعر",
    description: "معرفی کتاب، شعر و نوشته‌های خوب",
    emoji: "book",
    owner: "maryam_hosseini",
    members: ["voxsy_friend"],
    messages: [
      ["maryam_hosseini", "هر هفته یک کتاب خوب معرفی می‌کنیم."],
      ["voxsy_friend", "این هفته «بوستان سعدی» را پیشنهاد می‌کنم."],
      ["maryam_hosseini", "بنی‌آدم اعضای یکدیگرند، که در آفرینش ز یک گوهرند"],
    ],
  },
  {
    type: "group",
    name: "دورهمی دوستان",
    description: "گروه خصوصی آزمایشی؛ فقط با دعوت مدیر گروه",
    emoji: "coffee",
    owner: "voxsy_demo",
    members: ["voxsy_friend", "sara_ahmadi"],
    messages: [
      ["voxsy_demo", "این گروه خصوصی است و فقط با دعوت مدیر می‌شود عضو شد."],
      ["sara_ahmadi", "عالی، برنامهٔ آخر هفته را همین‌جا هماهنگ کنیم."],
      ["voxsy_friend", "من هستم."],
    ],
  },
];

export const MOCK_DIRECTS = [
  {
    between: ["voxsy_demo", "voxsy_friend"],
    messages: [
      ["voxsy_friend", "سلام، وقت داری تماس صوتی را با هم امتحان کنیم؟"],
      ["voxsy_demo", "سلام، بله. روی دکمهٔ «تماس صوتی» بالای همین گفتگو بزن."],
      ["voxsy_friend", "رسیدم، منتظرم."],
    ],
  },
];

export const MOCK_FRIENDSHIPS = [
  ["voxsy_demo", "voxsy_friend", "accepted"],
  ["voxsy_demo", "sara_ahmadi", "accepted"],
  ["voxsy_friend", "maryam_hosseini", "accepted"],
  ["reza_karimi", "voxsy_demo", "pending"],
];
