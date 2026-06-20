/** Bump when the default wording changes materially (so we know which version each person signed). */
export const WAIVER_VERSION = 1;

export type WaiverVars = {
  companyLegalName?: string;
  companyAddress?: string;
  companyCity?: string;
  companyEmail?: string;
  firstName?: string;
  lastName?: string;
  experienceTitle?: string;
  dates?: string;
  signedDate?: string;
};

const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

/**
 * Default waiver (HTML). Editable per experience (exp_experiences.waiver_text);
 * this is the fallback, exactly like the email-template defaults. {{vars}} fill
 * from company settings + the booking. NOTE: strong starting draft, not final
 * legal advice — get the wording lawyer-reviewed.
 */
export const DEFAULT_WAIVER = `
<h2>Participant agreement — assumption of risk, release &amp; waiver of liability</h2>
<p>Between <strong>{{companyLegalName}}</strong>, {{companyAddress}} (the &ldquo;Organiser&rdquo;) and <strong>{{firstName}} {{lastName}}</strong> (the &ldquo;Participant&rdquo;), for <strong>{{experienceTitle}}</strong> {{dates}}.</p>
<p><em>Please read this — it&rsquo;s a real agreement. By signing, you confirm you understand watersports carry risk and you accept the terms below.</em></p>
<h3>1 · The activities</h3>
<p>Windsurfing, wing foiling, foiling and related water- and beach-based activities, coaching, the use of equipment (provided by the Organiser or by third-party suppliers it works with), and associated transfers and on-site activities organised or facilitated by the Organiser.</p>
<h3>2 · Assumption of risk</h3>
<p>Watersports are inherently risky. I voluntarily accept the risks, including but not limited to: drowning and water inhalation; collisions with equipment, the seabed, people or objects; equipment failure; falls and impact; wind, waves, currents, tides and weather; sun, heat, cold and dehydration; marine life; the actions of others; and remote locations with limited medical facilities. Injury, illness, disability or death can result even with proper precautions.</p>
<h3>3 · Fitness, swimming &amp; health</h3>
<p>I confirm I am fit to participate, that <strong>I can swim</strong>, and that I have disclosed any medical condition, injury or medication affecting my safety — and I will report any change. I participate at my own judgement and risk.</p>
<h3>4 · Rules &amp; instructions</h3>
<p>I will follow all safety briefings, the instructions of coaches and staff, equipment limits, condition/flag systems and local rules. The Organiser may suspend or end my participation for safety reasons, with no refund where I caused it.</p>
<h3>5 · Equipment</h3>
<p>Where equipment is provided — by the Organiser or by a third-party supplier — I will use it carefully and as instructed, check it before use, and report any damage or concern. Where equipment is supplied by a third party, that supplier&rsquo;s own terms may also apply. I am responsible for loss of or damage to equipment caused by my misuse or negligence.</p>
<h3>6 · Release &amp; waiver of liability</h3>
<p>To the maximum extent permitted by applicable law, I release and hold harmless the Organiser, its owners, staff, coaches, agents and partners from all claims for loss, damage, injury or death arising out of or in connection with my participation, including claims based on ordinary negligence.</p>
<p><strong>This release does NOT apply — and the Organiser remains fully liable — for:</strong> (a) injury to life, body or health resulting from a negligent or intentional breach of duty by the Organiser or its legal representatives or agents; (b) other loss resulting from intent or gross negligence of the Organiser or its legal representatives or agents; and (c) any liability that cannot be excluded or limited by mandatory law (including under the German Product Liability Act and statutory package-travel rights). My mandatory statutory consumer rights are unaffected.</p>
<h3>7 · Indemnity</h3>
<p>To the extent permitted by law, I will indemnify the Organiser against third-party claims arising from my own breach of this agreement or my reckless or unlawful conduct.</p>
<h3>8 · Insurance</h3>
<p>The Organiser does not provide personal accident, medical, repatriation or travel insurance, and I am strongly advised to arrange my own adequate cover. I am responsible for my own medical, rescue and evacuation costs.</p>
<h3>9 · Media (optional)</h3>
<p>Photos and videos taken during the experience may be used by the Organiser for its own promotion. I can withdraw this consent at any time by contacting {{companyEmail}}; opting out does not affect my participation.</p>
<h3>10 · Minors</h3>
<p>If the Participant is under 18, this agreement must be read and signed by a parent or legal guardian on the minor&rsquo;s behalf.</p>
<h3>11 · Governing law</h3>
<p>This agreement is governed by the law of the Federal Republic of Germany, excluding the UN Convention on Contracts for the International Sale of Goods. The place of jurisdiction is {{companyCity}}, to the extent legally permissible. If I am a consumer, the mandatory consumer-protection rules of my country of residence remain unaffected.</p>
<h3>12 · Severability</h3>
<p>If any provision is or becomes invalid, the remainder stays in force and the invalid provision is replaced by the valid one that comes closest to its purpose.</p>
<h3>13 · Acknowledgement</h3>
<p>I confirm that I have read and understood this agreement, that I have had the opportunity to ask questions, and that I am signing it freely.</p>
`;

/** Replace {{var}} tokens (escaped). */
export function renderWaiver(text: string, vars: WaiverVars): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => esc((vars as Record<string, string | undefined>)[k] ?? ""));
}

/** Company vars (legal name, address line, city, email) from a company_settings row. */
export function waiverCompanyVars(cs: Record<string, unknown> | null | undefined): Pick<WaiverVars, "companyLegalName" | "companyAddress" | "companyCity" | "companyEmail"> {
  const g = (k: string) => (cs && typeof cs[k] === "string" ? (cs[k] as string) : "");
  const addr = [g("address_line1"), g("address_line2"), [g("postal_code"), g("city")].filter(Boolean).join(" "), g("country")].filter(Boolean).join(", ");
  return {
    companyLegalName: g("legal_name") || "the Organiser",
    companyAddress: addr,
    companyCity: g("city"),
    companyEmail: g("email"),
  };
}
