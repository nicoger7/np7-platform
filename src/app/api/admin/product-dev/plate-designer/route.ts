import { NextResponse } from "next/server";
import { requireAdminGate } from "@/lib/admin-auth";
import { PLATE_DESIGNER_PAGE } from "@/lib/plate-designer-page";

/**
 * GET /api/admin/product-dev/plate-designer — the NP7 Plate Designer itself.
 *
 * One self-contained HTML file (src/product-dev/plate-designer, v22 of
 * 17.09.2026, see its DEPLOYMENT.md): load a board as STL or Shape3D .s3dx, it
 * finds the two tail cut-outs, draw the stepped plates with the path editor,
 * place the screw holes, export STL/OBJ for the 3D printer. The designing all
 * happens in the browser. The NP7 layer added to it saves and opens projects
 * (plate + board file) through /api/admin/product-dev/plate-designs.
 *
 * Served from here rather than from public/ so only a signed-in team member
 * with Product Development access can open it: the middleware and the gate
 * below cover /api/admin like every other admin route.
 */
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  return new NextResponse(PLATE_DESIGNER_PAGE, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
