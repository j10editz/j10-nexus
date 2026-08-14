import ModulePage from "@/ui/ModulePage";
import { Workflow } from "lucide-react";

export default function AutomationPage() {
  return (
    <ModulePage
      title="Automation"
      description="Build and manage intelligent business workflows."
      icon={<Workflow size={28} />}
      action="New Workflow"
    />
  );
}