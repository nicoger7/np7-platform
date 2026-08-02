import { redirect } from "next/navigation";

// The sidebar's active-link check is a prefix match, so the section's landing
// page lives one level down at /projects — otherwise this path would stay lit
// while you're inside the photo library.
export default function ProductDevIndex() {
  redirect("/admin/product-dev/projects");
}
