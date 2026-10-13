import { ApplicationDetail } from "@/components/admin/applications/ApplicationDetail";

export const metadata = { title: "Application" };

export default function OfficeApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  return <ApplicationDetail params={params} base="/admissions_office/applications" />;
}
