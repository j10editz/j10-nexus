# J10 NEXUS

J10 NEXUS is an AI business operations platform that combines AI employees,
workflow automation, CRM, integrations, analytics, and WhatsApp Business tools
in one workspace.

## Current capabilities

- Visual workflow authoring, publishing, versioning, and execution
- AI task orchestration with approvals, retries, and recovery
- CRM operations and automation triggers
- Secure OAuth and encrypted integration credentials
- Gmail and Google Calendar connectors
- WhatsApp Cloud API outbound delivery and signed inbound webhooks
- Operational dashboards, notifications, logs, and readiness checks

## Technology

- Next.js 16 and React 19
- TypeScript
- Supabase authentication and PostgreSQL
- OpenAI API
- Vercel deployment
- Vitest and Node.js test runner

## Local development

Requirements: Node.js 20 or later and a configured `.env.local` file.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

```bash
npm test
npm run build
```

## Production

The production application is deployed at
[j10-nexus.vercel.app](https://j10-nexus.vercel.app).

Secrets and provider credentials must be configured through deployment
environment variables or the encrypted J10 integration vault. Never commit an
environment file or access token.

## Documentation

- [Product roadmap](docs/ROADMAP.md)
- [Automation architecture](docs/architecture/AUTOMATION_SYSTEM.md)
