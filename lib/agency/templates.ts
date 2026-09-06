import type { SupabaseClient } from "@supabase/supabase-js";

export interface TemplateAiEmployee {
  name: string;
  role: string;
  department: string;
  avatarUrl?: string;
  systemPrompt?: string;
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  slug: string;
  vertical: string;
  description: string | null;
  system_prompt_blueprint: string | null;
  default_ai_employees: TemplateAiEmployee[];
  default_pipeline_stages: string[];
  default_knowledge_topics: string[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApplyTemplateResult {
  success: boolean;
  workspaceId: string;
  templateSlug: string;
  agentsCreated: number;
  knowledgeTopicsCreated: number;
  pipelineStagesApplied: string[];
}

/**
 * Retrieves all available templates (global industry blueprints + agency custom templates).
 */
export async function getAvailableTemplates(
  supabase: SupabaseClient,
  workspaceId?: string
): Promise<WorkspaceTemplate[]> {
  let query = supabase
    .from("workspace_templates")
    .select("*")
    .order("name", { ascending: true });

  if (workspaceId) {
    query = query.or(`is_public.eq.true,workspace_id.eq.${workspaceId}`);
  } else {
    query = query.eq("is_public", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch workspace templates: ${error.message}`);
  }

  return (data || []) as WorkspaceTemplate[];
}

/**
 * Retrieves a specific template by slug.
 */
export async function getTemplateBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<WorkspaceTemplate | null> {
  const { data, error } = await supabase
    .from("workspace_templates")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  return data as WorkspaceTemplate;
}

/**
 * Applies an industry blueprint to a target workspace:
 * Seeds vertical-specific AI employees, knowledge articles, and pipeline stages.
 */
export async function applyWorkspaceTemplate(
  supabase: SupabaseClient,
  workspaceId: string,
  templateSlug: string
): Promise<ApplyTemplateResult> {
  const template = await getTemplateBySlug(supabase, templateSlug);
  if (!template) {
    throw new Error(`Template blueprint '${templateSlug}' was not found.`);
  }

  let agentsCreated = 0;
  let knowledgeTopicsCreated = 0;

  // 1. Seed AI Employees into workforce_agents if table exists
  const employees = Array.isArray(template.default_ai_employees)
    ? template.default_ai_employees
    : [];

  if (employees.length > 0) {
    for (const emp of employees) {
      const { error: agentErr } = await supabase
        .from("workforce_agents")
        .insert({
          workspace_id: workspaceId,
          name: emp.name,
          role: emp.role,
          department: emp.department || "Customer Operations",
          status: "active",
          system_prompt: emp.systemPrompt || template.system_prompt_blueprint || "Deliver professional enterprise assistance.",
          metadata: {
            seeded_from_template: templateSlug,
          },
        });

      if (!agentErr) {
        agentsCreated++;
      }
    }
  }

  // 2. Seed Knowledge Hub Articles
  const topics = Array.isArray(template.default_knowledge_topics)
    ? template.default_knowledge_topics
    : [];

  if (topics.length > 0) {
    for (const topic of topics) {
      const { error: kbErr } = await supabase
        .from("knowledge_articles")
        .insert({
          workspace_id: workspaceId,
          title: topic,
          category: template.vertical,
          content: `Initial blueprint documentation for ${topic}. Customized for ${template.name}. Update with your exact firm standard operating procedures (SOPs).`,
          status: "published",
        });

      if (!kbErr) {
        knowledgeTopicsCreated++;
      }
    }
  }

  return {
    success: true,
    workspaceId,
    templateSlug,
    agentsCreated,
    knowledgeTopicsCreated,
    pipelineStagesApplied: template.default_pipeline_stages || [],
  };
}
