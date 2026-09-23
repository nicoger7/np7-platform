"use client";

import { Icon, InfoTip, PageHeader, btnPrimary, btnPrimaryStyle } from "@/components/admin/pd-ui";

const TOOL = "/api/admin/product-dev/plate-designer";

/**
 * The Plate Designer inside Product Development: 3D-printable plates for the
 * tail cut-outs. The tool is its own full-page app (controls on the left, a 3D
 * view on the right), so it runs in a frame that fills the page, with a way out
 * to a whole window for detailed path work.
 */
export default function PlateDesignerPage() {
  return (
    <div>
      <PageHeader
        title="Plate Designer"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            Plates for the tail cut-outs: load a board, draw the steps, export for the 3D printer.
            <InfoTip>
              Load a board as STL or Shape3D .s3dx and it finds the two tail cut-outs. Draw each step with the path
              editor, place the screw holes (mirrored port and starboard), then export the full plate or one step as
              STL or OBJ. Designs are saved and loaded as JSON files. Everything happens in your browser: the board
              files and designs are never uploaded.
            </InfoTip>
          </span>
        }
        actions={
          <a href={TOOL} target="_blank" rel="noreferrer" className={btnPrimary} style={btnPrimaryStyle}>
            Open full window<Icon name="chevron" className="w-4 h-4" />
          </a>
        }
      />
      <iframe
        src={TOOL}
        title="NP7 Plate Designer"
        allow="fullscreen"
        className="w-full rounded-2xl"
        style={{ height: "calc(100vh - 170px)", minHeight: 640, border: "1px solid var(--admin-border)", backgroundColor: "#f1f5f9" }}
      />
    </div>
  );
}
