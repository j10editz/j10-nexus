import DashboardLayout from "@/components/dashboard/DashboardLayout";
import Overview from "@/components/dashboard/Overview";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser();

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "there";

  return (
    <DashboardLayout>
      <Overview userName={displayName} />
    </DashboardLayout>
  );
}