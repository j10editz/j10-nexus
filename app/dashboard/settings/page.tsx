import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/auth";
const groups = [
  { label:"Workspace", items:[["General","Business details, locale and brand","/dashboard/settings"],["Team & access","Members, roles and permissions","/dashboard/settings"]] },
  { label:"Platform", items:[["Connections","Channels and business integrations","/dashboard/connections"],["Billing","Plan, invoices and usage","/dashboard/settings/billing"]] },
  { label:"Intelligence", items:[["AI preferences","Voice, behavior and approvals","/dashboard/ai-employees"],["Automation history","Runs, failures and activity","/dashboard/automation"]] },
];
export default async function SettingsPage(){const user=await requireUser();return <div className="j10-settings-page">
  <header className="j10-saas-head"><div><p>J10 SETTINGS</p><h1>Workspace settings</h1><span>Manage your business, team, connections, and account from one place.</span></div></header>
  <div className="j10-settings-layout">
    <aside className="j10-account-card"><Image src="/brand/j10-expression-confident.png" width={112} height={112} alt="J10 mascot"/><div><span>J10 Workspace</span><strong>{user.email??"Workspace owner"}</strong><small>Owner account</small></div><i>Active</i></aside>
    <main className="j10-settings-groups">{groups.map(group=><section key={group.label}><h2>{group.label}</h2>{group.items.map(([title,description,href])=><Link key={title} href={href}><div><strong>{title}</strong><span>{description}</span></div><b>›</b></Link>)}</section>)}</main>
    <aside className="j10-plan-card"><span>CURRENT PLAN</span><strong>J10 Growth</strong><p>Your workspace is active and ready to connect.</p><div><i style={{width:"38%"}}/></div><small>3,842 of 10,000 messages</small><Link href="/dashboard/settings/billing">Manage plan</Link></aside>
  </div>
</div>}
