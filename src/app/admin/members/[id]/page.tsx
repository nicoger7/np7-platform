import { redirect } from "next/navigation";

// Member detail now lives inside the Member Management split view. Deep links
// (and old bookmarks) funnel into it with the member preselected.
export default async function MemberRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/members?id=${id}`);
}
