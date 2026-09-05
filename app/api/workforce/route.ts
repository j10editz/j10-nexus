import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import {
  computeWorkforceMetrics,
  KNOWN_AI_AGENTS,
} from "@/lib/workforce/service";
import type { WorkforceMember } from "@/types/workforce";

export async function GET() {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Authentication and active workspace required." },
        { status: 401 }
      );
    }

    const supabase = createServerSupabaseClient();
    const workspaceId = context.workspace.id;

    // 1. Fetch workforce members scoped strictly to workspace_id
    const { data: rows, error } = await supabase
      .from("workforce_members")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching workforce members:", error);
    }

    const members: WorkforceMember[] = (rows || []).map((row: any) => ({
      id: row.id,
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

    // 2. Fetch active AI Employees count for this workspace
    const { count: aiCount } = await supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "Running");

    // 3. Fetch automated tasks completed this month for this workspace
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: taskCount } = await supabase
      .from("automation_runs")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .gte("created_at", startOfMonth.toISOString());

    const summary = computeWorkforceMetrics(
      members,
      aiCount || 0,
      taskCount || 0
    );

    return NextResponse.json({
      success: true,
      members,
      summary,
      knownAgents: KNOWN_AI_AGENTS,
    });
  } catch (error: any) {
    console.error("GET /api/workforce error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load workforce." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Authentication and active workspace required." },
        { status: 401 }
      );
    }

    if (!["owner", "admin", "manager"].includes(context.membership.role)) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions to manage workforce." },
        { status: 403 }
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
      monthlySalary = 0,
    } = body;

    if (!name || !role || !email) {
      return NextResponse.json(
        { success: false, error: "Name, role, and email are required." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const newMember = {
      workspace_id: context.workspace.id,
      user_id: context.user.id,
      name: name.trim(),
      role: role.trim(),
      department: department.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      status: "active",
      assigned_agents: assignedAgents,
      monthly_salary: Number(monthlySalary) || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: created, error } = await supabase
      .from("workforce_members")
      .insert([newMember])
      .select()
      .single();

    if (error || !created) {
      console.error("POST /api/workforce insert error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to create team member." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Team member added successfully.",
      member: created,
    });
  } catch (error: any) {
    console.error("POST /api/workforce error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create team member." },
      { status: 500 }
    );
  }
}
