import { PlateDesignerFrame } from "./plate-designer-frame";

/**
 * The Plate Designer inside Product Development. `?project=<id>` opens a saved
 * project straight away (the Archive links there, and the page keeps the open
 * project in its own address so a reload lands on it again).
 */
export default async function PlateDesignerPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const id = project && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(project) ? project : null;
  return <PlateDesignerFrame initialProject={id} />;
}
