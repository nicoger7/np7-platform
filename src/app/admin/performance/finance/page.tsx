import { Budget } from "@/components/admin/budget";

/* NP7 Performance's budget, and the address says so. The world is pinned by the
   route rather than read from wherever the sidebar happened to be, so this link
   opens the same books for whoever you send it to. */
export default function PerformanceBudgetPage() {
  return <Budget world="hardware" />;
}
