# Die Gear-Wahl (Rental · Storage · Own gear)

*Modell A, entschieden 2026-08-26/27. Diese Datei ist die Wartungs-Referenz.*

## Woher die Daten kommen

Der öffentliche Toggle im Package-Picker (`2 · Gear`) zeigt **nie eigene Zahlen** —
alles kommt serverseitig aus zwei Quellen:

| Frage | Quelle |
|---|---|
| *Welche Optionen gibt es, und was kosten sie?* | `exp_components` mit `gear_option = 'rental' \| 'storage'` — die **Governor-Komponenten**. `sell_price` ist die Kundenwahrheit, `unit_cost` bleibt intern (P&L). |
| *Was steckt schon im Paketpreis?* | `exp_packages.gear_baseline` (`rental` · `storage` · `none`; leer = `rental`). |
| *Was zahlt der Gast bei Abweichung?* | Delta = `cost(Wahl) − cost(Baseline)`, gerechnet in `src/lib/gear-choice.ts`, ausgeliefert über `/api/register/quote` (dieselbe Engine wie Zahlungsplan & Rechnungen). |

**Scope-Auflösung der Komponenten** (in dieser Reihenfolge, erste Treffer gewinnen):
`edition_id`-genau → `year` enthält das Editionsjahr → experience-weit (kein Scope).
Beginner-Pakete ziehen eine Komponente mit „…Beginner" im Namen, falls vorhanden —
und **sehen den Toggle nie** (Rental ist bei Beginnern immer einfach enthalten).

**Was beim Buchen passiert:** Weicht der Gast von der Baseline ab, schreibt
`/api/register` **eine** Delta-Add-on-Zeile mit `component_id` auf die echte
Komponente (`exp_booking_addons`, Status confirmed, Quelle `booking`). Dadurch
stimmen Zahlungsplan, Rechnungen (inkl. Add-on-Invoice) und P&L automatisch.

## Wartungs-Checkliste — neue Edition / Experience

1. **Komponenten anlegen** (Admin → Components): Zimmer, Rental, Storage …
   `unit_cost` = Einkauf in € **mit Kurs-Notiz** („$360 @ 0.8569 · Aug 2026"),
   `sell_price` = Kundenpreis.
2. **Gear-Rollen flaggen**: pro Scope genau **eine** Komponente „Gear role =
   Rental" und optional **eine** „= Storage" (Components-Formular). Ohne diese
   Flags erscheint der Toggle für die Edition schlicht nicht — das ist gewollt
   (Bonaire 2027 zeigt z. B. nichts, solange die JibeCity-Komponenten nur
   `year = {2026}` tragen).
3. **Pakete: Baseline setzen** („Gear in price" — im Editions-Paket-Editor und
   auf der Packages-Seite): Rental included (Normalfall) · Storage included ·
   No gear included (z. B. Tenerife „Experience Only").
4. **`Cost / person` leer lassen** — leer heißt: P&L rechnet automatisch
   `Σ Komponenten-Einkauf × Menge`. Das Feld ist ein bewusster Override und
   friert Komponenten-Korrekturen ein; der Platzhalter zeigt den Auto-Wert,
   „Use component costs instead" leert ihn.
5. **Keine Gear-Paketvarianten mehr anlegen** („… + Rental", „Own Gear – …") —
   genau die ersetzt der Toggle.

## Invarianten (was nie passieren darf)

- Zwei Rental-Komponenten im selben Scope ohne Beginner-Unterscheidung →
  die Auswahl wird zufällig. Ein Scope, eine Rolle.
- Ein Paket mit `gear_baseline = 'rental'`, dessen Preis Rental real **nicht**
  enthält → der Toggle behauptet „included" und verschenkt Geld. Baseline ist
  eine Preis-Aussage, keine Marketing-Aussage.
- Preise im Frontend hartcodieren: der Picker zeigt ausschließlich Quote-Daten.
