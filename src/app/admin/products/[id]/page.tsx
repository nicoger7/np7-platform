"use client";

import { use } from "react";
import ProductEditor from "@/components/admin/product-editor";

// Backend surface: Details · Variants · Inquiries.
// The website side of the same product lives at /admin/product-pages/[id].
export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProductEditor id={id} surface="backend" />;
}
