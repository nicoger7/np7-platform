import Link from "next/link";
import { flags } from "@/lib/flags";
import type { Metadata } from "next";
import { OceanHeader } from "@/components/experience/ocean-header";

export const metadata: Metadata = {
  title: "Package travel — standard information | NP7 Experience",
  description: "Your rights under the EU Package Travel Directive when booking an NP7 Experience.",
};

/**
 * Standard pre-contractual information form (EU Directive 2015/2302 / §651a BGB).
 * DRAFT — summarises the statutory key rights and organiser details; the binding
 * German Formblatt + insolvency protector (Sicherungsschein) must be finalised
 * with legal counsel before going live.
 */
export default function PackageTravelInfoPage() {
  return (
    <>
      <OceanHeader  showAbout={flags.showExperience} showHardware={flags.showHardware} />
      <main className="bg-[#fff7ec] min-h-[100svh]">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8 pt-28 pb-20">
          <p className="text-[11px] font-bold tracking-[0.25em] uppercase text-[#00afdb] mb-3">PACKAGE TRAVEL · STANDARD INFORMATION</p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-5">Your rights when you book an NP7 Experience</h1>

          <div className="rounded-xl bg-[#fff3da] border border-[#f0d9a8] px-5 py-3.5 text-[13px] text-[#8a6d2e] mb-8">
            ⚠️ Draft for review. The binding German standard information form (Formblatt) and the
            insolvency-protection certificate are being finalised with our lawyer.
          </div>

          <Section title="This is a package">
            <p>The combination of travel services we offer you — windsurf coaching together with accommodation — is a <strong>package</strong> within the meaning of EU Directive (EU) 2015/2302 and §651a of the German Civil Code (BGB). You therefore benefit from all EU rights applying to packages. <strong>NP7 GmbH</strong> is fully responsible for the proper performance of the package as a whole.</p>
          </Section>

          <Section title="Your key rights">
            <ul className="space-y-2.5">
              {[
                "You will receive all essential information about the package before you conclude the booking contract.",
                "NP7 GmbH is responsible for the proper performance of all travel services included in the package.",
                "You are given an emergency phone number / contact to reach NP7 if you face difficulties.",
                "You may transfer your booking to another person, giving reasonable notice and possibly subject to additional costs.",
                "The price may only be increased in specific, limited cases and never later than 20 days before departure. If the increase exceeds 8% of the price, you may cancel free of charge.",
                "You may cancel without a cancellation fee and get a full refund if essential elements of the package (other than the price) change significantly.",
                "You may cancel the contract before the start against a reasonable cancellation fee.",
                "If unavoidable, extraordinary circumstances occur at the destination, you may cancel free of charge before departure.",
                "If services are not performed properly, NP7 will remedy the problem; you may be entitled to a price reduction and/or compensation.",
                "If you are in difficulty, NP7 will provide assistance.",
                "If NP7 becomes insolvent, your payments are protected and refunded (and, where transport is included, your repatriation is ensured).",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-[14.5px] text-[#3a4b52] leading-relaxed">
                  <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-[#00afdb]/10 text-[#00afdb] grid place-items-center"><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></span>
                  {t}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Organiser">
            <p><strong>NP7 GmbH</strong><br />Germany<br />experience@np-seven.com</p>
          </Section>

          <Section title="Insolvency protection">
            <p>Payments are protected against NP7 GmbH&apos;s insolvency. <span className="bg-[#fff3da] px-1.5 rounded text-[#8a6d2e]">[Insurer / protector and certificate number to be inserted by NP7]</span>. You can contact the protector if services are denied because of NP7&apos;s insolvency.</p>
          </Section>

          <Section title="The Directive">
            <p>Directive (EU) 2015/2302 as transposed into German law (§§651a ff. BGB) is available from the official EU and German government sources. The full booking terms (AGB) and your individual booking confirmation form part of your contract.</p>
          </Section>

          <p className="mt-10 text-[13px] text-[#9aa6ac]">
            <Link href="/experience" className="text-[#00afdb] font-semibold">← Back to experiences</Link>
          </p>
        </div>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-[#00374a] mb-2.5">{title}</h2>
      <div className="text-[14.5px] text-[#4a5b62] leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
