import { ApplicationsWorkspace } from "@/components/admin/applications/ApplicationsWorkspace";

export const metadata = { title: "Applications" };

export default function OfficeApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ApplicationsWorkspace searchParams={searchParams} base="/admissions_office/applications" />;
}
