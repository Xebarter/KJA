import { ApplicationsWorkspace } from "@/components/admin/applications/ApplicationsWorkspace";
import { requireApplicationDesk } from "@/lib/admin-applications";

export const metadata = { title: "Applications" };

export default async function OfficeApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireApplicationDesk();
  const campuses = "error" in auth ? [] : auth.campuses;
  return <ApplicationsWorkspace searchParams={searchParams} base="/admissions_office/applications" campuses={campuses} />;
}
