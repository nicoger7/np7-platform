# NP7 Hardware — Backend Blueprint

> v1 · 2026-07-27 · Synthesized from three deep-research reports in `docs/research/`
> (`hardware-d2c-commerce.md`, `hardware-b2b-wholesale.md`, `hardware-supply-chain.md`).
> This is the execution reference: architecture decisions, module map, build phases.
> Business context: NP7 Hardware sells windsurf gear D2C via np-seven.com, B2B to
> retailers, ships via a 3PL fulfiller, produces at supplier factories.

---

## 0. The shape of the whole thing

Four connected loops, one Postgres schema, all living in the admin's **Hardware world**:

```
  SUPPLY                      STOCK                        SELL
┌─────────────┐   ASN    ┌──────────────┐   reserve   ┌──────────────┐
│ Suppliers    │ ───────▶ │ Inventory    │ ◀────────── │ D2C shop     │
│ POs · QC     │  receipt │ ledger +     │   fulfill   │ (Stripe)     │
│ landed cost  │          │ locations +  │ ──────────▶ │              │
└─────────────┘          │ channel pools│    3PL      ├──────────────┤
                          └──────────────┘   push      │ B2B portal   │
                                 ▲                     │ (dealers)    │
                                 └── returns ───────── └──────────────┘
```

**The five architecture decisions** (every serious system converged on these; they are
cheap now and brutal to retrofit):

1. **Orders carry three orthogonal statuses** — `status` / `payment_status` /
   `fulfillment_status` — never one mega-enum. All transitions go through a single
   `transition()` function that validates an allowlist and writes an `order_events` row
   (audit trail + outbox) in one transaction.
2. **Money and stock are append-only ledgers.** Refunds are negative rows in
   `order_transactions`, never edits to totals. Stock changes are immutable
   `stock_movements` between typed locations (Odoo double-entry style); `stock_levels`
   is a derived cache reconciled nightly. All money in **integer cents**.
3. **Order → n shipments → n invoices.** Partial everything is the rule (wholesale
   waves, split parcels, backorders). Fulfillments have their own lines; invoices are
   issuable per shipment. (The single most painful wholesale refactor if skipped.)
4. **Channel-pooled inventory.** One physical stock, virtual pools: `d2c` /
   `wholesale` / `demo` / `reserve`. D2C can never sell the wholesale pool. Pool
   transfers are explicit, logged admin actions — the channel lever.
5. **Everything customer-facing is snapshotted onto the order** (addresses, titles,
   prices, VAT rates, resolved B2B price-list prices). Line items never FK live
   product rows for display data.

**Reference models:** Medusa v2 (order/inventory/promotion data model — the open-source
reference to copy), Shopify (FulfillmentOrder = the 3PL handoff object), Commerce Layer
(status vocabulary incl. `free` and `not_required`), Cin7 (landed-cost distribution),
Odoo (double-entry inventory).

---

## 1. Module map — how it lands in the admin

The Hardware world's nav grows into (all following the existing admin design system):

| Nav item | What it is | Phase |
|---|---|---|
| **Dashboard** | per-world dashboard (shipped 2026-07-27) — grows KPIs per phase | ✅ |
| **Products** | exists — grows variants, EAN/HS/dims, serials, GPSR block | 1 |
| **Orders** | D2C orders: three-status list, master-detail, timeline, refunds, risk queue | 2 |
| **Inventory** | levels by location/pool, movements ledger, adjustments, ATP | 1–2 |
| **Purchasing** | suppliers, supplier SKUs, POs with milestones/payments/QC, inbound shipments + landed cost | 1 |
| **Dealers** | B2B companies, tiers, applications/vetting, agreements | 3 |
| **Price lists** | B2B price lists, assignments, seasons | 3 |
| **B2B orders** | pre-book + at-once orders, allocations, shipments | 3 |
| **Returns** | RMA queue (withdrawal/warranty), inspection, refund/restock | 2 |
| **Settings** | fulfillment providers, tax rates, shipping fees, company settings (hardware) | 2 |

Public site: `/hardware` product pages (exist) + cart/checkout + `/orders/[token]`
tracking page + returns portal (incl. the legally required withdrawal button) + dealer
portal (separate login area, reusing member auth patterns).

---

## 2. Reuse map — what we already have

This is why building custom is realistic: half the machine exists.

| Existing machinery | Reuse for hardware |
|---|---|
| EU PDF invoice engine + per-division company settings | D2C invoices, B2B invoices, delivery notes, proformas. **Fill the hardware division settings.** Storno/credit-note generator must be built (returns need it) |
| Proforma→invoice promote flow (`src/lib/invoices/promote.ts`) | New-dealer Vorkasse flow, D2C bank-transfer orders |
| Payments reconciliation (bank ref matching) | B2B SEPA invoice payments, unmatched queue |
| Contacts CRM (14k) | D2C customers (tag `hardware`), dealer buyers, board-registration owners |
| Member portal + auth | customer accounts (orders tab), dealer portal shell, board registration → member quiver |
| Resend + email pipeline (+ `EMAIL_PIPELINE_LIVE_FROM` cutoff lesson) | transactional order emails, dunning, back-in-stock |
| Value-voucher system (Experience) | generalize into gift cards (split tender); SPV/MPV VAT decision needed |
| RBAC worlds + sections (`src/lib/access.ts`) | new sections registered under `world: "hardware"` |
| Archive/soft-delete + Archive page | all new entities get `archived_at` |
| Admin design system (tablecard lists, master-detail, header-stack, ColumnToggle, drawer shell, per-world theming, ⌘K palette) | every new module |
| R2 media | product media, QC reports, GPSR tech docs, dealer assets |
| Analytics (first-party, division-aware) | hardware funnel: product view → find-your-fit → cart → checkout |

---

## 3. Domain summaries

(Full detail + schema sketches in the three research docs — these are the decisions.)

### 3.1 Catalog (Phase 1)
- Strict **product → variant** split; every physical/commercial attribute on the
  variant: numeric attributes jsonb, **boxed** weight/dims, **HS code, origin,
  preferential-origin flag**, EAN.
- **GS1 Germany registration** (~€250 + €160/yr) — retailers require licensed GTINs.
- **Serials for boards and masts** (laminated + QR): warranty, theft, and a
  registration page that joins the board to the member's profile/quiver — a
  first-party-data play only NP7 can do. Fins/accessories not serialized.
- GPSR compliance block as catalog data (`products.compliance` jsonb), rendered on
  every product page.
- Migration path: evolve `hw_products` (add variants table alongside; keep the
  existing content/Find-Your-Fit system untouched).

### 3.2 D2C shop (Phase 2)
- **Checkout:** custom UI on Stripe PaymentIntents + Payment Element; methods for DE:
  cards, **PayPal (non-negotiable)**, Apple/Google Pay, **Klarna** (covers Rechnung),
  bank transfer via existing Vorkasse flow. SEPA DD excluded for boards. Automatic
  capture; cancellation-before-ship = instant refund.
- **Cart/checkout is not an order.** Order is minted server-side by the webhook,
  idempotently (stored event ids, atomic conditional transition), success page polls.
- **VAT:** destination-rate from day one + OSS registration (BZSt). Hand-maintained
  27-country standard-rate table (all our goods are standard-rate); per-line snapshot;
  `tax_treatment` flag for exports (CH!).
- **Returns:** the **withdrawal button (mandatory since 19 Jun 2026)** is the entry to
  a self-service returns portal; refund includes outbound shipping; bulky boards get
  "we'll arrange pickup"; inspection before refund (diminished-value deduction);
  every refund produces a credit note.
- **Fraud:** Stripe Radar + `risk_status` on the order that **holds the 3PL push**
  until cleared; dispute webhook → admin queue.
- **Post-purchase:** tokenized tracking page as owned media; review request 14–21 days
  after delivery (the customer needs wind); orders tab in the member portal.

### 3.3 Inventory (Phase 1 foundation, Phase 2 live)
- Locations: `supplier` (virtual), `in_transit` (FOB = our stock on the water),
  `3pl`, `own_storage`, `demo`, `customer` (virtual), `inventory_loss` (virtual).
- Immutable `stock_movements` (+ `serial_id` from day one) → derived `stock_levels`;
  nightly reconciliation vs the ledger AND vs the 3PL count (discrepancies are explicit
  adjustment movements — 3PL shrinkage visible and billable).
- Atomic reserve-at-order-placement (`WHERE stocked - reserved >= q`); no TTL cart
  reservations until we run drops.
- ATP = on-hand − reserved + confirmed inbound → lets the shop **sell against
  inbound** ("ships from 12 May") instead of showing sold-out for 8 weeks.
- Honest thresholded stock display ("Only 2 left" only when true — EU dark-pattern
  rules + brand trust).

### 3.4 Purchasing & production (Phase 1 — needed before the first container)
- Suppliers + `supplier_skus` (cost, MOQ, lead time, incoterm, preferential origin).
- PO ladder: draft → issued → confirmed → in_production → ready_to_ship → shipped →
  received → closed, with **status events + milestones** (planned vs actual — "what
  lands before May, which factory is drifting?").
- **Factory payments as first-class rows** (30/70 T/T deposits/balances with planned
  dates — the biggest cash-flow events) and **QC inspections** (PSI gates the 70%
  balance payment; encode `blocks_balance_payment`, don't rely on discipline).
- **Inbound shipments ≠ POs** (many-to-many via lines); landed-cost worksheet per
  container: duty by value (2.7% for CN 9506 21 00/29 00 — verify in TARIC, get BTI),
  **freight by volume** (boards!), estimates at receipt, monthly true-up.
- Import VAT (19% EUSt) is deductible input tax — never in landed cost.

### 3.5 3PL integration (Phase 2)
- Shortlist: **Hive** (best API+ops for our size, webhooks) vs **byrd** (EU network,
  release/recall semantics); decision hinges on **bulky-board handling, 2-man/Sperrgut
  carriers, pallet B2B shipments, storage pricing for 140L boards** — not API polish.
  Two outbound paths are acceptable (parcels via 3PL, board pallets via forwarder).
- Canonical contract: product sync → **ASN for inbound** (never ship unannounced) →
  idempotent order push with hold/release → tracking feedback → inventory
  reconciliation (report, never silent overwrite) → returns with condition grading.
- **Transactional outbox** (`integration_outbox`) + raw `fulfillment_events` log.
  Contract-test both sandboxes before signing.

### 3.6 B2B wholesale (Phase 3)
- **Two order types:** seasonal **pre-book** (ship windows, better discount, dating,
  deposits) and **at-once** reorders against live ATS. Portal optimizes for
  *reorders*: quick-order SKU grid, one-click reorder, dealer price + RRP + margin +
  ATS/ATP-date per SKU.
- **Submit → confirm handshake** (submissions not instantly binding); rep-entered
  orders from day one; dealer's own PO number flows order → delivery note → invoice.
- **Companies → locations → buyers** (Shopify B2B pattern), tiers (standard / key /
  school / later distributor), application funnel with **VIES VAT-ID validation +
  stored proof** (re-validate at cross-border order time).
- **Price lists as data** (per currency/season, absolute prices, MOQ/multiples/breaks
  per item, company overrides; resolved price locked onto the line). Discount depth
  **per category** (boards ≠ accessories).
- **EU-legal guardrails:** RRP is display-only — **no MAP tooling, ever** (RPM is
  hardcore-illegal in the EU); allocation by documented non-price criteria.
- Payments: invoice + SEPA (reuse reconciliation), proforma-first for new dealers,
  net 14/30, Skonto field, exposure check at confirmation, auto-flip to prepaid at
  45 days overdue, dunning ladder per §288 BGB.
- Cross-border: reverse-charge invoices + Zusammenfassende Meldung export for the
  Steuerberater; PODs archived (they carry the VAT exemption).
- **Allocation:** pre-books soft-allocate against inbound PO lines, harden at receipt
  into the wholesale pool; shortage policy: tier-1 whole, pro-rate tier-2, cut late.

### 3.7 Compliance gate (Phase 1–2, mostly one-time)
Before the first parcel: **LUCID + dual-system license** (DE; FR/AT if shipping
there — via ecosistant/Lizenzero), **EORI**, **GPSR** risk assessments + tech docs
(10 years, in R2) + listing block, **withdrawal button**, OSS registration,
GS1 prefix, ISPM-15 pallets, BTI rulings for boards/foils.
**No CE on boards/sails/fins/foils** (explicitly out of scope of the RCD — wrongly
affixing CE is itself an infringement). Vests/helmets would need CE (PPE) — buy
certified white-label if ever. Batteries/e-foils = project-sized workstream, avoid.

---

## 4. Admin UI/UX rules (apply to every new module)

The learnings already baked into the Experience world — carried over wholesale:

1. **List views = `.admin-tablecard` pattern** with ColumnToggle (labeled pills),
   search, filter pills, and per-world theming (Hardware = lime accent, black-on-lime
   contrast).
2. **CRUD everywhere** — every entity gets create/edit/duplicate/archive in place;
   nothing is hardcoded-only (the content-editability rule applies to hardware too:
   product pages, email texts, compliance blocks all admin-editable with defaults).
3. **Master-detail** for dense entities (orders, POs, dealers) — the
   Payments/Edition-detail split pattern: list left, detail right, quick-switcher,
   tab state in `?tab=` so back/forward never lands in the wrong place.
4. **Navigation never dumps you in the wrong menu** — detail pages back-link to their
   list *with the world context kept*; new sections registered in `access.ts`
   (`world: "hardware"`) so RBAC, middleware, nav and ⌘K palette all stay consistent.
5. **Archive, not delete** — all new tables get `archived_at` + Archive-page
   registration.
6. **Status = colored badges with a small vocabulary** per dimension (the booking
   funnel discipline: lean enums + helper functions in `types.ts`).
7. **Dashboards show the world's own numbers only** (shipped) — hardware KPIs grow
   per phase: Phase 1 adds inbound pipeline + inventory value; Phase 2 adds open
   orders/revenue/returns; Phase 3 adds channel split at landed COGS + pre-book book.
8. **Money-eye masking** everywhere € figures render; `money` field grant redaction
   for restricted roles (cost/margin especially — landed cost is sensitive).
9. **Mobile-first admin** — the drawer shell + header-stack pattern; order/PO detail
   must work on a phone at a boat show.
10. **UX psychology principles** (ethically): smart defaults on forms, endowed
    progress on the dealer application, anchoring on RRP vs dealer price display.

---

## 5. Build phases

Order matters: catalog+supply first (a container is physical-lead-time bound),
D2C second, B2B third (needs stock + pools to exist).

**Phase 1 — Foundation & supply (build now):**
catalog v2 (variants/EAN/HS/dims/serials) · suppliers + supplier SKUs · POs
(ladder + milestones + payments + QC/PSI) · inbound shipments + landed-cost
worksheet · locations + movement ledger + levels · compliance one-timers (LUCID,
EORI, GS1, GPSR docs, BTI) · dashboard: inbound pipeline + inventory value.
*Independent of any 3PL/shop decision — pure internal tooling + registrations.*

**Phase 2 — D2C selling machine:**
checkout (Stripe: cards/PayPal/wallets/Klarna + Vorkasse) · orders module
(three-status, ledger, events, timeline UI, refunds) · tax table + OSS · invoice
engine extension (hardware settings, **Storno generator**) · 3PL selection
(sandbox both) + integration (outbox/ASN/tracking/reconciliation) · returns portal
+ withdrawal button · transactional emails + tracking page · fraud queue ·
GPSR listing block · member-portal orders tab.

**Phase 3 — B2B wholesale:**
dealer companies/tiers/application+VIES · price lists + resolution · dealer portal
(quick-order grid, reorder, history, invoices) · submit→confirm + rep orders ·
pool-separated allocation + pre-book season v1 · reverse-charge invoicing + ZM
export · dunning + credit basics · delivery notes/pallet path.

**Phase 4 — Scale levers:**
digital workbook/linesheet · allocation runs + ATP dates in portal · replenishment
suggestions + seasonal forecasting (S&OP-lite ritual + `demand_forecasts`) ·
exchanges automation · store credit · dropship program · B-stock channel ·
supplier scorecards · NFC serials · multi-currency price lists · CH distributor.

---

## 6. Decisions Nico needs to make (not code)

1. **3PL shortlist & site visits** — Hive vs byrd (vs forwarder-hybrid); the bulky-
   board questions decide it. Sandbox-test both APIs as part of evaluation.
2. **Discount architecture** — per-category dealer margins (boards ~30–40%,
   accessories ~keystone), pre-book bump, school-program pricing, demo policy.
3. **D2C vs wholesale pool ratio** per product family for season 1.
4. **Tax advisor session:** OSS registration timing, gift-voucher SPV/MPV scope
   (cross-division voucher = MPV), Storno numbering, ZM cadence.
5. **GS1 + LUCID + EORI registrations** (fast, cheap, but only Nico can sign).
6. **Serial/warranty promise** — warranty length per category, registration
   incentive (extra year for registering?), which becomes marketing copy.
7. **Launch scope of shipping destinations** (DE only? DACH? EU-wide? CH?) — drives
   EPR registrations, VAT table, 3PL carrier mix.

---

## 7. What NOT to build (explicitly rejected)

- Shopify/Medusa adoption — the reuse map (§2) plus full control beats integration
  overhead at our scale; we copy their data models instead.
- MAP monitoring/enforcement — illegal in the EU.
- Own "Kauf auf Rechnung" B2C credit — Klarna's job.
- EDI — big-box only; specialty surf shops never ask.
- Consignment & cross-border call-off stock — admin/VAT trap, defer.
- TTL cart reservations / drop mechanics — not our sales pattern (yet).
- CE marking on boards — wrongly affixing is an infringement.
- Full event-sourcing ceremony — append-only ledgers + derived caches suffice.
