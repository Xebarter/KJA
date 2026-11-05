import { ApplicationsWorkspace } from "@/components/admin/applications/ApplicationsWorkspace";
import { requireApplicationDesk } from "@/lib/admin-applications";
import "./applications.css";

export const metadata = { title: "Applications" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireApplicationDesk();
  const campuses = "error" in auth ? [] : auth.campuses;
  return <ApplicationsWorkspace searchParams={searchParams} base="/admin/applications" campuses={campuses} />;
}
