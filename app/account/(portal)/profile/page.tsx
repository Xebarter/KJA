import { ProfileView } from "@/components/account/ProfileView";
import { getPortal } from "@/lib/portal";

export const metadata = { title: "My details" };

export default async function ProfilePage() {
  const { profile, user, pupils } = await getPortal();
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [];
  return (
    <ProfileView
      name={profile?.full_name?.trim() || ""}
      email={user?.email || profile?.email || ""}
      phone={profile?.phone?.trim() || ""}
      address={profile?.address?.trim() || ""}
      verified={Boolean(user?.email_confirmed_at)}
      google={user?.app_metadata?.provider === "google" || providers.includes("google")}
      createdAt={user?.created_at}
      lastSignInAt={user?.last_sign_in_at}
      childList={pupils}
    />
  );
}
