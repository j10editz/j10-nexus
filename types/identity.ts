export type PlatformRoleType = "platform_founder" | "platform_admin" | "platform_support";

export interface PlatformRoleRecord {
  user_id: string;
  role: PlatformRoleType;
  granted_by?: string | null;
  granted_at: string;
  revoked_at?: string | null;
}

export interface UserProfileRecord {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  job_title: string;
  phone?: string | null;
  locale: string;
  timezone: string;
  status: "active" | "inactive" | "suspended";
  created_at: string;
  updated_at: string;
}

export interface WorkspaceInvitationRecord {
  id: string;
  workspace_id: string;
  email_normalized: string;
  role: "admin" | "manager" | "agent" | "viewer";
  token_hash: string;
  invited_by: string;
  expires_at: string;
  accepted_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
}

export interface AccountProfileResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
  };
  profile: UserProfileRecord | null;
  platformRole: PlatformRoleType | null;
  activeWorkspaceRole: string | null;
  activeWorkspaceName: string | null;
}
