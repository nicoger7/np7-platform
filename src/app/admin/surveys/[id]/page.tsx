import { notFound } from "next/navigation";
import { getSurvey, listInvites } from "@/lib/surveys";
import { SurveyAdmin } from "@/components/admin/survey-admin";

export const dynamic = "force-dynamic";

export default async function AdminSurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const survey = await getSurvey(id);
  if (!survey) notFound();
  const invites = await listInvites(id);
  return <SurveyAdmin initialSurvey={survey} initialInvites={invites} />;
}
