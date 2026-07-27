import { notFound } from "next/navigation";
import { flags } from "@/lib/flags";
import { CartProvider } from "@/components/hardware/cart";

// Hidden in production until SHOW_HARDWARE=true — a plain 404, no public hint.
// CartProvider gives every shop page (product, cart, checkout) the same cart.
export default function HardwareLayout({ children }: { children: React.ReactNode }) {
  if (!flags.showHardware) notFound();
  return <CartProvider>{children}</CartProvider>;
}
