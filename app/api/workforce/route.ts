import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";
import {
  computeWorkforceMetrics,
  KNOWN_AI_AGENTS,
} from "@/lib/workforce/service";
import type { WorkforceMember } from "@/types/workforce";

export async function GET() {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    let { data: rows, error } = await supabase
      .from("workforce_members")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    // If no members exist yet, seed initial founder/leadership profile
    if (!rows || rows.length === 0) {
      const initialMember = {
        user_id: user.id,
        name: user.email?.split("@")[0] || "J10 Founder & CEO",
        role: "Chief Executive Officer & Head of AI Ops",
        department: "Leadership",
        email: user.email || "ceo@j10nexus.com",
        phone: "+1 (555) 019-2834",
        status: "active",
        assigned_agents: ["sales-agent", "support-agent", "marketing-agent", "finance-agent"],
      };

      const { data: created } = await supabase
        .from("workforce_members")
        .insert([initialMember])
        .select();

      rows = created || [initialMember];
    }

    const members: WorkforceMember[] = (rows || []).map((row: any) => ({
      id: row.id || "founder-1",
      userId: row.user_id,
      name: row.name,
      role: row.role,
      department: row.department,
      email: row.email,
      phone: row.phone,
      status: row.status || "active",
      assignedAgents: Array.isArray(row.assigned_agents) ? row.assigned_agents : [],
      monthlySalary: Number(row.monthly_salary) || 0,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
    }));

    // Fetch active AI Employees count
    const { count: aiCount } = await supabase
      .from("ai_employees")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    const activeAIs = Math.max(4, aiCount || 4);
    const summary = computeWorkforceMetrics(members, activeAIs);

    return NextResponse.json({
      success: true,
      members,
      aiAgents: KNOWN_AI_AGENTS,
      summary,
    });
  } catch (error) {
    console.error("Workforce GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load workforce directory." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      name,
      role,
      department = "Operations",
      email,
      phone,
      assignedAgents = [],
      status = "active",
    } = body;

    if (!name?.trim() || !role?.trim() || !email?.trim()) {
      return NextResponse.json(
        { success: false, error: "Name, role, and email are required." },
        { status: 400 }
      );
    }

    const newMember = {
      user_id: user.id,
      name: name.trim(),
      role: role.trim(),
      department: department.trim(),
      email: email.trim(),
      phone: phone?.trim() || null,
      assigned_agents: Array.isArray(assignedAgents) ? assignedAgents : [],
      status,
    };

    const { data: created, error } = await supabase
      .from("workforce_members")
      .insert([newMember])
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: "Database error adding team member." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      member: created,
      message: `${name} has been added to the hybrid workforce directory.`,
    });
  } catch (error) {
    console.error("Workforce POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create team member." },
      { status: 500 }
    );
  }
}
