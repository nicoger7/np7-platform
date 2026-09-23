import { PLATE_DESIGNER_HTML, PLATE_DESIGNER_PROJECTS_JS } from "@/lib/plate-designer-html.generated";

/**
 * The page the admin serves: the Plate Designer exactly as handed over, with
 * the NP7 projects layer (np7-projects.js) added just before </body>, where it
 * runs after the tool and works through the tool's own functions.
 */
function withLayer(html: string, js: string): string {
  const at = html.lastIndexOf("</body>");
  if (at < 0) return html;
  return `${html.slice(0, at)}<script>\n${js}\n</script>\n${html.slice(at)}`;
}

export const PLATE_DESIGNER_PAGE = withLayer(PLATE_DESIGNER_HTML, PLATE_DESIGNER_PROJECTS_JS);
