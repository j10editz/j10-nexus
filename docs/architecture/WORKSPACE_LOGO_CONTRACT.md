# Architecture Contract: J10 Workspace Logo Storage & Isolation

**Phase:** Phase 3A $\rightarrow$ Phase 3B Foundation  
**Classification:** `migration_required`  
**Security Boundary:** Multi-Tenant Supabase Storage RLS & Owner/Admin Authorization  

---

## 1. Context & Security Decision

In Phase 3A Product Truth Audit, we verified that the `workspaces` table in PostgreSQL contains a `logo_url TEXT` column, but **no Supabase Storage bucket or Storage RLS policies** currently exist in the database migrations.

Per J10 strict product truth requirements:
> *"If secure storage and policies do not exist, do not fabricate an upload control. Document the precise migration, storage bucket, RLS policies and authorization contract required for the next phase."*

This document defines the production specification for Phase 3B to implement workspace logo upload without compromising multi-tenant isolation or personal identity separation.

---

## 2. Personal Avatar vs. Workspace Logo Separation Contract

| Dimension | Personal User Avatar | Business / Workspace Logo |
| :--- | :--- | :--- |
| **Entity Scope** | User-level (`auth.users`, `public.profiles`) | Tenant-level (`public.workspaces`) |
| **Storage Field** | `profiles.avatar_url` | `workspaces.logo_url` |
| **Resolution Hierarchy** | 1. User-uploaded profile photo<br>2. Authenticated Google OAuth avatar (`user_metadata.avatar_url` / `picture`) with HTTPS host validation<br>3. Generic user icon fallback | 1. Verified workspace logo URL<br>2. Workspace initial monogram with brand gradient |
| **Where Rendered** | Topbar profile menu, account dropdown, personal comments, author stamps | Workspace switcher, sidebar branding, customer-facing booking headers, invoices, public funnels |
| **Modification Rights** | Authenticated user modifying own profile | Workspace `owner` or `admin` only |
| **Cross-Contamination Rule** | **STRICT PROHIBITION:** Setting or removing a workspace logo must NEVER alter the user's personal avatar. Updating personal profile photo must NEVER alter the workspace logo. |

---

## 3. Storage Bucket Specification

### Bucket Configuration
- **Bucket ID:** `workspace-logos`
- **Public Access:** `true` (read-only for verified public assets, like invoices and booking pages)
- **File Size Limit:** `2,097,152` bytes (2 MB)
- **Allowed MIME Types:** `["image/png", "image/jpeg", "image/webp"]`

### Path Convention
Every object MUST reside in a tenant-isolated directory:
```
workspace-logos/workspaces/{workspace_id}/logo_{epoch_ms}_{random_hex8}.{ext}
```
Example:
```
workspace-logos/workspaces/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo_1727725200000_f4a9b2c1.webp
```

---

## 4. Supabase Storage Migration (Phase 3B Proposal)

```sql
-- Migration: 20261016_workspace_logos_storage_foundation.sql
-- Description: Provision tenant-isolated storage bucket and RLS policies for workspace logos.

-- 1. Create storage bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspace-logos',
  'workspace-logos',
  true,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage Object RLS Policies

-- Public Read: Anyone can view logos for public invoices, customer portals, and booking pages
CREATE POLICY "Public Read Workspace Logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'workspace-logos');

-- Tenant Owner/Admin Upload Policy
CREATE POLICY "Tenant Owner/Admin Upload Workspace Logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'workspace-logos'
  AND (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = (storage.foldername(name))[2]::uuid
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  )
);

-- Tenant Owner/Admin Update Policy
CREATE POLICY "Tenant Owner/Admin Update Workspace Logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'workspace-logos'
  AND (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = (storage.foldername(name))[2]::uuid
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  )
);

-- Tenant Owner/Admin Delete Policy
CREATE POLICY "Tenant Owner/Admin Delete Workspace Logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'workspace-logos'
  AND (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = (storage.foldername(name))[2]::uuid
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  )
);
```

---

## 5. Server-Side Verification & API Contract

### Route: `POST /api/workspaces/logo` (Proposed for Phase 3B)
- **Authorization:** `requireApiWorkspaceContext("admin")`
- **Validation Pipeline:**
  1. Inspect multipart `Content-Type` boundary.
  2. Validate payload size $\le 2 \text{ MB}$.
  3. Validate file extension (`.png`, `.jpg`, `.jpeg`, `.webp`).
  4. Perform **magic byte sniffing**:
     - PNG: `89 50 4E 47 0D 0A 1A 0A`
     - JPEG: `FF D8 FF`
     - WebP: `52 49 46 46 ... 57 45 42 50`
  5. Validate image decoding via `sharp` to verify the buffer is an uncorrupted image and cannot execute polyglot payloads.
  6. Generate safe randomized key: `workspaces/{workspace_id}/logo_{Date.now()}_{randomUUID().slice(0,8)}.{ext}`.
  7. Upload to Supabase Storage with bucket `workspace-logos`.
  8. Update `public.workspaces` setting `logo_url = publicUrl` and `updated_at = NOW()`.
  9. Audit log the action under `workspace_activity_logs`.

---

## 6. Phase 3A Current Implementation

Until Phase 3B applies the migration and storage bucket above:
- The UI in `J10 Brand` renders the truthful state: displaying workspace name, monogram fallback, theme colors, and portal branding.
- No dummy file upload buttons that fail or mock state are rendered to authenticated users.
- `workspace_logo_status` is reported as `migration_required`.
