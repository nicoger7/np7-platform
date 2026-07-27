"use client";

// The product page's add-to-cart module. Variants (sizes) come server-rendered
// with honest availability; sold-out products keep the enquiry path instead.
import { useState } from "react";
import Link from "next/link";
import { useCart } from "./cart";

export type BuyVariant = {
  id: string;
  name: string;
  sku: string;
  price: number;        // EUR gross (variant RRP, falls back to product price)
  available: number;    // sellable stock (HQ + 3PL, minus reservations)
};

export function BuyBox({
  productId, slug, name, currency, price, variants, productAvailable, image = null,
}: {
  productId: string;
  slug: string;
  name: string;
  currency: string;
  price: number | null;       // product-level price when no variants
  variants: BuyVariant[];
  productAvailable: number;   // availability when no variants exist
  image?: string | null;
}) {
  const cart = useCart();
  const [variantId, setVariantId] = useState<string | null>(variants[0]?.id ?? null);
  const [added, setAdded] = useState(false);

  const selected = variants.find((v) => v.id === variantId) ?? null;
  const hasVariants = variants.length > 0;
  const unitGross = hasVariants ? selected?.price ?? 0 : price ?? 0;
  const available = hasVariants ? selected?.available ?? 0 : productAvailable;

  const symbol = currency === "EUR" || !currency ? "€" : `${currency} `;
  const soldOut = available <= 0;

  function add() {
    if (!unitGross || soldOut) return;
    cart.add({
      productId, slug, name, image,
      variantId: hasVariants ? selected!.id : null,
      variantName: hasVariants ? selected!.name : null,
      sku: hasVariants ? selected!.sku : null,
      unitGross,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  }

  return (
    <div className="mt-6">
      {hasVariants && (
        <div className="flex flex-wrap gap-2 mb-4">
          {variants.map((v) => (
            <button
              key={v.id}
              onClick={() => setVariantId(v.id)}
              className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
                v.id === variantId
                  ? "bg-[#c2ff38] text-black border-[#c2ff38]"
                  : "border-white/25 text-white/80 hover:border-[#c2ff38]/60"
              } ${v.available <= 0 ? "opacity-45" : ""}`}
            >
              {v.name}{v.available <= 0 ? " · sold out" : ""}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={add}
          disabled={soldOut || !unitGross}
          className="px-7 py-3.5 rounded-full bg-[#c2ff38] text-black text-sm font-black uppercase tracking-wide disabled:opacity-40 hover:brightness-110 transition-all"
        >
          {soldOut ? "Sold out" : `Add to cart — ${symbol}${unitGross.toLocaleString("en-US")}`}
        </button>
        {added && (
          <Link href="/hardware/cart" className="text-sm font-bold text-[#c2ff38] underline underline-offset-4">
            Added ✓ — view cart
          </Link>
        )}
      </div>
      {!soldOut && available <= 5 && (
        <p className="text-xs text-amber-400 mt-2">Only {available} left</p>
      )}
      <p className="text-[11px] text-white/40 mt-2">incl. VAT · free EU shipping on boards · 14-day withdrawal right</p>
    </div>
  );
}
