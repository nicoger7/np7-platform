import type { Metadata } from "next";
import { getLegalEntity } from "@/lib/legal";
import { LegalShell } from "@/components/shared/legal-shell";

export const metadata: Metadata = { title: "Terms — NP7", robots: { index: true } };
export const revalidate = 300;

export default async function TermsPage() {
  const e = await getLegalEntity();
  const contact = e.email || "experience@np-seven.com";

  return (
    <LegalShell title="Terms" updated="21 June 2026">
      <p className="note">
        <strong>Draft — have your travel-law counsel review before go-live.</strong> While bookings run through
        our operating partner Surfcenter, their package-travel terms (AGB) and insolvency protection
        (Sicherungsschein) apply to the trip contract. This page covers use of the NP7 platform itself.
      </p>

      <h2>1. The booking contract</h2>
      <p>Trips are currently contracted and operated by <strong>Surfcenter</strong> as the package-travel organiser. Their terms, prices and cancellation rules govern your booking, and they provide the statutory pre-contractual information and insolvency-protection certificate (Sicherungsschein) before any prepayment. {e.legalName} provides the NP7 brand, coaching and this platform.</p>

      <h2>2. Registration &amp; securing your spot</h2>
      <p>Registering is free and places you as a lead — it does not hold a spot. A spot is secured only once the <strong>deposit</strong> is received. The deposit is refundable within the stated window after payment; thereafter the package-travel cancellation terms apply. The remaining balance is paid in milestones (downpayment, then final balance) by bank transfer, each due by the date shown in your account — you may always pay sooner.</p>

      <h2>3. Conditions are not guaranteed</h2>
      <p>Wind, weather and water conditions are natural and cannot be guaranteed. The programme may be adapted for safety or conditions. A lack of wind alone is not a defect of the trip and does not, by itself, give a right to a refund, subject to your mandatory statutory rights.</p>

      <h2>4. Participation &amp; waiver</h2>
      <p>Watersports carry inherent risk. Each participant signs a participation waiver and health declaration in their account before the trip. You are responsible for your own travel, health and accident insurance.</p>

      <h2>5. Platform use</h2>
      <p>Use the member area and any content only for your own booking. Don’t misuse, scrape or attempt to disrupt the service. Content and brand remain the property of {e.legalName} and its partners.</p>

      <h2>6. Liability</h2>
      <p>To the extent permitted by law, {e.legalName} is liable without limitation only for injury to life, body or health, and for intent or gross negligence. Mandatory statutory liability (incl. under the German Product Liability Act and package-travel law) is unaffected. Your mandatory consumer rights remain unaffected.</p>

      <h2>7. Governing law</h2>
      <p>German law applies, excluding the UN Convention on Contracts for the International Sale of Goods; mandatory consumer-protection rules of your country of residence remain unaffected.</p>

      <h2>8. Contact</h2>
      <p>Questions about these terms: <a href={`mailto:${contact}`}>{contact}</a>.</p>
    </LegalShell>
  );
}
