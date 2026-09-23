"use client";

import { useEffect, useState } from "react";
import { Chip, Icon, InfoTip, PageHeader, btnSecondary, btnSecondaryStyle } from "@/components/admin/pd-ui";

const TOOL = "/api/admin/product-dev/plate-designer";

type Open = { id: string | null; name: string | null; dirty: boolean };

/**
 * The tool is its own full-page app (controls on the left, a 3D view on the
 * right), so it runs in a frame that fills the page. It tells this page which
 * project is open, so the header can name it, the address can hold it and
 * "Open full window" opens the same project.
 */
export function PlateDesignerFrame({ initialProject }: { initialProject: string | null }) {
  // Fixed once: a new src would reload the tool and lose unsaved work.
  const [src] = useState(() => (initialProject ? `${TOOL}?project=${initialProject}` : TOOL));
  const [open, setOpen] = useState<Open>({ id: initialProject, name: null, dirty: false });

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; id?: string | null; name?: string | null; dirty?: boolean } | null;
      if (!d || d.type !== "np7-plate-project") return;
      setOpen({ id: d.id ?? null, name: d.name ?? null, dirty: !!d.dirty });
      const url = new URL(window.location.href);
      if (d.id) url.searchParams.set("project", d.id);
      else url.searchParams.delete("project");
      window.history.replaceState(null, "", url.toString());
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div>
      <PageHeader
        title="Plate Designer"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            Plates for the tail cut-outs: load a board, draw the steps, export for the 3D printer.
            <InfoTip>
              Load a board as STL or Shape3D .s3dx and it finds the two tail cut-outs. Draw each step, place the screw
              holes (mirrored port and starboard), then export the full plate or one step as STL or OBJ. Save keeps the
              project in NP7: the plate, how the board was set up, and the board file itself, private. Projects opens any
              saved one with its board. Download .json still gives you a file copy.
            </InfoTip>
          </span>
        }
        chips={open.name ? <Chip tone="violet" dot>{open.name}{open.dirty ? " · unsaved changes" : ""}</Chip> : undefined}
        actions={
          <a href={open.id ? `${TOOL}?project=${open.id}` : TOOL} target="_blank" rel="noreferrer"
            className={btnSecondary} style={btnSecondaryStyle}>
            Open full window<Icon name="chevron" className="w-4 h-4" />
          </a>
        }
      />
      <iframe
        src={src}
        title="NP7 Plate Designer"
        allow="fullscreen"
        className="w-full rounded-2xl"
        style={{ height: "calc(100vh - 170px)", minHeight: 640, border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
      />
    </div>
  );
}
