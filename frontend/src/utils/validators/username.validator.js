const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";

export const normalizeUsername = (raw) =>
  String(raw || "")
    .replace(/[۰-۹٠-٩]/g, (digit) => String(FA.includes(digit) ? FA.indexOf(digit) : AR.indexOf(digit)))
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

/** 3–32 characters: starts with a letter, then letters, digits or underscore. */
export const isValidUsername = (username) => /^[a-z][a-z0-9_]{2,31}$/.test(username);
