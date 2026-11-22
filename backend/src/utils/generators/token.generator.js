import { randomBytes } from "node:crypto";

/** 256-bit session token (64 hex characters). */
export const generateSessionToken = () => randomBytes(32).toString("hex");

/** Identifies one "joined the call" instance, so a second tab replaces the first cleanly. */
export const generateJoinToken = () => randomBytes(20).toString("hex");
