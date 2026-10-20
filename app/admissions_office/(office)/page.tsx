import { Suspense } from "react";
import { Overview } from "@/components/office/Overview";
import { OfficeNotice } from "@/components/office/ui";
import { requireOffice } from "@/lib/office";
import { supabaseConfigured } from "@/lib/supabase/server";
import "./overview.css";

export const metadata = { title: "Overview" };

function OverviewFallback() {
  return (
    <div className="app-page nav-loading" aria-busy="true" aria-label="Loading overview">
      <span className="is-title" />
      <span style={{ width: "min(28rem, 90%)" }} />
      <span className="is-panel" />
    </div>
  );
}

async function OverviewBody() {
  const auth = await requireOffice();
  if ("error" in auth) {
    return <OfficeNotice title="Overview" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  }
  return <Overview {...auth} />;
}

export default async function OverviewPage() {
  if (!supabaseConfigured()) {
    return (
      <OfficeNotice title="Overview" heading="Connect Supabase">
        <p>Add your Supabase keys to <code>.env.local</code> to use the admissions office.</p>
      </OfficeNotice>
    );
  }
  return (
    <Suspense fallback={<OverviewFallback />}>
      <OverviewBody />
    </Suspense>
  );
}
