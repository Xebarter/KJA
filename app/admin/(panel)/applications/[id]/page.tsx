import { ApplicationDetail } from "@/components/admin/applications/ApplicationDetail";

export const metadata = { title: "Application" };

export default function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  return <ApplicationDetail params={params} base="/admin/applications" />;
}
