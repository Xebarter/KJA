import { ActionForm } from "@/components/account/ActionForm";
import { updateParentProfile } from "@/app/account/actions";
import { getPortal } from "@/lib/portal";

export default async function ProfilePage() {
  const { profile, user } = await getPortal();
  return (
    <div>
      <div className="account-title">
        <div>
          <h1>My details</h1>
          <p>These details are used on applications and school communication.</p>
        </div>
      </div>
      <div className="account-card">
        <ActionForm action={updateParentProfile} success="Details saved.">
          <label>Full name<input name="full_name" defaultValue={profile?.full_name || ""} required /></label>
          <label>Email<input value={user?.email || profile?.email || ""} disabled /></label>
          <label>Phone<input name="phone" defaultValue={profile?.phone || ""} /></label>
          <label>Address<textarea name="address" rows={3} defaultValue={profile?.address || ""} /></label>
          <button className="account-btn" type="submit">Save details</button>
        </ActionForm>
      </div>
    </div>
  );
}
