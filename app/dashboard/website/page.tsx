import ModulePage from "@/ui/ModulePage";
import { Globe } from "lucide-react";

export default function WebsitePage() {
  return (
    <ModulePage
      title="Website Builder"
      description="Create and manage AI-powered websites."
      icon={<Globe size={28} />}
      action="Build Website"
    />
  );
}