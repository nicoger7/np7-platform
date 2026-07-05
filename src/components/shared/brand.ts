import { cdn } from "@/lib/cdn";

/** Shared brand constants (leaf module — safe to import anywhere, no cycles). */
export const NP7_LOGO = cdn('logos/np7-logo.png');

/** The "NP7 Experience" lock-up (used across the Experience sub-site + emails). */
export const NP7_EXPERIENCE_LOGO = cdn('logos/np7-experience-logo.png');

/** Brand "sun → sea" warmth — sun yellow, coral, ocean, deep sea. */
export const SUN_TO_SEA = "linear-gradient(90deg,#ffc42e,#f47b20,#00afdb)";
