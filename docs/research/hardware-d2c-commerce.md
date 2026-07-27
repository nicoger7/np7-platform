# Research: D2C Commerce Backend — State of the Art (2026)

> Deep-research report, 2026-07-27. Feeds `docs/hardware-backend-blueprint.md`.
> Scope: custom-built commerce backend on Next.js/Supabase Postgres/Stripe/Resend/R2,
> for NP7 Hardware (boards/fins/accessories), D2C in DE/EU, 3PL fulfillment.

**Headline opinions:**

1. Every serious commerce system (Shopify, Medusa v2, Commerce Layer, Vendure) has converged on the same core insight: **an order does not have one status — it has three orthogonal ones** (order / payment / fulfillment), plus append-only money transactions. Copy that.
2. The single most valuable pattern to steal is **Medusa v2's order model**: immutable order snapshot + `order_transaction` ledger + staged `order_change`/`order_change_action` for edits/returns — it cleanly solves partial everything.
3. EU compliance is not an afterthought layer; three items are **launch blockers** for a German shop in 2026: the **withdrawal button** (mandatory since 19 June 2026), **VAT-inclusive price display + destination VAT/OSS**, and **GPSR product-safety info on product pages**. NP7 already has invoicing infrastructure — extend it, don't rebuild.

---

## 1. Order Management: the canonical lifecycle

Best-in-class systems model the order as a small state machine for the *order itself*, with payment and fulfillment as **separate, parallel state dimensions**:

| System | Order status | Payment status | Fulfillment status |
|---|---|---|---|
| **Medusa v2** | pending → completed / canceled (+ draft, archived) | not_paid, awaiting, authorized, partially_authorized, captured, partially_captured, partially_refunded, refunded, canceled | not_fulfilled, partially_fulfilled, fulfilled, partially_shipped, shipped, partially_delivered, delivered, canceled |
| **Commerce Layer** | draft → pending → placed → approved → cancelled | unpaid → authorized → paid → voided / partially_refunded / refunded / free | unfulfilled → in_progress → fulfilled / not_required |
| **Shopify** | open → closed / cancelled | authorized, paid, partially_paid, partially_refunded, refunded, voided | unfulfilled, partially_fulfilled, fulfilled (per FulfillmentOrder) |
| **Vendure** | one merged FSM (AddingItems → … → Delivered) | (merged) | (merged) |

Vendure's merged single FSM is the cautionary tale: merging dimensions forces combinatorial state explosion. Keep them separate. ([Vendure order docs](https://docs.vendure.io/current/core/core-concepts/orders), [Commerce Layer order management](https://docs.commercelayer.io/data-model/orders/orders-management), [Medusa order concepts](https://docs.medusajs.com/resources/commerce-modules/order/concepts))

Two more convergent principles ([OMS integration patterns](https://www.fastslowmotion.com/commerce-cloud-oms-fulfillment-integration/), [scalable OMS lessons](https://medium.com/@umesh382.kushwaha/designing-a-scalable-reliable-order-management-system-65a5646931c5)):

- **One system of record per domain** (order, inventory, shipment, return) and a canonical lifecycle with allowed transitions enforced in code — not ad-hoc status column updates.
- **Event-driven with idempotency**: every state transition emits an event (row in an `order_event` table via the outbox pattern); emails, 3PL pushes, and analytics consume events, never poll mutable state. Audit trail for free.

### Recommended state machine for NP7

```
cart (not an order yet — separate table)
  └─ checkout → order created status='pending'
order.status:        pending → completed | canceled     (completed = delivered + return window closed, set by cron)
payment_status:      awaiting → authorized → paid → partially_refunded → refunded | canceled(voided) | failed
fulfillment_status:  unfulfilled → [partially_]fulfilled → [partially_]shipped → [partially_]delivered → (partially_)returned
```

Enforce transitions with a single `transitionOrder(orderId, dimension, to, actor, reason)` function that validates against an allowlist map, writes the `order_event` row, and updates the column — in one Postgres transaction.

### Edge cases

- **Partial shipments:** never model "shipment" fields on the order. Shopify's answer: `FulfillmentOrder` (what should ship together, from where) → `Fulfillment` (what actually shipped, with tracking) → `FulfillmentLineItem`. Multiple fulfillments per order are normal; fulfillment status is derived by aggregating line-item fulfilled quantities ([Shopify Fulfillment](https://shopify.dev/docs/api/admin-graphql/latest/objects/Fulfillment), [FulfillmentOrder](https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder)). With a 3PL you need this anyway.
- **Partial refunds:** refunds are **rows in a transactions ledger**, never mutations of the order total. Medusa: `order_transaction` rows (captures positive, refunds negative); sum reconciles against the order total; `payment_status` is derived. Tie each refund to (a) a Stripe refund id and (b) optionally specific line items + quantities + a reason enum (`return`, `goodwill`, `shipping_refund`, `price_adjustment`). Line-item attribution keeps VAT reporting correct.
- **Failed/abandoned payments:** the cart/checkout is not an order. Create the order only on payment success (or on explicit "pay by bank transfer" placement). Keep a `checkout` table (cart snapshot + Stripe PaymentIntent id + email) so abandoned checkouts are recoverable and a failed PaymentIntent can be retried without duplicate orders. Abandoned-checkout email after 1–24h; recovery converts best within 72 hours ([dunning playbook](https://www.digitalapplied.com/blog/failed-payment-recovery-dunning-playbook-2026)).
- **Address change after order:** free self-service edit while `fulfillment_status = unfulfilled` **and** not yet pushed to the 3PL; after push, a support action that round-trips the 3PL. Store addresses as **denormalized snapshots on the order** with an `order_event` recording the change. Billing address changes after invoicing require a corrected invoice.
- **Cancellations at each stage:** before capture → void authorization (free). After capture, before fulfillment → full refund via ledger, restock reservation, Storno/credit note (NP7's storno generator not yet built — becomes necessary here). After shipment → no cancellation; it becomes a return/withdrawal. Per-item cancellation → order edit (quantity reduction) + partial refund, not a special status.

### Table sketch (orders core)

```sql
orders (
  id, display_number bigint unique,          -- human "NP7-10432", gapless not required (invoices need gapless, orders don't)
  customer_id nullable, email,               -- guest checkout allowed
  currency char(3), locale,
  status, payment_status, fulfillment_status,
  -- money snapshots, all integer cents:
  subtotal_net, discount_total, shipping_net, tax_total, grand_total,
  tax_country char(2), tax_breakdown jsonb,  -- [{rate: 19.0, net, tax}] per rate
  shipping_address jsonb, billing_address jsonb,   -- snapshots
  checkout_id, stripe_payment_intent_id,
  sales_channel,                              -- 'web' | 'admin' | later 'b2b'
  risk_status,                                -- 'ok' | 'review' | 'blocked'
  placed_at, canceled_at, completed_at, metadata jsonb
)
order_lines (
  id, order_id, product_variant_id, sku, title, variant_title,   -- snapshot fields!
  quantity int, unit_price_net int, unit_price_gross int,
  tax_rate numeric, tax_amount int, discount_amount int, total_gross int,
  quantity_fulfilled int default 0, quantity_shipped int default 0,
  quantity_delivered int default 0, quantity_returned int default 0,
  requires_shipping bool default true
)
order_transactions (
  id, order_id, type,           -- 'authorization'|'capture'|'refund'|'gift_card_redemption'
  amount int,                   -- signed: refunds negative
  currency, provider,           -- 'stripe'|'gift_card'|'bank_transfer'
  provider_ref, reason, order_line_refs jsonb, created_at
)
order_events (
  id, order_id, type, actor,    -- 'system'|'customer'|'admin:<id>'|'webhook'
  payload jsonb, created_at     -- the audit trail + outbox for emails/3PL
)
fulfillments (
  id, order_id, status,         -- 'pending'|'shipped'|'delivered'|'canceled'
  provider, tracking_number, tracking_url, carrier,
  shipped_at, delivered_at, packed_at, provider_payload jsonb
)
fulfillment_lines ( id, fulfillment_id, order_line_id, quantity )
```

**Must-have for launch:** three-status model, transactions ledger, events table, fulfillments with lines, address-snapshot pattern, cancel-before-ship + refund flows. **Later:** Medusa-style staged `order_change` versioning for full order edits, exchanges, claims — at NP7's volume, admin-side "refund + new order" covers exchanges for the first year.

**Pitfalls that bite custom shops:** storing money as floats (use integer cents); mutating order totals instead of appending transactions; a single `status` enum that grows to 25 values; line items FK'ing live product rows so a price/title edit rewrites history (snapshot everything); no `order_events` table, making every support dispute archaeology.

---

## 2. Checkout & Payments in the EU

### Stripe integration, 2026 best practice

- **API choice:** Stripe recommends the **Checkout Sessions API** (embedded or hosted) with the **Payment Element** ([best practices](https://docs.stripe.com/payments/payment-element/best-practices), [Payment Intents](https://docs.stripe.com/payments/payment-intents)). For a fully custom checkout UI: your `checkout` row → create PaymentIntent → Payment Element with `automatic_payment_methods` → confirm client-side → **finalize order server-side from the webhook**.
- **Payment methods for DE/EU** (~82% of German shoppers abandon if their preferred method is missing — [Unzer 2026](https://www.unzer.com/en/knowledge/articles/preferred-payment-methods-germany-2026/), [Noda guide](https://noda.live/articles/top-payment-methods-in-germany)):
  1. **PayPal** — non-negotiable for DE (~28% of e-commerce revenue, ~90% penetration). Native through Stripe in the EU.
  2. **Cards + Apple Pay / Google Pay** — table stakes; wallets satisfy SCA elegantly.
  3. **Klarna** — DE BNPL share (~18%) ~4× global average; also covers "Kauf auf Rechnung" — do NOT build invoice-purchase yourself (credit risk).
  4. **SEPA Direct Debit** (~17%) — cheap but asynchronous (days to settle, 8-week dispute window) — ship only on `payment_intent.succeeded`; consider excluding for high-value boards.
  5. **Bank transfer (Vorkasse)** — reuse NP7's pro-forma/Vorkasse machinery as a manual method for high-value orders.
- **SCA/PSD2:** automatic with Payment Element + PaymentIntents; 3DS-authenticated payments carry the **liability shift** ([SCA readiness](https://docs.stripe.com/strong-customer-authentication)). For saved cards use SetupIntents / `setup_future_usage: 'off_session'`.
- **Capture strategy:** at NP7's scale use **automatic capture** everywhere; treat cancellation-before-ship as instant refund. (Card auths expire ~7 days; Klarna/PayPal complicate delayed capture.) Revisit only for pre-orders with long lead times (then charge at ship-time as off-session MIT, or take a deposit).
- **Webhook discipline (the #1 custom-shop bug):** order finalized by exactly one writer. Verify signatures, store processed `event.id`s (unique index) for idempotency, make finalization an atomic conditional transition (`UPDATE checkout SET state='completed' WHERE state='pending'`) so success-page poll and webhook can race safely ([race analysis](https://dev.to/belazy/the-race-condition-youre-probably-shipping-right-now-with-stripe-webhooks-mj4)). Never mint the order client-side on redirect alone; never rely on the webhook alone for UX.
- **Chargebacks:** ingest `charge.dispute.created` into an admin queue; respond with evidence via API (tracking + delivery confirmation + customer comms win for physical goods). Prevention: recognizable statement descriptor, proactive shipping emails, easy support, fast refunds ([dispute prevention](https://docs.stripe.com/disputes/prevention/best-practices)).

### EU VAT: OSS, display, invoicing

- **Destination VAT + OSS:** cross-border B2C goods in the EU are taxed at the **customer's country rate** once total cross-border B2C turnover exceeds **€10,000/year** (single EU-wide threshold). Register for **Union OSS** via BZSt; one quarterly OSS return covers all member states ([Stripe EU VAT & OSS guide](https://stripe.com/guides/introduction-to-eu-vat-and-european-vat-oss), [hellotax OSS](https://hellotax.com/blog/one-stop-shop/)). NP7 will cross €10k immediately → **build destination-rate VAT from day one**: `tax_rates(country, rate_type, rate, valid_from)` table, rate resolved at checkout from shipping country, snapshotted per line. Stripe Tax is an option; with only standard-rate sporting goods a hand-maintained 27-row table is viable — lean recommendation for launch.
- **Non-EU orders (CH, UK, NO):** export, 0% German VAT, customer pays import duties. Flag in schema now (`tax_treatment: 'domestic'|'eu_oss'|'export'`).
- **Price display (PAngV):** B2C prices ALWAYS **VAT-inclusive** with "inkl. MwSt., zzgl. Versand"; shipping costs disclosed before checkout. Beware 1-cent rounding when destination rate changes the gross — fix the **gross price per country** or accept per-country variation (deliberate decision).
- **Invoices:** premium brand issues them always. §14 UStG mandatory fields; gapless numbering per division; credit notes (Storno) for refunds — the not-yet-built Storno generator becomes a hardware launch requirement. **Reuse NP7's EU PDF invoice engine; hardware division company settings must be filled.** B2B adds reverse-charge + VIES — leave `vat_id`, `reverse_charge bool` fields on the order now.

**Pitfalls:** computing VAT at display-time but not snapshotting on the order; forgetting OSS return needs **per-country** net/VAT aggregates (falls out of `orders.tax_country + tax_breakdown`); runtime €10k-threshold logic (just always charge destination VAT + OSS).

---

## 3. Inventory for D2C

- **Three-number model per SKU/location** (Medusa's `inventory_level`): `stocked_quantity`, `reserved_quantity`, `incoming_quantity`; **available = stocked − reserved** ([Medusa inventory](https://docs.medusajs.com/resources/commerce-modules/inventory/concepts)).
- **When to reserve:** NP7 sells boards, not sneaker drops. Skip TTL reservations at cart; **reserve atomically at order placement** (webhook finalization) with a conditional update. The oversell window is tiny and commercially survivable. Design the table so a `checkout_id`-owned reservation with `expires_at` can be added later.
- **Oversell prevention is a database property:** `UPDATE inventory_levels SET reserved_quantity = reserved_quantity + $q WHERE … AND stocked_quantity - reserved_quantity >= $q` — rowcount 0 ⇒ fail gracefully. No Redis needed at this scale.
- **Consume at fulfillment:** when the 3PL ships, convert reservation → decrement. Cancellations release reservations; returns restock via explicit restock action after inspection.
- **Backorders/pre-orders:** per-variant policy (`allow_backorder bool`, `preorder_until date`, `expected_ship_date`), let `available` go negative for backorderable SKUs, be radically transparent about dates ([Stoq preorder vs backorder](https://www.stoqapp.com/blog/difference-between-preorders-backorders-and-restocks)).
- **Stock display:** thresholded display (>5: "In stock"; below: "Only 2 left") — real numbers only; fake scarcity is a banned dark pattern under EU consumer law. Add "Back in stock" email subscriptions (`stock_notifications(variant_id, email)`).

```sql
inventory_items   ( id, variant_id, sku, requires_shipping )
stock_locations   ( id, name, type )       -- '3pl_main', 'hq', later 'container_incoming'
inventory_levels  ( inventory_item_id, location_id, stocked_quantity, reserved_quantity,
                    incoming_quantity, PRIMARY KEY (inventory_item_id, location_id) )
reservations      ( id, inventory_item_id, location_id, quantity,
                    order_line_id, created_at, expires_at nullable )
inventory_moves   ( id, inventory_item_id, location_id, delta, reason,
                    ref_type, ref_id, actor, created_at )   -- append-only ledger
```

The `inventory_moves` ledger is the piece naive shops skip and desperately retrofit: when 3PL counts and your DB disagree, the ledger tells you why.

---

## 4. Returns / RMA

### EU legal baseline

- **14-day withdrawal right** (Directive 2011/83/EU): from **delivery**, no reason needed. Customer has 14 further days to send back; refund within 14 days of withdrawal (may withhold until goods received or proof-of-return). Refund includes **original outbound shipping** (cheapest standard rate). Customer pays return shipping **only if told beforehand** (Widerrufsbelehrung). Fail to inform properly → window extends to **12 months + 14 days** ([Your Europe](https://europa.eu/youreurope/citizens/consumers/shopping/returns/index_en.htm), [EVZ](https://www.evz.de/en/topics/internet-shopping/online-shopping/right-of-withdrawal/)).
- **NEW since 19 June 2026 — the "withdrawal button"** (Directive 2023/2673, Art. 11a CRD): any distance-selling shop must provide a clearly labeled, permanently available **electronic withdrawal function** — two-step (declare → confirm) with durable-medium acknowledgement. Penalties up to 4% of turnover in some member states ([K&L Gates](https://klgates.com/New-EU-Withdrawal-Button-Requirement-Practical-Implications-and-Recommendations-for-US-and-Global-Online-Sellers-7-8-2026), [Greenberg Traurig](https://www.gtlaw.com/en/insights/2026/5/eu-consumer-law-new-withdrawal-button-requirements-for-online-contracts)). **Launch requirement** — and it dovetails with the returns portal (the button IS its entry).
- **Diminished-value rule:** consumer may inspect as in a shop; value loss beyond that (board used in water) can be deducted from the refund → the inspect-then-refund step matters.
- **Warranty ≠ withdrawal:** **2-year legal guarantee of conformity** (Directive 2019/771, §§434 ff. BGB): seller remedies defects free — repair/replace first. Burden of proof favors the consumer for the **first 12 months**. Manufacturer warranty ("5-year hull") is additional, own rules. Wear-and-tear vs defect disputes are the norm — photo-upload claim flow with structured triage is state of the art.

### Flow + tables

```
requested (withdrawal declared — ack email = legal duty) → approved (auto for withdrawal;
manual for warranty) → label_issued / pickup_arranged → in_transit → received → inspected
→ resolved: refunded | exchanged | credited | rejected
```

```sql
returns ( id, order_id, type,               -- 'withdrawal'|'warranty'|'goodwill'
  status, channel,                          -- 'portal'|'withdrawal_button'|'email'|'admin'
  declared_at, refund_shipping bool, refund_amount int, deduction_amount int,
  deduction_reason, refund_transaction_id, resolved_at )
return_lines ( id, return_id, order_line_id, quantity, reason_code, condition_on_arrival,
  restock bool, photos jsonb )
warranty_claims ( id, order_line_id nullable, customer_id, serial_number nullable,
  description, photos jsonb, status, resolution, factory_claim_ref nullable )
```

Self-service branded portal (Loop/Outvio pattern): order number + email → items + structured reason → outcome (refund / exchange / store credit, incentivize exchange) → prepaid label or "we'll arrange pickup" for bulky boards → status tracking. Restocking: sellable-condition only; B-stock gets a separate location/SKU (B-stock boards are a nice channel). 92% of customers with easy returns buy again.

**Pitfalls:** forgetting outbound shipping in the refund (legal violation); refunding before credit note; no structured reason codes (you lose the QA signal).

---

## 5. Customer Accounts & Post-Purchase

- **Guest checkout, account optional** — soft-create from order email; hardware order creates/links a contact tagged `hardware` in the existing CRM.
- **Branded order-tracking page as owned media** (`/orders/[token]`, no login) — most-visited page post-purchase; embed carrier status; use for content: setup guides, care instructions, cross-sell. Proactive tracking cuts "where is my order" tickets 60–80% ([LateShipment guide](https://www.lateshipment.com/blog/post-purchase-experience/)).
- **Email flow (Resend):** confirmation (with invoice PDF), payment received (async methods), shipped (tracking), delivered, review request. **Review timing for sporting goods: 14–21 days post-delivery** (the customer needs wind). All emails consume `order_events` — never inline `sendEmail()`; respect the `EMAIL_PIPELINE_LIVE_FROM` cutoff pattern.
- **Account area:** orders + status timeline, invoices, returns entry, addresses. NP7's member portal exists — hardware orders become a tab; windsurf-progression data is a unique cross-sell asset (recommend fin size from the member's rank).

---

## 6. Promotions: discounts, vouchers, gift cards, bundles

Clean model ≈ Medusa's Promotion module ([promotion concepts](https://docs.medusajs.com/resources/commerce-modules/promotion/concepts)):

- **Promotion** (definition): code (nullable for automatic), type (`standard`|`buyget`), status, usage limit, validity, campaign.
- **ApplicationMethod**: percentage|fixed, target items|shipping|order, value, allocation (each|across), `target_rules`, `buy_rules`.
- **PromotionRule**: generic attribute/operator/values triples (`customer.group in [team_riders]`) — rules-as-data prevents hardcoding campaigns.
- **Adjustments**: discount lands as `order_line_adjustments(line_id, promotion_id, amount)` — attributable, refundable pro-rata, VAT-correct.
- **Redemptions**: `promotion_redemptions(promotion_id, order_id, customer_id, amount)` — enforces limits, answers "what did this campaign cost".
- **Stacking**: explicit `stackable bool`; unbounded stacking is the promo-engine death spiral.
- **Bundles**: (1) bundle-as-SKU with BOM fanning out to component reservations (fixed "board + fin set"); (2) buyget promotion for soft bundles. No dynamic cart-composed bundles at launch.

**Gift cards are tender, not discounts:** `gift_cards(code, initial_value, currency, expires_at, status)` + ledger; redemption = `order_transactions` row provider `gift_card` (split tender). **Generalize NP7's Experience value-voucher system, don't build a second one.**

**EU VAT trap (Voucher Directive 2016/1065):** single-purpose voucher (place of supply + rate known at issuance) taxed at SALE; multi-purpose at REDEMPTION ([Price Bailey](https://www.pricebailey.co.uk/blog/vat-treatment-of-vouchers/)). A voucher spanning Hardware (19% goods) AND Experience (travel, margin scheme) is definitively an MPV. Decide redemption scope deliberately; confirm SPV/MPV with the tax advisor. Gift-card validity in DE: use 3+ years.

---

## 7. Reference architectures: what to copy

- **Medusa v2** (deepest open reference): three-status split; `order_transaction` ledger; payment collection → payment → capture/refund separation; fulfillment timestamps; inventory stocked/reserved/incoming + reservations; promotion rules-as-data. Its **versioned order edits** (`order_change` + `order_change_action`) are the *correct* answer to returns/exchanges/edits — copy the concept (staged, append-only changes), defer the full generality. Don't copy its module-isolation infrastructure — you have one Postgres schema, use real FKs.
- **Shopify**: the **FulfillmentOrder abstraction** (intent-to-fulfill vs actual fulfillment) — precisely the 3PL handoff object.
- **Commerce Layer**: cleanest status vocabulary; copy the two subtle states **`free`** (100%-voucher orders skip payment) and **`not_required`** (non-shippable lines) — custom shops always forget both.
- **Vendure**: explicit allowed-transitions map + transition hooks; skip the merged FSM.
- **Saleor**: payment transaction holds an event list — collapses into `order_transactions` + `order_events`.

Consolidated NP7 build: sketches above + `checkouts`, `payment_events` (raw Stripe webhook archive, unique on event_id), `tax_rates`, `stock_notifications`, `gift_cards` + ledger, `products/product_variants/prices`. ~20 tables. Everything money = integer cents; everything customer-facing snapshotted; everything state-changing through the transition function + `order_events`.

---

## 8. Fraud prevention

- **Stripe Radar** free with standard integrations: ML risk score, auto-block ≥75 ([Radar](https://stripe.com/radar)). NP7 profile = "high-value resellable goods"; PayPal/Klarna shift risk to the provider.
- **Manual review queue in YOUR admin:** `orders.risk_status = 'review'` (from Radar risk level via webhook) **holds the 3PL push** until approved. THE integration point that matters — goods leave fast with a 3PL. Review every order > €X for the first months.
- Basic hygiene: AVS/CVC decline rules, recognizable statement descriptor, billing address, log IP + user agent (dispute evidence). 3DS-request rule for high amounts (liability shift) via Radar for Fraud Teams later ([Radar rules](https://docs.stripe.com/radar/rules)).
- SEPA DD: 8-week no-questions dispute — exclude for high-value carts or delay fulfillment for first-time SEPA customers.

---

## Launch checklist vs later

**Must-have for D2C launch:**
1. Three-status order model, transition function, `order_events`, transactions ledger
2. Checkout: PaymentIntents + Payment Element (cards, PayPal, wallets, Klarna); webhook-idempotent finalization
3. Destination VAT with per-line snapshots, OSS registration (BZSt); VAT-inclusive display; invoice + **Storno** via existing engine (hardware division settings filled)
4. Inventory: levels + atomic reserve-at-placement + moves ledger + 3PL sync; honest stock display
5. Fulfillment push gated on payment + risk; tracking ingestion; shipped/delivered emails
6. Returns: **withdrawal button (legally required since 19 June 2026)**, self-service flow, refund incl. outbound shipping, credit notes
7. Transactional email set + tokenized tracking page; orders in the member portal
8. Promo codes (simple), gift cards on the generalized voucher system (SPV/MPV decided with tax advisor)
9. Radar default + review-hold + dispute queue
10. Regulatory: **GPSR** product-page info block; **VerpackG/LUCID** registration + dual-system license before the first parcel

**Deliberately later:** full order-edit versioning; exchange automation; TTL cart reservations & drops; charge-at-ship pre-orders; store-credit engine; buyget/bundles; warranty portal with factory-claim linkage; WhatsApp notifications; B2B fields designed now (`sales_channel`, `vat_id`, `reverse_charge`), built after D2C is live.

**Top 10 pitfalls:** float money; one mega-status; mutable orders without event log; client-side order creation; line items referencing live product rows; VAT not snapshotted; refunds without credit notes; gift cards as discounts; inventory as one mutable integer; fulfillment not gated on fraud review.
