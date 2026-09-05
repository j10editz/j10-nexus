import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { requireWorkspaceContext } from "@/lib/workspaces/server";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-side boundary: enforce authenticated session & active workspace membership.
  // Anonymous visitors are redirected to /login before any dashboard shell renders.
  // Authenticated users with zero workspaces are redirected to /onboarding.
  await requireWorkspaceContext();

  return (
    <DashboardLayout>
      {children}
    </DashboardLayout>
  );
}
