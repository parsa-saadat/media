export const PERMISSIONS = [
  { key: "admin.access", label: "دسترسی به پنل مدیریت", group: "مدیریت" },
  { key: "users.view", label: "مشاهده کاربران", group: "مدیریت" },
  { key: "users.manage", label: "مدیریت کاربران و اختصاص نقش", group: "مدیریت" },
  { key: "users.ban", label: "مسدودسازی کاربران", group: "مدیریت" },
  { key: "roles.manage", label: "تعریف و ویرایش نقش‌ها", group: "مدیریت" },
  { key: "rooms.manage", label: "مدیریت و حذف اتاق‌ها", group: "مدیریت" },
  { key: "messages.delete_any", label: "حذف پیام دیگران", group: "مدیریت" },
  { key: "voice.moderate", label: "قطع میکروفون و ربات اعضا در همه اتاق‌ها", group: "مدیریت" },
  { key: "meetings.create", label: "ساخت جلسهٔ صوتی/تصویری (میت)", group: "کاربری" },
  { key: "screen.share", label: "اشتراک صفحهٔ نمایش", group: "کاربری" },
  { key: "groups.create", label: "ساخت گروه خصوصی", group: "کاربری" },
  { key: "messages.send", label: "ارسال پیام", group: "کاربری" },
  { key: "files.upload", label: "ارسال فایل", group: "کاربری" },
  { key: "images.upload", label: "ارسال تصویر", group: "کاربری" },
  { key: "avatar.upload", label: "گذاشتن عکس پروفایل", group: "کاربری" },
  { key: "friends.request", label: "ارسال درخواست دوستی", group: "کاربری" },
  { key: "voice.join", label: "ورود به تماس صوتی", group: "صوتی" },
  { key: "voice.speak", label: "صحبت با میکروفون", group: "صوتی" },
  { key: "voice.play", label: "پخش موسیقی با ربات شخصی", group: "صوتی" },
  { key: "content.manage", label: "مدیریت آیات و احادیث و آیهٔ روز", group: "مدیریت" },
  { key: "azan.manage", label: "افزودن و حذف صداهای اذان", group: "مدیریت" },
];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export const DEFAULT_USER_PERMISSIONS = [
  "meetings.create", "groups.create", "messages.send", "files.upload", "images.upload", "avatar.upload", "friends.request",
  "voice.join", "voice.speak", "voice.play", "screen.share",
];

/**
 * Per-role image quota: how many images (chat pictures + profile photos) a member of the role may have
 * uploaded in total. 0 means unlimited. A user with several roles gets the most generous one.
 */
export const DEFAULT_IMAGE_LIMIT = 50;
export const UNLIMITED_IMAGES = 0;

/**
 * Per-role maximum meeting lifetime in hours.
 * 0 means unlimited; default for regular users ("کاربر") is 24 hours.
 * A user with multiple roles receives the most generous (highest / unlimited) cap.
 */
export const DEFAULT_MEETING_HOURS = 24;
export const UNLIMITED_MEETING_HOURS = 0;

export const MODERATOR_PERMISSIONS = [
  ...DEFAULT_USER_PERMISSIONS,
  "admin.access", "users.view", "users.ban", "rooms.manage", "messages.delete_any", "voice.moderate", "content.manage",
];

export const ADMIN_ROLE_NAME = "مدیر کل";

export const SYSTEM_ROLES = [
  { name: ADMIN_ROLE_NAME, description: "دسترسی کامل به همه بخش‌ها", color: "#f43f5e", isDefault: false, permissions: ALL_PERMISSION_KEYS, imageLimit: UNLIMITED_IMAGES, maxMeetingHours: UNLIMITED_MEETING_HOURS },
  { name: "ناظر", description: "نظارت بر اتاق‌ها و کاربران", color: "#f59e0b", isDefault: false, permissions: MODERATOR_PERMISSIONS, imageLimit: 500, maxMeetingHours: 72 },
  { name: "کاربر", description: "نقش پیش‌فرض کاربران جدید", color: "#8b5cf6", isDefault: true, permissions: DEFAULT_USER_PERMISSIONS, imageLimit: DEFAULT_IMAGE_LIMIT, maxMeetingHours: DEFAULT_MEETING_HOURS },
];
