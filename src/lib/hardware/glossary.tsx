import type { ReactNode } from "react";

/**
 * Plain-language explanations for the trade jargon on the hardware supply
 * screens. Nobody should have to memorise Incoterms to place a factory order —
 * every one of these terms gets a (?) next to its field via <HelpHint>.
 */
export type GlossaryEntry = {
  title: string;
  intro: string;
  rows?: { term: string; text: string }[];
  footer?: ReactNode;
};

export const GLOSSARY: Record<string, GlossaryEntry> = {
  incoterm: {
    title: "Incoterm — who pays, and where risk passes",
    intro:
      "The one line in a factory contract that decides who books the freight, who insures the goods, and at exactly which point they become your problem. Pick the one your supplier quoted.",
    rows: [
      {
        term: "EXW · Ex Works",
        text: "You collect at the factory door. They just have it ready. Cheapest quote, most work and risk for you — you arrange export papers, freight, insurance, import.",
      },
      {
        term: "FOB · Free On Board",
        text: "The factory delivers to the ship and handles export clearance. Risk passes to you once it's loaded. The usual choice for container orders from Asia — quote you'll normally see.",
      },
      {
        term: "CIF · Cost, Insurance & Freight",
        text: "The factory books the sea freight and insurance to your destination port. Convenient, but you're paying their margin on the freight, and you still handle import duty and delivery from the port.",
      },
      {
        term: "DAP · Delivered At Place",
        text: "They deliver right to your (or the 3PL's) address. You pay import duty and VAT on arrival.",
      },
      {
        term: "DDP · Delivered Duty Paid",
        text: "Everything included, duty and import taxes paid by the factory. Most expensive quote, zero logistics work for you.",
      },
    ],
    footer: (
      <>
        <strong>Why it matters here:</strong> with <strong>FOB</strong> and <strong>EXW</strong> the
        goods are legally yours from the moment they leave the factory — that&apos;s why marking a
        shipment &ldquo;in transit&rdquo; books it into your stock while it&apos;s still on the
        water, and why freight and duty land on the unit cost in the landed-cost worksheet.
      </>
    ),
  },

  payment_terms: {
    title: "Payment terms — when the factory gets paid",
    intro:
      "Free text, written the way factories quote it. The classic for Asian production is a deposit up front to start the run, with the balance before the goods ship.",
    rows: [
      {
        term: "30/70 T/T",
        text: "The standard. 30% deposit by bank transfer (T/T = telegraphic transfer, i.e. a normal wire) when you place the order, 70% balance before shipping. Track both as payment rows on the PO.",
      },
      {
        term: "50/50 T/T",
        text: "Common for a first order with a new factory, or for small runs.",
      },
      {
        term: "100% before shipment",
        text: "Rare and unfavourable — you carry the full risk while they hold your cash.",
      },
      {
        term: "Net 30 / Net 60",
        text: "You pay 30 or 60 days after invoice. Factories rarely grant this until you have years of history; European suppliers do.",
      },
      {
        term: "L/C · Letter of Credit",
        text: "Your bank guarantees payment once shipping documents are presented. Safe for very large orders, but slow and bank-fee heavy.",
      },
    ],
    footer: (
      <>
        <strong>Protect yourself:</strong> release the balance only after the pre-shipment
        inspection passes — the PO&apos;s QC tab gates that payment automatically.
      </>
    ),
  },

  moq: {
    title: "MOQ — minimum order quantity",
    intro:
      "The smallest number of this item the factory will produce in one run. Below it they either refuse or charge a surcharge, because the setup cost stays the same whether they make 5 or 500.",
  },

  lead_time: {
    title: "Lead time",
    intro:
      "Days from confirmed order to the goods being ready to leave the factory — production only, not shipping. Sea freight from Asia to Europe adds roughly 30–45 days on top, which is why the PO tracks ex-factory and arrival dates separately.",
  },

  preferential_origin: {
    title: "Preferential origin — 0% import duty",
    intro:
      "Some countries have EU trade agreements that drop the import duty to zero if the supplier provides a valid origin declaration. Vietnam qualifies under EVFTA, for example; China and Thailand don't (about 2.7% duty on boards and fins).",
    footer: (
      <>Tick this only when the factory actually supplies the paperwork — customs will ask for it.</>
    ),
  },

  landed_cost: {
    title: "Landed cost — what a unit truly costs you",
    intro:
      "Factory price plus freight, duty, insurance, customs handling — everything spent to get one unit onto your shelf. It's the number your margins must be calculated from; using the bare factory price makes wholesale look profitable when it isn't.",
    rows: [
      { term: "Spread by value", text: "Duty and insurance — they scale with what the goods are worth." },
      { term: "Spread by volume", text: "Freight — a board eats far more container space than a fin, so it should carry more of the bill." },
      { term: "Spread by weight", text: "Air freight, or anything a carrier charged you by the kilo." },
    ],
  },

  psi: {
    title: "Inspection types",
    intro: "Quality checkpoints during a production run — the industry's standard ladder.",
    rows: [
      { term: "FAI · First Article", text: "The very first unit off the line, checked before the run continues." },
      { term: "IPC · Initial Production", text: "First 5–20% produced — catches a bad setup early." },
      { term: "DUPRO · During Production", text: "Around 30–50% done — catches drift mid-run." },
      { term: "PSI · Pre-Shipment", text: "The important one: goods finished and packed, sampled before you release the balance payment." },
      { term: "CLS · Container Loading", text: "Someone watches the container actually get loaded correctly." },
    ],
  },
};
