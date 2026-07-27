import type { Metadata } from "next";
import Link from "next/link";
import { getLegalEntity, addressLine } from "@/lib/legal";
import { LegalShell } from "@/components/shared/legal-shell";

export const metadata: Metadata = { title: "Widerrufsbelehrung — NP7", robots: { index: true } };
export const revalidate = 300;

/**
 * Statutory withdrawal instruction (Muster-Widerrufsbelehrung, Anlage 1 EGBGB,
 * 2026 version incl. the online-withdrawal-function module) for the contract
 * types that carry a statutory Widerrufsrecht — today: value gift vouchers.
 * Trips (package travel) and fixed-date events are legally excluded; their
 * negative notice is below. Drafted per the statutory model — have counsel
 * confirm before the big public reveal.
 */
export default async function WiderrufsbelehrungPage() {
  const e = await getLegalEntity();
  const addr = addressLine(e);

  return (
    <LegalShell title="Widerrufsbelehrung">
      <p className="note">
        Gilt für online geschlossene Verträge mit gesetzlichem Widerrufsrecht — derzeit insbesondere den
        Kauf von <strong>Wertgutscheinen</strong>. <em>English summary at the end.</em>
      </p>

      <h2>Widerrufsrecht</h2>
      <p>
        Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.
        Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.
      </p>
      <p>
        Um Ihr Widerrufsrecht auszuüben, müssen Sie uns ({e.legalName}{addr ? `, ${addr}` : ""}
        {e.email ? `, E-Mail: ${e.email}` : ""}) mittels einer eindeutigen Erklärung (z.&nbsp;B. ein mit
        der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen,
        informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht
        vorgeschrieben ist.
      </p>
      <p>
        <strong>Sie können Ihr Widerrufsrecht auch online über unsere Widerrufsfunktion unter{" "}
        <Link href="/widerruf">www.np-seven.com/widerruf</Link> ausüben.</strong> Wenn Sie von dieser
        Möglichkeit Gebrauch machen, bestätigen wir Ihnen unverzüglich den Eingang Ihres Widerrufs auf
        einem dauerhaften Datenträger (z.&nbsp;B. per E-Mail) einschließlich Datum und Uhrzeit des Eingangs.
      </p>
      <p>
        Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des
        Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.
      </p>

      <h2>Folgen des Widerrufs</h2>
      <p>
        Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten
        haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die
        Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung
        verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt
        haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden
        Ihnen wegen dieser Rückzahlung Entgelte berechnet.
      </p>

      <h2>Muster-Widerrufsformular</h2>
      <p className="note">
        Wenn Sie den Vertrag widerrufen wollen, füllen Sie bitte dieses Formular aus und senden Sie es
        zurück — oder nutzen Sie einfach die <Link href="/widerruf">Online-Widerrufsfunktion</Link>.
      </p>
      <p>
        An {e.legalName}{addr ? `, ${addr}` : ""}{e.email ? `, E-Mail: ${e.email}` : ""}:<br /><br />
        Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der
        folgenden Waren (*) / die Erbringung der folgenden Dienstleistung (*)<br /><br />
        — Bestellt am (*) / erhalten am (*):<br />
        — Name des/der Verbraucher(s):<br />
        — Anschrift des/der Verbraucher(s):<br />
        — Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):<br />
        — Datum:<br /><br />
        (*) Unzutreffendes streichen.
      </p>

      <h2>Kein Widerrufsrecht bei Reisen und Terminen</h2>
      <p>
        Für online gebuchte <strong>Reisen (Pauschalreisen)</strong> besteht kein gesetzliches
        Widerrufsrecht (§ 312 Abs. 6 BGB); es gelten stattdessen die gesetzlichen Rücktrittsrechte
        (§ 651h BGB) und unsere vertraglichen Stornobedingungen. Für <strong>Veranstaltungen und
        Clinics mit festem Termin</strong> besteht ebenfalls kein gesetzliches Widerrufsrecht
        (§ 312g Abs. 2 Nr. 9 BGB). Unsere kulanten Erstattungsregelungen — etwa die 14-tägige
        Rückerstattbarkeit von Anzahlungen — bleiben davon unberührt.
      </p>

      <h2>English summary</h2>
      <p>
        Value gift vouchers bought online carry the statutory 14-day right of withdrawal — exercise it
        by any unequivocal statement or via the <Link href="/widerruf">online withdrawal function</Link>;
        we confirm receipt with date and time by email, and refund within 14 days using your original
        payment method. Package-travel trips and fixed-date events are excluded from the statutory
        withdrawal right by law; our contractual refund policies apply to those instead.
      </p>
    </LegalShell>
  );
}
