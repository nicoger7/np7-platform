/** Concrete colors for the install UI. Values may be hex or `var(--token)` so the
 *  admin banner can ride the live env accent while the member banner uses fixed
 *  Experience / Hardware colors. */
export interface InstallTheme {
  accent: string;       // CTA background / highlights
  accentText: string;   // text on `accent`
  surface: string;      // banner / modal background
  surfaceText: string;  // primary text on `surface`
  surfaceMuted: string; // secondary text on `surface`
  border: string;       // hairline borders
}
