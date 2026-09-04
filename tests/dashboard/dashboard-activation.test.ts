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
  readyDashboardNavigationItems,
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
  it("classifies every navigation item as ready or building", () => {
    expect(dashboardNavigationItems).toHaveLength(20);
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
    expect(readyDashboardNavigationItems).toHaveLength(17);
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

  it("activates the CEO-requested operational routes", () => {
    const readyHrefs = new Set(
      readyDashboardNavigationItems.map(
        (item) => item.href
      )
    );

    expect(readyHrefs.size).toBe(17);
    expect(readyHrefs.has("/dashboard/activity")).toBe(true);
    expect(
      readyHrefs.has("/dashboard/notifications")
    ).toBe(true);
    expect(readyHrefs.has("/dashboard/crm")).toBe(true);
    expect(
      readyHrefs.has("/dashboard/whatsapp")
    ).toBe(true);
    expect(
      readyHrefs.has("/dashboard/analytics")
    ).toBe(true);
    expect(
      readyHrefs.has(
        "/dashboard/settings/integrations"
      )
    ).toBe(true);
    expect(readyHrefs.has("/dashboard/website")).toBe(true);
    expect(readyHrefs.has("/dashboard/marketing")).toBe(true);
    expect(readyHrefs.has("/dashboard/knowledge")).toBe(true);
    expect(readyHrefs.has("/dashboard/finance")).toBe(true);
    expect(readyHrefs.has("/dashboard/hr")).toBe(true);
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

  it("scopes live operations data to the signed-in user", () => {
    const activityRoute = readProjectFile(
      "app/api/dashboard/activity/route.ts"
    );
    const notificationsRoute = readProjectFile(
      "app/api/dashboard/notifications/route.ts"
    );

    expect(activityRoute).toContain(
      '.eq("user_id", user.id)'
    );
    expect(activityRoute).toContain(".limit(limit)");
    expect(notificationsRoute).toContain(
      '.from("automation_runs")'
    );
    expect(notificationsRoute).toContain(
      '.eq("user_id", user.id)'
    );
    expect(notificationsRoute).toContain(
      'run.status === "awaiting_approval"'
    );
  });
});
