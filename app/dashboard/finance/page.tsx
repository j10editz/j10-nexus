import ModulePage from "@/ui/ModulePage";
import { DollarSign } from "lucide-react";

export default function FinancePage() {
  return (
    <ModulePage
      title="Finance"
      description="Manage invoices, expenses, revenue and financial operations."
      icon={<DollarSign size={28} />}
      action="New Invoice"
    />
  );
}