"use client";

import { useState } from "react";
import { DollarSign, Activity } from "lucide-react";
import ExecutiveRevenueDashboard from "@/components/revenue/ExecutiveRevenueDashboard";
import IntegrationAnalyticsDashboard from "@/components/integrations/IntegrationAnalyticsDashboard";

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<"revenue" | "integrations">("revenue");

  return (
    <div className="space-y-6">
      {/* Top Tab Bar */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab("revenue")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === "revenue"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <DollarSign className="h-4 w-4" />
          <span>Executive Revenue Funnel</span>
        </button>

        <button
          onClick={() => setActiveTab("integrations")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === "integrations"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>Integration Telemetry</span>
        </button>
      </div>

      {/* Content */}
      {activeTab === "revenue" ? (
        <ExecutiveRevenueDashboard />
      ) : (
        <IntegrationAnalyticsDashboard />
      )}
    </div>
  );
}
