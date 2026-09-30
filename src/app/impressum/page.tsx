import type { Metadata } from "next";
import { getLegalEntity } from "@/lib/legal";
import { LegalShell } from "@/components/shared/legal-shell";

// Bare title: the root layout's template adds " · NP7" itself. Spelling it here
// as well read "Impressum · NP7 · NP7" in the tab and in Google (site audit, 27 Sep 2026).
export const metadata: Metadata = { title: "Impressum", robots: { index: true } };
export const revalidate = 86400;

export default async function ImpressumPage() {
  const e = await getLegalEntity();
  const has = (v: string) => v && v.trim().length > 0;

  return (
    <LegalShell title="Impressum">
      {/* The details come from Admin → Company settings (legal.ts). That sentence
          used to be printed here for the reader, in English, on a German legal
          page (Nico, 1 Oct 2026). § 5 DDG replaced § 5 TMG in May 2024. */}
      <p className="note">Angaben gemäß § 5 DDG / § 18 MStV</p>

      <h2>Diensteanbieter</h2>
      <p>
        <strong>{e.legalName}</strong><br />
        {has(e.addressLine1) && <>{e.addressLine1}<br /></>}
        {has(e.addressLine2) && <>{e.addressLine2}<br /></>}
        {(has(e.postalCode) || has(e.city)) && <>{[e.postalCode, e.city].filter(Boolean).join(" ")}<br /></>}
        {has(e.country) && <>{e.country}</>}
      </p>

      <h2>Kontakt</h2>
      <p>
        {has(e.email) && <>E-Mail: <a href={`mailto:${e.email}`}>{e.email}</a><br /></>}
        {has(e.phone) && <>Telefon: {e.phone}<br /></>}
        {has(e.website) && <>Web: <a href={`https://${e.website.replace(/^https?:\/\//, "")}`}>{e.website}</a></>}
      </p>

      {has(e.managingDirector) && (
        <>
          <h2>Vertretungsberechtigt</h2>
          <p>{e.managingDirector}</p>
        </>
      )}

      {(has(e.registerInfo) || has(e.vatId) || has(e.taxNumber)) && (
        <>
          <h2>Register &amp; Steuer</h2>
          <p>
            {has(e.registerInfo) && <>{e.registerInfo}<br /></>}
            {has(e.vatId) && <>USt-IdNr.: {e.vatId}<br /></>}
            {has(e.taxNumber) && <>Steuernummer: {e.taxNumber}</>}
          </p>
        </>
      )}

      <h2>Verantwortlich i.S.d. § 18 Abs. 2 MStV</h2>
      <p>{has(e.managingDirector) ? e.managingDirector : e.legalName}{has(e.addressLine1) ? `, ${e.addressLine1}, ${[e.postalCode, e.city].filter(Boolean).join(" ")}` : ""}</p>

      {/* The EU's online dispute platform (OS) was shut down on 20 July 2025 and
          the duty to link it went with it, so the dead link is gone. The § 36
          VSBG statement stays. */}
      <h2>Verbraucherstreitbeilegung</h2>
      <p>
        Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>
    </LegalShell>
  );
}
