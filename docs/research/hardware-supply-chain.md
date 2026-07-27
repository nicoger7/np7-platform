# Research: Supply Chain & Ops Backend — State of the Art (2026)

> Deep-research report, 2026-07-27. Feeds `docs/hardware-backend-blueprint.md`.
> Scope: suppliers → production → inbound → 3PL → multi-channel outbound, German GmbH.

**One architectural conviction up front:** every credible system (Odoo, Katana, Cin7, ShipHero) converges on the same three-legged core: (1) an immutable **stock-movement ledger** between typed locations, (2) a **PO/inbound-shipment pipeline** that carries landed cost onto inventory, (3) a **canonical order → fulfillment → shipment loop** with the 3PL. If those three are right, everything else (KPIs, ATP, COGS per channel) is a query.

---

## 1. Supplier & purchase-order management

Lightweight MRP tools model the same shape: **Katana** — SKU-level supplier data (cost, **MOQ**, **lead time days**) drives replenishment back-scheduling; PO statuses Draft → Not Received → Partially Received → Received ([PO statuses](https://support.katanamrp.com/en/articles/5945017-purchase-order-po-delivery-statuses)). **Cin7 Core** — PO → supplier invoice → stock receipt as *separate documents* + additional-cost lines for landed cost ([Purchase Module](https://help.core.cin7.com/hc/en-us/articles/9034461557519-Introduction-to-the-Purchase-Module)). **Odoo** — PO confirmation spawns a planned inbound stock move (procurement and inventory are one ledger).

**None handle factory payment schedules or production milestones well — exactly where a custom build wins**, and for Asia-produced boards the operationally hottest part.

**Factory payments:** standard Asia terms **30/70 T/T** — 30% deposit before production, 70% balance before shipment, released **only after a passed pre-shipment inspection** ([Harris Sliwoski](https://harris-sliwoski.com/chinalawblog/china-manufacturing-payment-terms/), [QualityInspection.org](https://qualityinspection.org/payment-terms-chinese-manufacturer/)). Terms migrate in your favor over time. Note: the dominant windsurf board factory in the world is **Cobra International (Thailand)** — this is exactly the regime NP7 will be in.

**QC checkpoints** (QIMA/Pro QC style): **FAI** (first article), **IPC** (first 5–20%), **DUPRO** (30–50%), **PSI** (pre-shipment, AQL sampling), **CLS** (container loading) ([QIMA PSI](https://blog.qima.com/quality-control/pre-shipment-inspection-procedure)). First-class records tied to the PO — *the 70% payment gates on the PSI result*.

```sql
suppliers        ( id, name, country, currency, default_incoterm, default_payment_terms,
                   contacts, notes, archived_at )
supplier_skus    ( id, supplier_id, variant_id, supplier_item_code, unit_cost, currency,
                   moq, order_multiple, lead_time_days, incoterm, valid_from, valid_to )
                   -- THE table replenishment math reads. Price breaks: jsonb or child table.
purchase_orders  ( id, po_number, supplier_id, status, currency, incoterm,
                   order_date, ex_factory_date_planned/actual, expected_receipt_date,
                   payment_terms, notes )
   -- status: draft → issued → confirmed → in_production → ready_to_ship
   --         → shipped → partially_received → received → closed (+ cancelled)
po_lines         ( id, po_id, variant_id, supplier_sku_id, qty_ordered, unit_cost,
                   currency, qty_shipped, qty_received, qty_rejected )
po_status_events ( id, po_id, from_status, to_status, at, actor, note )
                   -- lead-time analytics: actual = confirmed→received, factory = confirmed→shipped
po_payments      ( id, po_id, kind,          -- 'deposit'|'balance'|'other'
                   planned_amount, planned_date, paid_amount, paid_date,
                   fx_rate_at_payment, reference )
                   -- deposits are PREPAYMENTS (asset), net against supplier invoice; FX per payment
po_milestones    ( id, po_id, kind,          -- materials_ordered|production_start|sample_approved|
                   planned_date, actual_date, note )   -- production_complete|inspection_passed|booked_freight
qc_inspections   ( id, po_id, type,          -- 'FAI'|'IPC'|'DUPRO'|'PSI'|'CLS'
                   inspector, agency, date, aql_level, sample_size, defects jsonb,
                   result, report_url, blocks_balance_payment bool )
```

**Why status events + milestones, not just a status column:** the real question in March is "which of my 4 POs land before May, and which factory is drifting?" — needs planned-vs-actual per milestone + historical lead-time distributions per supplier. The single biggest edge over Katana-class tools.

**Pitfalls:** "received" mutating PO lines directly (receipts belong to the inbound ledger); one hardcoded FX rate on the PO; **a PO ≠ a shipment** (one PO in two containers, three POs in one container — separate `inbound_shipments` from day one); releasing the 70% before PSI is in the system (encode the gate).

---

## 2. Landed cost

Landed cost = factory price + freight + insurance + duty + brokerage + inbound handling → inventory value → COGS on sale ([A2X guide](https://www.a2xaccounting.com/ecommerce-accounting-hub/landed-costs-ecommerce)). **B2B margin at ~50–60% of RRP only works if COGS is the true landed number.** A €400 ex-factory board easily carries €80–120 freight/duty/handling. Boards are voluminous low-density freight — weight/volume-based allocation beats value-based.

### EU duty (Germany specifics)

- **CN 9506 21 00 "Sailboards"** (explicitly incl. freeride/wave/slalom boards + complete sets): EU third-country duty **2.7%** (corroborated by UK's carried-over 2.0% via the [UK tariff API](https://www.trade-tariff.service.gov.uk/api/v2/commodities/9506210000)). Verify in [TARIC](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp) before first import.
- **CN 9506 29 00** (other water-sport equipment — sails, booms, masts, fins, foils): same ballpark **2.7%**.
- **Origin changes the number:** China → 2.7%. **Thailand (Cobra) → full rate** (lost GSP 2015). **Vietnam → 0% under EVFTA** with REX origin declaration. EU production → none. → `preferential_origin` flag per supplier_sku.
- **Adjacent categories caution:** neoprene/apparel ~12% (Ch. 61/62), bags ~9.7% (Ch. 42). For ambiguous items get a free **BTI (Binding Tariff Information)** ruling — binding 3 years.
- **Import VAT:** 19% Einfuhrumsatzsteuer on (customs value + duty + freight-to-border) — fully deductible input tax, cash-flow item, **NOT landed cost**.

### Allocation mechanics

Copy Cin7: additional-cost lines distributed **by value, quantity, weight, or volume** ([Cin7 landed cost](https://help.core.cin7.com/hc/en-us/articles/9034516716047-Landed-cost-expense-distribution)). Consensus ([Fuse](https://www.fuseinventory.com/blog/6-ways-to-allocate-duties-for-accurate-landed-unit-costs)): **duty by value** (per line's own rate), **freight by volume/weight** (a 140L board and a fin bolt must not share freight by value), insurance by value.

Cost invoices arrive weeks late → *cost layers*: estimates at receipt, true-up on actual invoice. Pragmatic v1: **estimates at receipt from a per-lane freight template, reconcile monthly.**

```sql
inbound_shipments       ( id, reference, mode, incoterm, container_no, carrier, forwarder,
                          etd, eta, ata, customs_cleared_at, status )
                          -- 'booked'|'in_transit'|'at_port'|'cleared'|'received'|'closed'
inbound_shipment_lines  ( id, shipment_id, po_line_id, qty )
shipment_costs          ( id, shipment_id, kind,   -- freight|duty|insurance|brokerage|handling|demurrage
                          amount, currency, fx_rate, is_estimate bool, invoice_ref,
                          allocation_basis )        -- 'value'|'weight'|'volume'|'qty'
landed_cost_allocations ( id, shipment_cost_id, po_line_id, amount_allocated )
item_cost_layers        ( id, variant_id, source_receipt_id, qty_received, qty_remaining,
                          unit_landed_cost, received_at )   -- FIFO layers under weighted-average presentation
```

**Pitfalls:** booking inventory at ex-factory cost with freight/duty in overhead (makes one channel silently subsidize the other); allocating container freight by value; forgetting **FOB = you own goods from on-board date** → in-transit stock on the balance sheet, needs an in-transit location ([ShipBob goods in transit](https://www.shipbob.com/blog/goods-in-transit/)).

---

## 3. Inventory architecture

**SOTA: immutable movements, derived quantities.** Odoo's double-entry inventory: every operation is a move between two locations, some virtual (Supplier, Customer, Inventory-Loss); sum over all = 0 ([Odoo concept](https://odoo-users.readthedocs.io/en/latest/inventory/overview/concepts/double-entry.html)). CRUD-mutated quantity columns corrupt over time ([event-sourced inventory](https://www.inventorypath.com/event-sourced-inventory-why-crud-based-stock-ledgers-eventually-corrupt-and-how-to-build-an-append-only-alternative)).

For Supabase Postgres: **append-only `stock_movements` as source of truth + `stock_levels` cache maintained transactionally, reconciled nightly with drift alerts.** No full event-sourcing ceremony.

### Locations

```
kinds: supplier (virtual) | in_transit | 3pl | own_storage | demo
       | reserved_b2b | customer (virtual) | inventory_loss (virtual)
```

**`demo` deserves emphasis:** a windsurf brand bleeds gear into team riders, test events, press, and NP7's own Experience trips. Demo-as-location makes it tracked movements, not leakage; ex-demo sale = demo → 3pl move + condition flag.

```sql
stock_movements ( id, variant_id, from_location_id, to_location_id, qty>0,   -- Odoo-style pair
  reason,        -- po_receipt|transfer|sale|return|adjustment|demo_out|demo_return|
                 -- warranty_replacement|write_off|b2b_shipment
  ref_type/ref_id, serial_id nullable, unit_cost_at_move, occurred_at, recorded_at, actor )
  -- IMMUTABLE. Corrections are reversing movements, never UPDATEs.
stock_levels    ( variant_id, location_id, on_hand, reserved, updated_at )   -- derived cache
reservations    ( id, variant_id, location_id, qty, ref, expires_at )
```

### ATP, safety stock, seasonality

- **ATP** = on-hand (sellable) − reserved + confirmed inbound within horizon ([Shopify ATP](https://www.shopify.com/in/blog/available-to-promise)). With POs carrying expected receipt dates you can **sell against inbound**: "Foil 900 — ships from 12 May" instead of 8 weeks of sold-out.
- With 90–120-day board lead times and one-big-buy-per-season economics, classic reorder points matter less than **seasonal buy planning**: Europe peaks May–Sept **plus a winter shoulder from destination travel (Cape Town, Canaries — literally NP7's own customer base)**. Model demand *monthly per variant* with seasonal profiles.
- Safety stock: per-variant policy number set manually per hero SKU; don't over-engineer.

**Pitfalls:** one `quantity` column on the product table (the original sin); silently overwriting your numbers with the 3PL's (their count is *one observer* of the `3pl` location — discrepancies become explicit `adjustment` movements, so 3PL shrinkage is visible and billable); forgetting in-transit (~2 months of inventory value on the water with FOB); retrofitting serials onto an anonymous ledger (painful — `serial_id` on movements from day one).

---

## 4. 3PL integration

### Landscape for a German brand (2026)

- **byrd** (Vienna/Berlin, EU partner-warehouse network): [developers.getbyrd.com](https://developers.getbyrd.com/) — REST v3.1 with the four canonical resources (Products+stock, Inbound Deliveries, Outbound Shipments create/release/recall, Returns). Webhooks thin — plan polling.
- **Hive** (Berlin, own warehouses, tech-first): [developers.hive.app](https://developers.hive.app/) — clean REST **with webhooks**, agent/LLM-friendly docs. Probably the strongest API+ops combo for NP7's size.
- **Alaiko/Zenfulfillment** (merged 2024, DACH-focused), **Huboo** (API sparse), **Warehousing1** (broker over partner warehouses — flexible on **bulky freight**, API portal-grade).
- Design benchmark: **ShipHero GraphQL** — 18 webhook event types incl. Inventory Change ([developer.shiphero.com](https://developer.shiphero.com/)).

**The non-API question that decides the pick:** boards are oversized freight (250×70×40 cm cartons, Sperrgut carriers/forwarders); fins are parcels. **Interrogate candidates on 2-man handling, per-unit storage pricing for 140L boards, and B2B pallet shipments** before comparing API polish. Two outbound paths is reasonable: parcels via 3PL, board/pallet freight via forwarder from own storage — architecture supports it as another "fulfillment provider".

### The clean data contract

1. **Product sync** (you → 3PL): SKU, EAN, name, weight/dims, customs data, serial flags.
2. **ASN / inbound announcement** (you → 3PL): "container X, ~date D, N units of SKU Y against PO-123". Their receipt confirmation writes your `in_transit → 3pl` movements and closes PO lines. **Never ship to a 3PL unannounced.**
3. **Fulfillment order push** (you → 3PL): **idempotent create (client-generated key)**, hold/release semantics (byrd's release/recall model — push early, release when paid/risk-cleared).
4. **Shipment/tracking feedback** → customer email + `3pl → customer` movement.
5. **Inventory sync**: event deltas if available, else scheduled snapshot + diff → **discrepancy report, not silent overwrite**.
6. **Returns**: RMA both ways, 3PL grades condition (A restock / B ex-demo / C scrap).

```sql
fulfillment_providers ( id, name, kind, api_config )      -- '3pl'|'own_warehouse'|'dropship_forwarder'
fulfillment_orders    ( id, provider_id, channel_order_id, external_id, status,
  idempotency_key, address snapshot, lines )
  -- 'pending'|'pushed'|'accepted'|'held'|'picking'|'shipped'|'partially_shipped'|'cancelled'|'error'
fulfillment_events    ( id, fulfillment_order_id, type, payload jsonb, occurred_at, received_at )
                        -- raw webhook/poll log; replayable, debuggable
shipments             ( id, fulfillment_order_id, carrier, service, tracking_no, tracking_url,
                        shipped_at, delivered_at, packages jsonb )
asns                  ( id, provider_id, inbound_shipment_id, external_id, status,
                        announced_at, expected_at, closed_at )
asn_lines             ( id, asn_id, po_line_id, qty_announced, qty_received, qty_damaged )
integration_outbox    ( id, provider_id, operation, payload, status, attempts, next_retry_at )
  -- transactional outbox: write intent in the same tx as the domain change; a worker delivers
  -- with retries. Saves you from every "order in DB but never reached the 3PL" incident.
```

**Pitfalls:** trusting webhooks alone (always reconciliation-poll); pushing orders before payment/fraud checks without a hold state; letting the 3PL master product data; no raw event log; not contract-testing the sandbox before signing (use byrd's sandbox gate as an evaluation phase).

---

## 5. Product / catalog architecture

Three levels, strictly: **product** (marketing entity) → **variant** (sellable unit: 115L/125L/135L, sail sizes, fin sizes) → identifiers. Every physical/logistic/commercial attribute on the **variant**:

```sql
products   ( id, name, category, season/model_year, description, media, status )
variants   ( id, product_id, sku,                -- internal, human-readable: 'NP7-BRD-FRX-115'
  ean_gtin, attributes jsonb,                    -- {volume_l, length_cm, sail_m2, stiffness, color…} — NUMERIC, not free text
  weight_g, box_l_mm, box_w_mm, box_h_mm,        -- BOXED dims (carton), for shipping + freight alloc + customs
  hs_code, customs_description, country_of_origin, preferential_origin bool,
  customs_value_default, serialized bool, rrp, lifecycle_status )
serials    ( id, variant_id, serial_no, current_location_id, current_state,
  sold_order_id, sold_at, warranty_until, registered_owner_contact_id )
  -- states: in_stock|sold|demo|warranty_replaced|scrapped
serial_events ( id, serial_id, type, ref, at )   -- produced|received|sold|registered|claimed|replaced|returned
```

**Decisions, with opinions:**
- **GS1 EANs: yes, day one.** Retailers require GTINs licensed to *your* company ([inFlow](https://www.inflowinventory.com/blog/why-an-official-gs1-barcode-matters/)). GS1 Germany: ~€250 one-time for 1,000-GTIN prefix + ~€160/yr at <€5M turnover ([GS1 prices](https://www.gs1-germany.de/en/prices/)). Never grey-market single barcodes (retailers check GEPIR license holder).
- **Serials for boards (and masts — masts break): yes.** High-value, warranty-prone, theft-attractive. SOTA: CAPiTA embeds **NFC** linking to registration ([CAPiTA](https://capitasnowboarding.com/pages/register-snowboard)). NP7: laminated serial + QR, registration page → **registered board joins the member profile/quiver** (first-party data play unique to NP7). NFC later. Fins/accessories: not serialized.
- **HS code per variant, not product** — sets vs components classify differently.

**Pitfalls:** variant attributes as free text; reusing an EAN; serializing sub-€150 items.

---

## 6. Planning & KPIs

Ops dashboard (all computable from the tables above — owning the schema pays off):
- **Inventory value at landed cost** by location bucket (3PL / in-transit / demo / own) — in-transit shown separately (committed cash).
- **Weeks of cover** per variant with **seasonally indexed** denominator (flat averages lie twice a year in this sport); flag <8 weeks before peak, >40 after.
- **Sell-through rate** per variant per season = sold ÷ received (healthy 40–80%; decides next season's buy).
- **Inbound pipeline**: POs by milestone, planned-vs-actual, value — "what lands before May?"
- **Backorders/oversold count**, D2C fill rate, 3PL discrepancy count.
- **Channel split**: D2C vs B2B revenue and **contribution margin at landed COGS**.
- **Cash view**: upcoming po_payments next 90 days beside expected receipts — for a seasonal buyer this IS the business.
- Later: supplier scorecard (on-time %, defect rate from QC records).

**S&OP-lite:** one monthly 60–90-min ritual — (1) demand: actual vs forecast, update rolling 12-month; (2) supply: PO pipeline vs forecast; (3) inventory: cover outliers, B-stock/demo aging; (4) decisions: reorder/promo/kill. Plus **two heavyweight sessions/year**: autumn season buy (commit spring production slots), early-summer mid-season correction (air-freight top-up vs sell-out). Persist `demand_forecasts(variant_id, month, qty_forecast, qty_actual)` — forecast-vs-actual becomes a KPI, not a memory ([Brankit DTC S&OP](https://brankit.com/sop-for-dtc-brands/)).

---

## 7. EU/Germany compliance for selling hardware

- **Packaging EPR — before unit one:** register in **LUCID** (free, before first sale) + dual-system contract (Lizenzero etc.), report volumes. No de-minimis; fines to €200k + Abmahnungen ([verpackungsregister](https://www.verpackungsregister.org/en/i-would-like-to-find-out-if-i-have-to-register-with-the-lucid-packaging-register)). Board cartons are large-format cardboard — few hundred €/yr. **EPR is per destination country** (France: ADEME + Triman labeling; Austria: authorized rep required) — register DE + AT + FR if shipping there, via a service (ecosistant/Lizenzero), not DIY. PPWR bites from 2026+ — design cartons to the strictest rule (France). Data hook: `variants.packaging_weights jsonb`.
- **GPSR — Regulation (EU) 2023/988** (in application since 13 Dec 2024): windsurf gear has no harmonized directive → GPSR general regime ([Compliance Gate](https://www.compliancegate.com/general-product-safety-regulation/)). As manufacturer NP7 must: documented **risk assessment** per product; **tech documentation kept 10 years**; type/batch/serial marking; **manufacturer name + postal + electronic address on product/packaging**; safety info **in the language of each member state sold into**; report accidents via Safety Business Gateway; **online listings must show manufacturer identity + product ID + warnings** → a compliance block on every product page. Data hook: `products.compliance jsonb` (risk_assessment_url, warnings i18n, tech_doc ref) — catalog field, not a binder.
- **CE marking:** **boards, sails, masts, booms, fins, non-powered foils: NO CE** — windsurf boards explicitly excluded from the Recreational Craft Directive ([RCD exclusions](https://www.compliancegate.com/recreational-craft-directive/)); affixing CE where no directive applies is itself an infringement. **Impact vests/helmets: CE required** (PPE Reg 2016/425, notified body) — buy white-label already-certified if ever added. **Batteries/electronics (e-foil):** Battery Regulation 2023/1542 + WEEE — a project-sized workstream; steer clear at launch.
- **Origin:** no general "Made in" obligation in the EU, but branding that evokes German origin while boards are Thai-made violates UCPD — state origin plainly; riders respect Cobra-built.
- **Housekeeping:** **EORI number** (free, before first import), customs broker via forwarder, **ISPM-15** pallets from Asia, early **BTI rulings** for boards/foils. New Product Liability Directive 2024/2853 (by Dec 2026) — another reason QC records + tech docs live in the database.

---

## 8. Build order

**Phase 1 — before the first container** (the real launch gate): catalog with variants + EAN/HS/weights/dims/origin; suppliers + supplier_skus; POs with status ladder + payments + PSI record; locations + movement ledger + levels; inbound shipment with manual landed-cost worksheet; LUCID + dual system + EORI + GPSR risk assessments; board serials.

**Phase 2 — before D2C go-live:** 3PL contract (evaluate **Hive and byrd sandboxes head-to-head**; interrogate bulky-freight), ASN + order push with outbox + tracking + returns, daily reconciliation, ATP on the shop, GPSR listing block, FR/AT EPR if shipping there.

**Phase 3 — before B2B:** retailer accounts + price tiers, pre-book vs at-once, reserved_b2b allocations, pallet/forwarder outbound, combined invoices.

**Phase 4 — scale:** replenishment suggestions, FIFO true-ups, supplier scorecards, seasonal forecasting, multi-3PL, NFC serials.

**Verification note:** the 2.7% duty for CN 9506 21 00 / 9506 29 00 is high-confidence (corroborated via UK tariff API) — confirm in TARIC before the first customs declaration; get a BTI early (free, binding).
