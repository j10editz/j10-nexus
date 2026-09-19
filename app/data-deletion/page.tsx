import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Data Deletion Instructions",
  description:
    "How to request deletion of personal data processed by J10 NEXUS.",
  alternates: { canonical: "/data-deletion" },
};

export default function DataDeletionPage() {
  return (
    <main className="j10-canvas min-h-screen text-white">
      <Navbar />

      <section className="mx-auto max-w-4xl px-5 py-16 sm:py-24 lg:px-8">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1.5 text-xs font-semibold text-violet-300">
            <Trash2 size={13} />
            Data Rights
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Data Deletion Instructions
          </h1>
          <p className="mt-3 text-xs text-[#8d96a8]">Last updated: September 19, 2026</p>
        </div>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-[#cbd3e3]">
          <section className="j10-surface rounded-2xl border border-white/[0.08] p-6 sm:p-7">
            <h2 className="mb-2 text-base font-bold text-white">1. Request deletion</h2>
            <p className="text-xs leading-6 text-[#8d96a8]">
              Email <a className="font-semibold text-cyan-300 hover:underline" href="mailto:contact@j10-nexus.com?subject=Data%20Deletion%20Request">contact@j10-nexus.com</a> with the subject line “Data Deletion Request.” Include the email address used with J10 NEXUS, the relevant business or workspace name when known, and a clear description of the records you want deleted. Do not send passwords, API keys, or payment-card data.
            </p>
          </section>

          <section className="j10-surface rounded-2xl border border-white/[0.08] p-6 sm:p-7">
            <h2 className="mb-2 text-base font-bold text-white">2. Identity and workspace verification</h2>
            <p className="text-xs leading-6 text-[#8d96a8]">
              Before deleting data, we verify that the requester is the affected individual or an authorized workspace Owner or administrator. We may ask you to reply from the account email, sign in to the relevant workspace, or provide additional evidence of authority. We do not process requests that cannot be safely matched to a person and workspace.
            </p>
          </section>

          <section className="j10-surface rounded-2xl border border-white/[0.08] p-6 sm:p-7">
            <h2 className="mb-2 text-base font-bold text-white">3. Data covered</h2>
            <p className="text-xs leading-6 text-[#8d96a8]">
              Subject to the exceptions below, a verified request can cover account profile data, workspace records, CRM contacts, conversation threads and messages, uploaded business documents, integration configuration, and associated automation records. Deleting a workspace can affect access for its members and connected communication channels.
            </p>
          </section>

          <section className="j10-surface rounded-2xl border border-white/[0.08] p-6 sm:p-7">
            <h2 className="mb-2 text-base font-bold text-white">4. Processing timeframe and confirmation</h2>
            <p className="text-xs leading-6 text-[#8d96a8]">
              We acknowledge verified requests within 7 calendar days and aim to complete them within 30 calendar days. If a request is complex or requires additional verification, we will explain the expected timeline. We send confirmation to the verified request channel when deletion is completed or when a lawful exception applies.
            </p>
          </section>

          <section className="j10-surface rounded-2xl border border-white/[0.08] p-6 sm:p-7">
            <h2 className="mb-2 text-base font-bold text-white">5. Retention exceptions</h2>
            <p className="text-xs leading-6 text-[#8d96a8]">
              We may retain the minimum information required to comply with law, tax or accounting duties, payment and fraud-prevention obligations, security incident investigation, dispute resolution, or enforcement of agreements. Retained information remains access-restricted and is not used for unrelated purposes.
            </p>
          </section>
        </div>
      </section>

      <Footer />
    </main>
  );
}
