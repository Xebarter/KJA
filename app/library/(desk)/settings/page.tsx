import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm } from "@/components/library/ActionForm";
import { saveSettings } from "@/app/library/(desk)/actions";
import { libraryLabel, loadSettings, schemaHint } from "@/lib/library";
import { requireLibrary } from "@/lib/library-access";

export const metadata = { title: "Settings" };

export default async function LibrarySettingsPage() {
  const auth = await requireLibrary("settings");
  if ("error" in auth) return null;
  const settings = await loadSettings(auth.supabase, auth.activeLibrary);
  const probe = await auth.supabase.from("library_settings").select("library_id").eq("library_id", auth.activeLibrary).maybeSingle();
  const missing = schemaHint(probe.error?.message);

  return (
    <div className="app-page ofc-page lib-page">
      <PageHeader
        kicker={libraryLabel(auth.activeLibrary)}
        icon="fa-sliders"
        title="Settings"
        description="Loan rules for this library only — Lower and Upper keep their own."
      />
      {missing ? <p className="admin-empty">{missing}</p> : null}

      <section className="lib-panel" style={{ maxWidth: 560 }}>
        <div className="lib-panel-head">
          <div className="lib-panel-title">
            <h2>Loan rules</h2>
            <p>Applied when you issue a loan or close an overdue return.</p>
          </div>
        </div>
        <div className="lib-settings">
          <ActionForm action={saveSettings}>
            <div className="lib-form-row">
              <label className="lib-field">
                Loan days
                <input name="loan_days" type="number" min={1} max={90} defaultValue={settings.loan_days} required />
              </label>
              <label className="lib-field">
                Hold days
                <input
                  name="reservation_hold_days"
                  type="number"
                  min={1}
                  max={30}
                  defaultValue={settings.reservation_hold_days}
                  required
                />
              </label>
            </div>
            <div className="lib-form-row">
              <label className="lib-field">
                Max loans · pupil
                <input name="max_loans_pupil" type="number" min={1} max={20} defaultValue={settings.max_loans_pupil} required />
              </label>
              <label className="lib-field">
                Max loans · teacher
                <input
                  name="max_loans_teacher"
                  type="number"
                  min={1}
                  max={30}
                  defaultValue={settings.max_loans_teacher}
                  required
                />
              </label>
            </div>
            <label className="lib-field">
              Fine per day (UGX)
              <input name="fine_per_day" type="number" min={0} step={100} defaultValue={settings.fine_per_day} required />
            </label>
            <div className="lib-form-actions">
              <button className="lib-btn is-gold" type="submit">
                Save settings
              </button>
            </div>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
