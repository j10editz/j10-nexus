import ModulePage from "@/ui/ModulePage";
import { BarChart3 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <ModulePage
      title="Analytics"
      description="Monitor performance, KPIs and business intelligence."
      icon={<BarChart3 size={28} />}
      action="Generate Report"
    />
  );
}