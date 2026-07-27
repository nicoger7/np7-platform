"use client";

// Status badges for the hardware supply chain (POs + inbound shipments).

export const PO_STATUS_COLOR: Record<string, string> = {
  draft: "admin-surface admin-muted",
  issued: "bg-blue-500/15 text-blue-400",
  confirmed: "bg-blue-500/15 text-blue-400",
  in_production: "bg-amber-500/15 text-amber-500",
  ready_to_ship: "bg-amber-500/15 text-amber-500",
  shipped: "bg-purple-500/15 text-purple-400",
  partially_received: "bg-green-500/15 text-green-400",
  received: "bg-green-500/15 text-green-400",
  closed: "admin-surface admin-faint",
  cancelled: "bg-red-500/15 text-red-400",
};

export const SHIPMENT_STATUS_COLOR: Record<string, string> = {
  booked: "admin-surface admin-muted",
  in_transit: "bg-purple-500/15 text-purple-400",
  at_port: "bg-amber-500/15 text-amber-500",
  cleared: "bg-blue-500/15 text-blue-400",
  received: "bg-green-500/15 text-green-400",
  closed: "admin-surface admin-faint",
};

export function StatusBadge({ value, colors }: { value: string; colors: Record<string, string> }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${colors[value] ?? "admin-surface admin-muted"}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}
