import type { Metadata } from "next";
import { getLegalEntity } from "@/lib/legal";
import { LegalShell } from "@/components/shared/legal-shell";

export const metadata: Metadata = { title: "Terms — NP7", robots: { index: true } };
export const revalidate = 86400;

export default async function TermsPage() {
  const e = await getLegalEntity();
  const contact = e.email || "experience@np-seven.com";

  return (
    <LegalShell title="Terms" updated="21 June 2026">
      <p className="note">
        <strong>Draft — have your travel-law counsel review before go-live.</strong> Surfcenter is currently our
        booking &amp; payment partner and carries the insolvency protection (Sicherungsschein); the trip terms and
        the cancellation scale below are NP7&apos;s own.
      </p>

      <h2>1. The booking contract</h2>
      <p>Trips are run under the NP7 Experience programme, with <strong>Surfcenter</strong> currently acting as our booking &amp; payment partner and providing the statutory pre-contractual information and insolvency-protection certificate (Sicherungsschein) before any prepayment. The trip terms, prices and cancellation policy below are ours. {e.legalName} provides the NP7 brand, coaching and this platform.</p>

      <h2>2. Registration &amp; securing your spot</h2>
      <p>Registering is free and places you as a lead — it does not hold a spot. A spot is secured only once the <strong>deposit</strong> is received. The remaining balance is paid in milestones — a <strong>downpayment</strong> (50% of the trip total) and then the <strong>final balance</strong> — by bank transfer, each due by the date shown in your account. You may always pay any milestone sooner.</p>

      <h2>3. Cancellation</h2>
      <p>You can cancel any time before the trip. The cancellation fee follows what you&apos;ve paid, on a graduated scale:</p>
      <ul>
        <li><strong>Before the deposit, or within its refund window</strong> (14 days after it&apos;s paid) — free; any deposit is refunded in full.</li>
        <li><strong>After the deposit&apos;s refund window</strong> — the deposit is kept as the cancellation fee; nothing further is owed.</li>
        <li><strong>After the 50% downpayment</strong> — the cancellation fee is the amount paid (50% of the trip).</li>
        <li><strong>After the final balance</strong> — the cancellation fee is the full amount.</li>
      </ul>
      <p>Where a cancellation falls in a non-refundable band, we offer a goodwill <strong>credit voucher</strong> toward a future NP7 experience. Your mandatory statutory rights are unaffected.</p>

      <h2>4. Conditions are not guaranteed</h2>
      <p>Wind, weather and water conditions are natural and cannot be guaranteed. The programme may be adapted for safety or conditions. A lack of wind alone is not a defect of the trip and does not, by itself, give a right to a refund, subject to your mandatory statutory rights.</p>

      <h2>5. Participation &amp; waiver</h2>
      <p>Watersports carry inherent risk. Each participant signs a participation waiver and health declaration in their account before the trip. You are responsible for your own travel, health and accident insurance.</p>

      <h2>6. Platform use</h2>
      <p>Use the member area and any content only for your own booking. Don’t misuse, scrape or attempt to disrupt the service. Content and brand remain the property of {e.legalName} and its partners.</p>

      <h2>7. Liability</h2>
      <p>To the extent permitted by law, {e.legalName} is liable without limitation only for injury to life, body or health, and for intent or gross negligence. Mandatory statutory liability (incl. under the German Product Liability Act and package-travel law) is unaffected. Your mandatory consumer rights remain unaffected.</p>

      <h2>8. Governing law</h2>
      <p>German law applies, excluding the UN Convention on Contracts for the International Sale of Goods; mandatory consumer-protection rules of your country of residence remain unaffected.</p>

      <h2>9. Contact</h2>
      <p>Questions about these terms: <a href={`mailto:${contact}`}>{contact}</a>.</p>
    </LegalShell>
  );
}
