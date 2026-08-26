import { notFound } from "next/navigation";
import PromoStudio from "@/components/admin/promo-studio";

/**
 * QA harness for the Promo Studio (same idea as /tile-preview): iterate on the
 * editor without an admin session. Dev-only — 404s in every deployed build.
 * The admin data fetches (coaches/editions/designs) 401 without a session and
 * degrade to empty lists; canvas editing and export are fully testable.
 */
export default function PromoPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <div className="min-h-screen bg-[#f4f7f8] p-6">
      <div className="max-w-[1400px] mx-auto">
        <h1 className="text-[#0a2a33] text-2xl font-black mb-3">Promo Studio — QA harness</h1>
        <PromoStudio />
      </div>
    </div>
  );
}
