import { redirect } from "next/navigation";

// The gift form now lives on the main Gift vouchers page — keep this path working.
export default function PortalGiftBuyRedirect() {
  redirect("/account/vouchers");
}
