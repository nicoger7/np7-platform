"use client";

// Standard row actions (duplicate + delete) for CRUD list pages.
export function RowActions({ onDuplicate, onDelete }: { onDuplicate: () => void; onDelete: () => void }) {
  return (
    <span className="flex items-center gap-2 self-center justify-end">
      <button
        onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
        className="admin-faint hover:text-[#0aa3c7] transition-colors"
        title="Duplicate"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="admin-faint hover:text-red-400 transition-colors"
        title="Delete"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
      </button>
    </span>
  );
}
