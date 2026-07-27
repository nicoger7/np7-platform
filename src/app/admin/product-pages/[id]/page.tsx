"use client";

import { use } from "react";
import ProductEditor from "@/components/admin/product-editor";

// Website surface: Content · Find Your Fit — what shows on np-seven.com.
// The backend side of the same product lives at /admin/products/[id].
export default function ProductPageEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProductEditor id={id} surface="website" />;
}
