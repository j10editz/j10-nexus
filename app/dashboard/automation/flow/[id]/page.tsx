import J10FlowBuilder from "@/components/automation/J10FlowBuilder";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function J10FlowBuilderPage({ params }: PageProps) {
  const { id } = await params;

  return <J10FlowBuilder automationId={id} />;
}
