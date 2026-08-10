"use client";

/**
 * A phone number with its country code in front.
 *
 * A bare "Phone" box gets you 0532 123 45 67 from a Turkish parent, which is
 * unreachable from anywhere but Turkey — and the one number you must be able to
 * dial is the guardian of a minor on the water. So the dial code is a separate,
 * always-visible choice rather than something the buyer is expected to know to
 * type.
 *
 * The value handed up is a single E.164-ish string ("+90 532 1234567"), because
 * every consumer downstream — booking notes, emails, the admin — wants one
 * field, not two.
 */

/** Dial codes for where NP7 actually sells, most likely first. */
const DIALS: { code: string; label: string; flag: string }[] = [
  { code: "+49", label: "Germany", flag: "🇩🇪" },
  { code: "+90", label: "Türkiye", flag: "🇹🇷" },
  { code: "+31", label: "Netherlands", flag: "🇳🇱" },
  { code: "+43", label: "Austria", flag: "🇦🇹" },
  { code: "+41", label: "Switzerland", flag: "🇨🇭" },
  { code: "+32", label: "Belgium", flag: "🇧🇪" },
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+39", label: "Italy", flag: "🇮🇹" },
  { code: "+34", label: "Spain", flag: "🇪🇸" },
  { code: "+351", label: "Portugal", flag: "🇵🇹" },
  { code: "+44", label: "United Kingdom", flag: "🇬🇧" },
  { code: "+353", label: "Ireland", flag: "🇮🇪" },
  { code: "+45", label: "Denmark", flag: "🇩🇰" },
  { code: "+46", label: "Sweden", flag: "🇸🇪" },
  { code: "+47", label: "Norway", flag: "🇳🇴" },
  { code: "+358", label: "Finland", flag: "🇫🇮" },
  { code: "+48", label: "Poland", flag: "🇵🇱" },
  { code: "+420", label: "Czechia", flag: "🇨🇿" },
  { code: "+36", label: "Hungary", flag: "🇭🇺" },
  { code: "+30", label: "Greece", flag: "🇬🇷" },
  { code: "+385", label: "Croatia", flag: "🇭🇷" },
  { code: "+1", label: "USA / Canada", flag: "🇺🇸" },
  { code: "+27", label: "South Africa", flag: "🇿🇦" },
  { code: "+61", label: "Australia", flag: "🇦🇺" },
  { code: "+599", label: "Bonaire", flag: "🇧🇶" },
];

/** Guess the dial code from a free-text location ("Alaçatı, Turkey" → +90). */
export function dialForLocation(location: string | null | undefined): string {
  const s = (location ?? "").toLowerCase();
  const hits: [string, string][] = [
    ["turk", "+90"], ["türk", "+90"], ["alaçatı", "+90"], ["alacati", "+90"],
    ["german", "+49"], ["fehmarn", "+49"], ["ostsee", "+49"],
    ["netherland", "+31"], ["holland", "+31"],
    ["austria", "+43"], ["switzerland", "+41"], ["belgium", "+32"],
    ["france", "+33"], ["italy", "+39"], ["garda", "+39"],
    ["spain", "+34"], ["tenerife", "+34"], ["fuerteventura", "+34"], ["canar", "+34"],
    ["portugal", "+351"], ["united kingdom", "+44"], ["england", "+44"],
    ["denmark", "+45"], ["sweden", "+46"], ["norway", "+47"], ["finland", "+358"],
    ["greece", "+30"], ["croatia", "+385"], ["volosko", "+385"],
    ["bonaire", "+599"], ["south africa", "+27"], ["langebaan", "+27"],
    ["hawai", "+1"], ["maui", "+1"], ["carolina", "+1"], ["hatteras", "+1"], ["united states", "+1"],
  ];
  for (const [needle, code] of hits) if (s.includes(needle)) return code;
  return "+49";
}

export function PhoneField({
  dial, onDial, number, onNumber, placeholder = "Phone number", inputClass, required = false,
}: {
  dial: string;
  onDial: (v: string) => void;
  number: string;
  onNumber: (v: string) => void;
  placeholder?: string;
  inputClass: string;
  required?: boolean;
}) {
  // The caller's input class starts with `w-full`, and a second width in the
  // same class string is a coin toss decided by Tailwind's output order — not
  // by which one is written last. On a phone `w-full` won, so the dial select
  // filled the row and pushed the number field off the card. Strip it rather
  // than try to out-specify it.
  const selectClass = inputClass.replace(/(^|\s)w-full(\s|$)/, " ");

  return (
    <span className="flex gap-2 w-full min-w-0">
      <select
        value={dial}
        onChange={(e) => onDial(e.target.value)}
        aria-label="Country dialling code"
        className={`${selectClass} shrink-0 basis-[108px] w-[108px] px-2.5 cursor-pointer`}
      >
        {DIALS.map((d) => (
          <option key={d.code + d.label} value={d.code}>{d.flag} {d.code}</option>
        ))}
      </select>
      <input
        className={`${inputClass} flex-1 min-w-0 basis-0`}
        placeholder={placeholder}
        value={number}
        // A leading zero is a national prefix — it is wrong once a country code
        // is in front of it, and it is the single commonest way these numbers
        // arrive undiallable.
        onChange={(e) => onNumber(e.target.value.replace(/^[\s0]+/, ""))}
        autoComplete="tel-national"
        inputMode="tel"
        required={required}
      />
    </span>
  );
}

/** Join the two halves into the one string everything downstream expects. */
export function joinPhone(dial: string, number: string): string {
  const n = number.trim();
  return n ? `${dial} ${n}`.trim() : "";
}
