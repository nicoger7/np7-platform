"use client";

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSort: string | null;
  currentDir: "asc" | "desc" | null;
  onSort: (key: string) => void;
  className?: string;
}

export function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className = "",
}: SortableHeaderProps) {
  const isActive = currentSort === sortKey;

  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-[10px] font-bold tracking-[0.1em] uppercase transition-colors text-left ${
        isActive ? "text-[#0aa3c7]" : "admin-faint hover:text-[var(--admin-text-muted)]"
      } ${className}`}
    >
      {label}
      <span className="w-3 flex-shrink-0 text-[9px]">
        {isActive && currentDir === "asc" && "▲"}
        {isActive && currentDir === "desc" && "▼"}
      </span>
    </button>
  );
}
