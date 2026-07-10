import { listApplications } from "@/lib/signature";
import { ApplicationsReview } from "@/components/admin/applications-review";

export const dynamic = "force-dynamic";

export default async function AdminApplicationsPage() {
  const applications = await listApplications();
  return <ApplicationsReview initial={applications} />;
}
