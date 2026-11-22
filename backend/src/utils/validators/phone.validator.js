const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";

export const toEnglishDigits = (value) =>
  value.replace(/[۰-۹٠-٩]/g, (digit) => String(FA.includes(digit) ? FA.indexOf(digit) : AR.indexOf(digit)));

/** Accepts 0912…, 912…, +98912…, 0098912… (Persian or Arabic digits too) and returns 09xxxxxxxxx. */
export function normalizePhone(raw) {
  let phone = toEnglishDigits(raw).replace(/[\s\-()]/g, "");
  if (phone.startsWith("+98")) phone = "0" + phone.slice(3);
  else if (phone.startsWith("0098")) phone = "0" + phone.slice(4);
  else if (phone.startsWith("98") && phone.length === 12) phone = "0" + phone.slice(2);
  else if (phone.startsWith("9") && phone.length === 10) phone = "0" + phone;
  return phone;
}

export const isValidPhone = (phone) => /^09\d{9}$/.test(phone);
