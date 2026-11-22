export const normalizeUsername = (raw) => raw.trim().replace(/^@/, "").toLowerCase();

/** 3–32 characters: starts with a letter, then letters, digits or underscore. */
export const isValidUsername = (username) => /^[a-z][a-z0-9_]{2,31}$/.test(username);
