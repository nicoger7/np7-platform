# Research: B2B / Wholesale Backend — State of the Art (2026)

> Deep-research report, 2026-07-27. Feeds `docs/hardware-backend-blueprint.md`.
> Scope: NP7 Hardware selling B2B to surf/windsurf retailers, on the existing stack.

---

## 1. How boardsports brands actually sell to retail

**Two distinct order flows — model them as first-class, different things:**

1. **Pre-book (pre-season / "order book")** — retailer commits months ahead (windsurf: Sep–Nov ordering for Feb–Apr delivery). The brand aggregates pre-books into its factory PO. Pre-books get the best discount, free/cheap freight, extended terms ("dating"). This is the demand signal you produce against.
2. **At-once (in-season reorder)** — ordered against warehouse ATS, ships in days, standard discount and terms.

Macro trend ([RepSpark, Pre-Book vs At-Once](https://www.repspark.com/blog/pre-book-vs.-at-once-how-buying-behavior-is-shifting-and-what-it-means-for-brands)): retailers **commit less pre-season, chase more at-once** — so brands must hold speculative stock of proven sellers, expose accurate real-time ATS, and make reordering near-zero-friction. The portal should be *great* at reorders, not just the seasonal order book.

**Industry numbers:**
- Keystone (50% off MSRP) is the apparel/accessory benchmark; **hardgoods run thinner**: boards/sails typically give the dealer ~30–40% margin. Plan the discount matrix **per product category**.
- Real published dealer program ([Booyah dealer terms](https://booyah.ski/pages/dealer-terms)): standard 50% off; **pre-season 55% + free shipping + net 60**; volume tier 60% at 150+ units; opening minimum, no minimum on fill-ins; 1 free demo per 25; **accounts >45 days past due revert to prepaid**. The whole genre in one page.
- Counter-model ([Ozone Kites](https://ozonekites.com/why-ozone/)): **no minimum order**, dealers order what they'll sell in 30–40 days — viable only with brand-held stock + excellent ATS visibility.
- Windsurf channel note: Boards & More (Duotone/Fanatic) sells via **national distributors** with regional B2B portals. A small brand goes **direct-to-dealer in DACH/EU**, possibly distributors for far markets later — allow a "distributor" account type as a deeper discount tier.
- **Demo/school programs:** dealer demo gear (discounted, "not for resale before {date}", sellable as used at season end) and **school/center programs** ([Point-7 school gear](https://point-7.com/windsurf-school-gear/)) — schools are a separate customer class with their own price list, and NP7's best marketing surface. **Consignment: avoid at launch** (admin + VAT headache).

Model the pre-book as an order with **line-level ship windows**, brand may confirm/adjust quantities when factory POs land.

---

## 2. Dealer management: onboarding, agreements, MAP, territories

**Onboarding (EU):** self-serve application → human approval → provisioning. Collect legal name, addresses, **EU VAT ID**, register number, shop type, brands carried. **Validate VAT ID against [VIES](https://ec.europa.eu/taxation_customs/vies/)** and **store the validation proof** — since the 2020 Quick Fixes a valid customer VAT number is a *material* condition for zero-rating intra-community supplies ([Marosa](https://marosavat.com/vat-news/intra-community-vat-what-it-is-how-apply)). Re-validate before each season. New dealers = proforma/prepaid.

**Dealer agreement:** appointment (non-exclusive), authorized channels (typically **prohibit marketplaces** — defensible in the EU within a genuine selective distribution system, post-*Coty*), brand standards, **Eigentumsvorbehalt** (retention of title — standard in DACH), warranty handling, term. Version it; click-acceptance in the portal.

**MAP — the EU reality (critical):** in the **EU a MAP policy is resale price maintenance (RPM)** — a hardcore restriction under Art. 101 TFEU, NOT covered by VBER 2022/720 ([Cuatrecasas](https://www.cuatrecasas.com/en/global/competition-eu-law/art/resale-price-restrictions-a-new-horizon-under-the-new-vertical-block-exemption-regulation), [Super Bock case](https://www.idiproject.com/news/eu-is-resale-price-maintenance-still-strictly-prohibited-does-the-super-bock-case-of-the-court-of-justice-leave-space-for-a-less-rigid-approach/)).
- **CAN do:** publish non-binding **UVP/RRP**; set maximum prices; RPM-free levers (no co-op marketing for permanent discounters, allocate scarce stock by documented non-price criteria, keep own D2C at RRP).
- **MUST NOT:** threaten supply cuts for pricing below a floor, monitor/"enforce" advertised prices, minimum prices in any agreement. Bundeskartellamt actively pursues this. **Store RRP as display data; never build "MAP compliance" tooling for the EU. Never write anything price-floor-shaped in email.**

**Territories/tiers:** skip formal exclusivity (VBER rules are a minefield; restricting passive sales is hardcore-illegal); track a soft "territory" field for vetting. Tiers: 2–3 (`standard`, `premium/key`, `school`, later `distributor`) driving price list, terms, freight threshold, allocation priority.

```sql
b2b_companies  ( id, legal_name, trade_name, country, vat_id, vat_id_validated_at,
  vat_validation_ref, register_no, website, channels text[], tier_id, territory,
  status,           -- 'applied'|'approved'|'active'|'on_hold'|'terminated'
  agreement_version, agreement_accepted_at/by, credit_*, notes, archived_at )
b2b_locations  ( id, company_id, kind, address…, is_default )   -- billing/shipping/store
b2b_users      ( id, company_id, contact_id → contacts, role, invited_by, last_login )
b2b_tiers      ( id, code, name, rank, default_price_list_id, default_payment_terms,
  allocation_priority )
```

This mirrors [Shopify B2B](https://help.shopify.com/en/manual/b2b/getting-started/terminology) (Company → Company Locations with own catalog/terms; buyers attached) — the consensus pattern, copy it. Reuse NP7 `contacts` for the humans.

**Pitfall:** shipping to an EU dealer whose VAT ID lapsed = *you* owe the VAT; validate at order time for cross-border.

---

## 3. B2B pricing data models

Convergent pattern (Shopify catalogs, [Commerce Layer price lists](https://commercelayer.io/docs/data-model/price-lists-and-currencies), [commercetools price selection](https://docs.commercetools.com/learning-price-and-discount-your-products/price-calculation/price-selection)):

1. **Price lists as named, versioned collections of SKU prices** — per currency, per season. NOT "% off RRP" as the storage mechanism (a % rule may *generate* a list).
2. **Assignment, not duplication:** companies/tiers assigned a list; customer-specific pricing = small override list layered on top.
3. **Deterministic resolution with date validity:** company override → tier list → base wholesale list; never silent fallback to D2C price (fail loudly, hide the SKU).
4. **Quantity rules beside prices:** MOQ, order multiples (case packs), volume breaks per-SKU-per-list.

```sql
hw_price_lists       ( id, code "EU-DEALER-EUR-SS27", currency, kind,
  season_id nullable, valid_from, valid_until, status,
  base_list_id nullable, base_adjustment_pct nullable )   -- generate, don't hand-edit
hw_price_list_items  ( price_list_id, sku_id, unit_price, rrp,
  min_qty default 1, order_multiple default 1,
  PRIMARY KEY (price_list_id, sku_id, min_qty) )          -- volume breaks = extra rows
hw_price_assignments ( id, price_list_id, target_type, target_id, priority )
```

Season = new list (never mutate a list with orders against it); **store the resolved unit price on the order line, always**. Currency = separate list (B2B expects stable printed prices); EUR-only at launch.

---

## 4. B2B ordering UX: the dealer portal

Best-in-class ([BigCommerce B2B](https://www.bigcommerce.com/blog/2023-b2b-edition-features/), [SparkLayer](https://www.sparklayer.io/b2b-ordering-portal/), [NuORDER](https://www.nuorder.com/wholesale/), [Elastic Suite](https://www.elasticsuite.com/platform/) — what Burton/Patagonia use):

**Ordering surfaces (priority order):**
1. **Quick order / SKU grid** — spreadsheet-like matrix: rows = products, columns = variants (board × volume; sail × size), type quantities, running totals. THE wholesale idiom.
2. **Reorder in one click** — duplicate past order / "buy again". Highest-ROI feature for at-once revenue.
3. **CSV upload** — cheap to build, loved by shops that plan in Excel.
4. **Catalog with wholesale context** — dealer price, RRP, margin %, ATS badge, **ATP date for OOS** ("more arriving ~w. 14", [SparkLayer backorder dates](https://www.sparklayer.io/blog/2022/11/01/b2b-backorder-dates/)).

**Account surfaces:** order history + tracking; invoices (PDF, open/paid, pay-now); credit summary; saved carts; addresses; document center (price list PDF, workbook, agreement, brand assets from R2).

**Seasonal order-book (phase 2):** digital workbook/linesheet, pre-book grid with ship-window per line, deadline countdown.

**Rep-entered orders from day one:** admin builds an order *as* a company; identical order object, flagged `entered_by`. Most early pre-books will be entered by NP7 after a call or boat-show meeting.

**EDI: ignore.** Only matters for big-box; specialty surf shops never ask.

**From [Medusa B2B starter](https://github.com/medusajs/b2b-starter-medusa):** the quote/approval loop collapses to: **dealer submits → order lands as `submitted` → becomes binding at your `confirmed`** (possibly edited, with an edit trail). Copy that handshake — instantly-binding submissions are a mistake.

```sql
b2b_orders      ( id, company_id, location_id, order_type,       -- 'preorder'|'at_once'|'demo'|'dropship'
  season_id, status,   -- 'draft'|'submitted'|'confirmed'|'allocated'|'picking'|'shipped'|'invoiced'|'closed'|'cancelled'
  entered_by, currency, price_list_id, payment_terms_days, freight_terms,
  requested_ship_window, po_reference,    -- the dealer's own PO number — must flow to invoice!
  totals…, created_at, confirmed_at )
b2b_order_lines ( id, order_id, sku_id, qty_ordered, qty_confirmed, qty_shipped,
  unit_price, discount_pct, rrp_at_order, ship_window_override, backorder_atp_date )
b2b_order_events ( order_id, event, actor, payload jsonb, at )
```

**Pitfalls:** B2C UX with a price swap (wholesale wants density: grids, totals, keyboard entry); instantly-binding submission; dropping the dealer's PO number.

---

## 5. Payment & credit (EU/DACH)

- **Instrument: bank transfer against invoice.** DACH B2B ≈ SEPA transfer on invoice; cards marginal. Standard "30 Tage netto" ([Oddcoll](https://oddcoll.com/news-and-publications/payment-terms-in-germany/)). §286 BGB: default 30 days after invoice even without Mahnung.
- **Progression per dealer:** new = **Vorkasse/proforma** (NP7 already has this: `src/lib/invoices/promote.ts` proforma → real invoice on payment); 2–3 clean orders → net 14/30; established → net 30 (net 60 as pre-book dating).
- **Skonto** (DACH lever): "2% Skonto binnen 10 Tagen, 30 Tage netto" — discount-if-paid-by field on the invoice.
- **Credit limits:** exposure-based: `exposure = open invoices + confirmed-uninvoiced orders`; check at confirmation, hold with documented override ([Rixxo](https://www.rixxo.com/blog/automating-b2b-ecommerce-credit-safely)). At NP7 scale, Vorkasse-first + small limits IS the credit policy. Trade credit insurance only worth it above ~€20M.
- **Dunning (Mahnwesen):** Zahlungserinnerung (+7d) → 1. Mahnung → 2. Mahnung → Inkasso. B2B entitlements: **9pp over base rate** interest + **€40 flat** per §288 Abs. 5 BGB ([germania-inkasso](https://germania-inkasso.de/lexikon/mahngebuehren-b2b/)). Automate reminders; **auto-flip to prepaid at 45 days past due** (in the terms); block new orders while overdue.
- **Stripe's role:** D2C only. B2B = invoice + SEPA reference-code reconciliation (reuse the travel-business machinery); optional Stripe pay-now link for small invoices.
- **Part payments:** pre-books above threshold take a deposit at confirmation (20–30%), balance at shipment — reuse `computePaymentPlan` concept.

```sql
b2b_companies +  ( payment_terms_days, skonto_pct, skonto_days,
                   credit_limit, credit_status, credit_reviewed_at )   -- 'prepaid'|'terms'|'hold'
b2b_payments     ( invoice_id, method, amount, value_date, bank_ref )
dunning_events   ( invoice_id, level, sent_at, fee, interest_accrued )
```

Invoices: extend the existing engine with division 'hardware'. The "never email backwards" cutoff lesson applies to dunning too.

---

## 6. Fulfillment for B2B (3PL, freight, VAT)

- **B2B ≠ big parcels:** case/pallet vs parcel, **Lieferschein (delivery note) in the shipment**, dealer PO on all documents. Boards = oversized freight: parcel below ~30 kg & no board; else pallet/Spedition. `shipment.mode enum('parcel','pallet','pickup')`.
- **Freight terms as program levers:** free freight on pre-season / above €X at-once; flat fee below.
- **Documents per B2B shipment:** delivery note (no prices, dealer PO + order no.), commercial invoice, packing list — generate with the existing PDF engine, push to 3PL.
- **Dropship-to-dealer's-customer:** wholesale price + dropship fee, neutral delivery note. Great for small shops to "carry" the board range — but **after** core flows are solid. `order_type='dropship'`, ship_to = end customer, bill_to = dealer.

**EU VAT specifics (day one):**
- DE→DE: normal 19%.
- **DE→EU (innergemeinschaftliche Lieferung):** zero-rated ONLY if VAT ID VIES-valid at supply time (store proof), invoice shows both VAT IDs + exemption clause, **proof of transport archived** (3PL PODs retrievable!) ([Eurofiscalis](https://www.eurofiscalis.com/en/vat-rules-eu-intracommunity-transactions/)). File the **Zusammenfassende Meldung** (EC Sales List) — missing entries can retroactively kill the exemption.
- **Intrastat:** dispatch reporting from €1M/year dispatches ([Marosa thresholds](https://marosavat.com/resources/intrastat-thresholds)) — exempt for a while; record CN8 code + net mass + destination country per line NOW so the report is a query later.
- **Exports (CH!):** zero-rated with customs docs; most small brands hand CH to a distributor for exactly this reason.
- **Consignment cross-border:** call-off stock simplification exists (Art. 17a) but strict — another reason to defer.

```sql
shipments       ( id, order_id, mode, carrier, tracking, ship_from_location,
  incoterm default 'DAP', shipped_at, delivered_at, pod_url )
shipment_lines  ( shipment_id, order_line_id, qty )       -- partial shipments are the RULE in wholesale
documents       ( shipment_id/invoice_id, kind, pdf_url ) -- delivery_note/invoice/packing_list/proforma
skus +          ( cn8_code, net_weight_kg, customs_country_of_origin, case_pack_qty, carton_dims )
```

**The single most painful wholesale refactor to retrofit: order → n shipments → n invoices.** Build that shape now.

---

## 7. Order allocation when stock is scarce

Apparel/outdoor consensus ([Uphance allocation policy](https://www.uphance.com/blog/what-goes-into-a-wholesale-allocation-policy-in-apparel/), [Cart.com pools](https://cart.com/blog/omnichannel-fulfillment-apparel-dtc-wholesale-retail)):

1. **One physical inventory, multiple named virtual pools.** Pre-booked wholesale units live in a **protected wholesale pool D2C can never sell** — the single biggest unlock (inventory accuracy 90–95% → ~99%).
   - `DTC_ATS = on_hand − DTC_committed − safety_buffer`
   - `Wholesale_ATS = on_hand + inbound_POs_in_window − wholesale_committed − DTC_protected_pool`
2. **Written allocation policy before the season:** tier-1 fills 100%; tier-2 to target; tier-3 remainder; D2C gets a defined buffer (D2C margin argues for healthy buffer; wholesale shortfalls damage long-built relationships — decide consciously per product family).
3. **Shortage response predefined:** hold tier 1 whole, **pro-rate tier 2**, cut tier 3/late first. Overrides need named approver + reason, logged ("fairness by rules, not by whoever calls loudest" — also the EU-legal documented non-price criteria).
4. **Ship-window-aware:** allocate against the delivery window, not the whole order book.
5. **ATP for the portal:** OOS SKUs show next inbound ETA, backorders against inbound quantity.

```sql
stock_pools     ( id, code, location_id )          -- 'd2c','wholesale','demo','reserve'
stock_levels    ( sku_id, pool_id, on_hand, committed )
allocations     ( id, order_line_id, source,       -- 'pool'|'inbound_po_line'
  source_id, qty, status,                          -- 'soft'|'hard'|'released'
  created_by, reason_code nullable )
allocation_runs ( id, season_id, ran_at, policy jsonb, results )
```

Flow: pre-book confirm → **soft allocation** against inbound PO line; goods receipt → **hard** against wholesale pool → pick/ship releases. At-once hard-allocates at confirmation. D2C only ever reads the `d2c` pool. Pool transfers = explicit, logged admin action — the channel lever.

**Pitfalls:** one shared ATS number for both channels (WILL double-sell the first scarce drop); allocating the full book instead of the current window; no override log.

---

## Build order (opinionated)

1. **Phase 1 — sell at-once:** companies/locations/users + application w/ VIES; tiers + EUR dealer list + school list; portal (catalog w/ dealer price/RRP/ATS, quick-order grid, submit→confirm, history); proforma-first payments reusing invoice engine; shipments w/ partials + Lieferschein; two stock pools.
2. **Phase 2 — the season machine:** seasons + pre-book flow (ship windows, deposits, pre-book terms), digital workbook, soft allocation against inbound POs, shortage/pro-rata tooling, ATP dates.
3. **Phase 3 — scale:** credit-limit automation + dunning ladder, CSV ordering, dropship program, volume breaks, multi-currency, CH via distributor, quotes.

**The two day-one decisions brutal to retrofit: order→n shipments→n invoices, and pool-separated inventory.**
