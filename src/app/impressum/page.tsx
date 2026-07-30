import type { Metadata } from "next";
import { getLegalEntity } from "@/lib/legal";
import { LegalShell } from "@/components/shared/legal-shell";

export const metadata: Metadata = { title: "Impressum — NP7", robots: { index: true } };
export const revalidate = 86400;

export default async function ImpressumPage() {
  const e = await getLegalEntity();
  const has = (v: string) => v && v.trim().length > 0;

  return (
    <LegalShell title="Impressum">
      <p className="note">
        Angaben gemäß § 5 TMG / § 18 MStV. The details below are maintained in the admin company
        settings — fill any blanks there. Bookings &amp; payments are currently operated by our partner
        Surfcenter; see <a href="/terms">Terms</a> for the booking party.
      </p>

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

      <h2>EU-Streitschlichtung</h2>
      <p>
        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
        <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener">https://ec.europa.eu/consumers/odr/</a>.
        Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>
    </LegalShell>
  );
}
