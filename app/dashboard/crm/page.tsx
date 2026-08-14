import ModulePage from "@/ui/ModulePage";
import { Users } from "lucide-react";

export default function CRMPage() {
  return (
    <ModulePage
      title="CRM"
      description="Manage customers, leads and sales."
      icon={<Users size={28} />}
      action="New Contact"
    />
  );
}