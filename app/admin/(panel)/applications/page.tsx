import { ApplicationsWorkspace } from "@/components/admin/applications/ApplicationsWorkspace";
import "./applications.css";

export const metadata = { title: "Applications" };

export default function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ApplicationsWorkspace searchParams={searchParams} base="/admin/applications" />;
}
