import Resolver from "@forge/resolver";
import { fetch } from "@forge/api";

const resolver = new Resolver();

// Called by the panel's frontend (src/frontend/index.jsx) on load. Looks up
// this issue's linked Apollo executions via Apollo's own API — see
// src/app/api/jira-panel/executions/route.ts in the Apollo repo.
resolver.define("getExecutions", async ({ context }) => {
  const issueKey = context.extension.issue.key;
  const baseUrl = process.env.APOLLO_BASE_URL;
  const secret = process.env.APOLLO_PANEL_SECRET;
  if (!baseUrl || !secret) {
    throw new Error(
      "APOLLO_BASE_URL / APOLLO_PANEL_SECRET not set — run `forge variables set`"
    );
  }

  const res = await fetch(
    `${baseUrl}/api/jira-panel/executions?issueKey=${encodeURIComponent(issueKey)}`,
    { headers: { "X-Apollo-Panel-Secret": secret } }
  );
  if (!res.ok) {
    throw new Error(`Apollo API returned ${res.status}`);
  }
  return res.json();
});

export const handler = resolver.getDefinitions();
