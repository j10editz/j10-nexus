import {
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  dashboardNavigationItems,
  primaryNavigationItems,
  readyDashboardNavigationItems,
  supportingNavigationItems,
} from "../../lib/dashboard/navigation";

const projectRoot = process.cwd();

function readProjectFile(relativePath: string) {
  return readFileSync(
    join(projectRoot, relativePath),
    "utf8"
  );
}

function routeFile(href: string) {
  const route = href.split(/[?#]/)[0];

  if (route === "/dashboard") {
    return "app/dashboard/page.tsx";
  }

  return `app/${route.slice(1)}/page.tsx`;
}

describe("Dashboard activation", () => {
  it("defines exactly 7 primary J10 product areas", () => {
    expect(primaryNavigationItems).toHaveLength(7);
    const expectedPrimaryLabels = [
      "J10 Command Center",
      "J10 Inbox",
      "J10 Lead Center",
      "J10 Booking",
      "J10 Growth",
      "J10 AI Operator",
      "J10 Pay",
    ];
    expect(primaryNavigationItems.map((item) => item.label)).toEqual(
      expectedPrimaryLabels
    );
  });

  it("never presents bare legacy labels or duplicate prefixes", () => {
    const labels = dashboardNavigationItems.map((item) => item.label);
    const bareForbidden = ["Today", "Inbox", "Customers", "Calendar", "Growth", "AI Operator", "Money", "CRM", "Overview"];
    for (const forbidden of bareForbidden) {
      expect(labels).not.toContain(forbidden);
    }

    for (const label of labels) {
      expect(label).not.toContain("J10 NEXUS J10");
      expect(label).not.toContain("J10 J10");
      expect(label).not.toContain("AI AI");
    }
  });

  it("classifies every navigation item as ready or building", () => {
    expect(dashboardNavigationItems.length).toBeGreaterThanOrEqual(12);
    expect(
      dashboardNavigationItems.every(
        (item) =>
          item.status === "ready" ||
          item.status === "building"
      )
    ).toBe(true);
  });

  it("never presents a ready item without a destination", () => {
    const invalidReadyItems =
      dashboardNavigationItems.filter(
        (item) =>
          item.status === "ready" &&
          !item.href
      );
    const dishonestBuildingLinks =
      dashboardNavigationItems.filter(
        (item) =>
          item.status === "building" &&
          item.href
      );

    expect(invalidReadyItems).toEqual([]);
    expect(dishonestBuildingLinks).toEqual([]);
  });

  it("backs every ready route with a Next.js page", () => {
    for (const item of readyDashboardNavigationItems) {
      expect(
        existsSync(
          join(projectRoot, routeFile(item.href))
        ),
        `${item.label} is missing ${routeFile(item.href)}`
      ).toBe(true);
    }
  });

  it("presents the 7 primary canonical routes plus supporting areas", () => {
    const readyHrefs = new Set(
      readyDashboardNavigationItems.map(
        (item) => item.href
      )
    );

    // 7 Primary Products
    expect(readyHrefs.has("/dashboard")).toBe(true);
    expect(readyHrefs.has("/dashboard/inbox")).toBe(true);
    expect(readyHrefs.has("/dashboard/crm")).toBe(true);
    expect(readyHrefs.has("/dashboard/booking")).toBe(true);
    expect(readyHrefs.has("/dashboard/growth")).toBe(true);
    expect(readyHrefs.has("/dashboard/ai-operator")).toBe(true);
    expect(readyHrefs.has("/dashboard/pay")).toBe(true);

    // Supporting Areas
    expect(readyHrefs.has("/dashboard/connections")).toBe(true);
    expect(readyHrefs.has("/dashboard/settings/team")).toBe(true);
    expect(readyHrefs.has("/dashboard/brand")).toBe(true);
    expect(readyHrefs.has("/dashboard/settings/billing")).toBe(true);
    expect(readyHrefs.has("/dashboard/settings")).toBe(true);
  });

  it("offsets the dashboard shell and preserves the immersive flow builder", () => {
    const shell = readProjectFile(
      "components/dashboard/DashboardLayout.tsx"
    );

    expect(shell).toContain('lg:pl-[260px]');
    expect(shell).toContain(
      'pathname === "/dashboard/automation/flow"'
    );
    expect(shell).toContain(
      '"/dashboard/automation/flow/"'
    );
  });

  it("owns dashboard chrome once across integration routes", () => {
    const integrationPage = readProjectFile(
      "app/dashboard/settings/integrations/page.tsx"
    );
    const sandboxPage = readProjectFile(
      "app/dashboard/settings/integrations/sandbox/page.tsx"
    );

    expect(integrationPage).not.toContain(
      "DashboardLayout"
    );
    expect(sandboxPage).not.toContain(
      "DashboardLayout"
    );
  });

  it("connects global search, AI, notifications, profile, and mobile navigation", () => {
    const topbar = readProjectFile(
      "components/dashboard/Topbar.tsx"
    );

    expect(topbar).toContain(
      "readyDashboardNavigationItems"
    );
    expect(topbar).toContain(
      'navigate("/dashboard#j10-ai")'
    );
    expect(topbar).toContain(
      'href="/dashboard/notifications"'
    );
    expect(topbar).toContain(
      'href="/dashboard/settings"'
    );
    expect(topbar).toContain("onOpenNavigation");
  });

  it("scopes live operations data to the active workspace context", () => {
    const activityRoute = readProjectFile(
      "app/api/dashboard/activity/route.ts"
    );
    const notificationsRoute = readProjectFile(
      "app/api/dashboard/notifications/route.ts"
    );

    expect(activityRoute).toContain(
      '.eq("workspace_id", context.workspace.id)'
    );
    expect(activityRoute).toContain(".limit(limit)");
    expect(notificationsRoute).toContain(
      '.from("automation_runs")'
    );
    expect(notificationsRoute).toContain(
      '.eq("workspace_id", context.workspace.id)'
    );
    expect(notificationsRoute).toContain(
      'run.status === "awaiting_approval"'
    );
  });
});
