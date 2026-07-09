import type { Metadata } from "next";
import { getLegalEntity, addressLine } from "@/lib/legal";
import { LegalShell } from "@/components/shared/legal-shell";

export const metadata: Metadata = { title: { absolute: "Privacy Policy — NP7" }, robots: { index: true } };
export const revalidate = 300;

export default async function PrivacyPage() {
  const e = await getLegalEntity();
  const contact = e.email || "privacy@np-seven.com";

  return (
    <LegalShell title="Privacy Policy" updated="21 June 2026">
      <p className="note">
        <strong>Draft template — have this reviewed by your data-protection counsel before relying on it.</strong>{" "}
        It describes the processing this platform actually performs; adjust to your final setup and the
        Surfcenter operating arrangement.
      </p>

      <h2>1. Controller</h2>
      <p>{e.legalName}{addressLine(e) ? `, ${addressLine(e)}` : ""}. Contact: <a href={`mailto:${contact}`}>{contact}</a>.</p>

      <h2>2. What we process, why, and on what basis</h2>
      <h3>Account &amp; registration</h3>
      <p>When you register or sign in we process your <strong>name and email</strong> to create your member account and your trip registration (Art. 6(1)(b) GDPR — pre-contract/contract). Sign-in uses a one-time magic link.</p>
      <h3>Bookings, payments &amp; documents</h3>
      <p>To manage a booking we process trip details, your payment milestones, invoices and (where applicable) your billing address and travel-partner details (Art. 6(1)(b)). Payments are handled by bank transfer via our operating partner; we record which milestones are paid.</p>
      <h3>Waiver &amp; health declaration</h3>
      <p>If you sign a participation waiver we store your signature, name and the version/time signed, plus a technical audit record (IP, user-agent) to evidence consent (Art. 6(1)(b) and (f) — legitimate interest in documenting agreements; health data only as you disclose it, Art. 9(2)(a)).</p>
      <h3>Marketing email (optional)</h3>
      <p>If you opt in, we send occasional news with your consent (Art. 6(1)(a)). You can withdraw any time via the unsubscribe link or by emailing us — withdrawal doesn’t affect prior processing.</p>
      <h3>Server logs &amp; security</h3>
      <p>Our hosting provider processes technical access data (e.g. IP address, timestamp) to deliver and secure the site (Art. 6(1)(f)). We use bot-protection on sign-up forms to prevent abuse.</p>

      <h2>3. Cookies &amp; local storage</h2>
      <p>We group cookies and similar local storage into three categories, which you control in the cookie banner (Art. 6(1)(a) for the optional ones):</p>
      <ul>
        <li><strong>Essential</strong> (always on, no consent needed, Art. 6(1)(f)) — a sign-in session cookie, a small preference for which section you’re viewing, and a record of your cookie choice.</li>
        <li><strong>Analytics</strong> (off unless you opt in) — our own <strong>first-party</strong> measurement of page views and the booking funnel. No third-party analytics tools, no advertising networks, and we store no IP address with it.</li>
        <li><strong>Marketing</strong> (off unless you opt in) — the <strong>Meta (Facebook) Pixel</strong>. When enabled it shares your interactions (e.g. pages viewed, registrations) with Meta Platforms Ireland Ltd. so we can measure and target our advertising. This sets third-party cookies and may transfer data to Meta (incl. the USA, safeguarded by EU Standard Contractual Clauses). You can withdraw consent any time via the cookie banner; this does not affect prior processing.</li>
      </ul>

      <h2>4. Processors &amp; recipients</h2>
      <ul>
        <li><strong>Supabase</strong> — database, authentication &amp; file storage (data-processing agreement in place).</li>
        <li><strong>Vercel</strong> — application hosting &amp; bot protection.</li>
        <li><strong>Resend</strong> — transactional &amp; (opted-in) marketing email delivery.</li>
        <li><strong>Surfcenter</strong> — our operating partner for bookings &amp; payments; receives the data needed to fulfil your trip.</li>
        <li><strong>Meta Platforms Ireland</strong> — Facebook/Instagram advertising measurement (Meta Pixel), <strong>only if you opt into Marketing cookies</strong>.</li>
      </ul>
      <p>Where a processor operates outside the EU/EEA, transfers are safeguarded by EU Standard Contractual Clauses or an adequacy decision.</p>

      <h2>5. Retention</h2>
      <p>We keep account and booking data for the duration of our relationship and as long as statutory retention periods require (e.g. commercial/tax law), then delete or anonymise it. Marketing consent data is kept until you withdraw.</p>

      <h2>6. Your rights</h2>
      <p>You have the right to access, rectification, erasure, restriction, data portability and objection, and to withdraw consent at any time. To exercise these, email <a href={`mailto:${contact}`}>{contact}</a>. You may also lodge a complaint with a supervisory authority (in Germany, your state’s data-protection authority).</p>

      <h2>7. Changes</h2>
      <p>We may update this policy as the platform evolves. The current version is always available here.</p>
    </LegalShell>
  );
}
