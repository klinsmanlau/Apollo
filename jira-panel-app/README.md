# Apollo Jira issue panel

Forge app. Shows a Jira issue's linked Apollo test executions (case, status,
cycle, project) directly on the issue view, with a link back into Apollo.
Calls Apollo's `GET /api/jira-panel/executions?issueKey=...` — see that route
in the main Apollo repo.

## One-time setup

```bash
npm install -g @forge/cli
forge login                 # opens a browser — needs an Atlassian account
                             # with developer access to your Jira site
cd jira-panel-app
npm install
forge register apollo-jira-panel   # fills in `app.id` in manifest.yml
```

## Point it at Apollo

`forge tunnel` runs this app's resolver **on your machine**, so in principle
it could reach `next dev` directly — but Forge's egress allowlist
(`permissions.external.fetch.backend` in manifest.yml) only accepts real
HTTPS domains, not `localhost`. So local dev still needs a lightweight tunnel
in front of Apollo:

```bash
# in a separate terminal, with `next dev` already running on :3000
ngrok http 3000
# copy the https://<random>.ngrok-free.app URL it prints
```

Then, back in `jira-panel-app/`:

```bash
forge variables set --environment development APOLLO_BASE_URL https://<random>.ngrok-free.app
forge variables set --environment development APOLLO_PANEL_SECRET <same value as Apollo's .env JIRA_PANEL_SECRET>
forge tunnel
```

manifest.yml's `external.fetch.backend` already allows `*.ngrok-free.app` —
no edit needed unless ngrok gives you a different domain (paid/custom
domains use a different suffix; update the entry to match). Open any Jira
issue in your site while the tunnel is running to see the panel. Note the
ngrok URL changes every time you restart ngrok on the free tier, so you'll
re-run the `APOLLO_BASE_URL` variable command each session.

Once you're ready to actually use this day-to-day (not just testing), Apollo
needs a public URL (e.g. deployed on Vercel), because `forge deploy` runs the
resolver in Atlassian's cloud, which can't reach your laptop:

```bash
forge variables set --environment production APOLLO_BASE_URL https://<your-deployed-apollo-domain>
forge variables set --environment production APOLLO_PANEL_SECRET <same value as Apollo's .env JIRA_PANEL_SECRET>
forge deploy --environment production
forge install                       # pick your Jira site, confirm scopes
```

## Notes

- `manifest.yml`'s `permissions.external.fetch.backend` must list whatever
  host `APOLLO_BASE_URL` points at (localhost during tunnel testing, your
  real domain for production) or Forge blocks the fetch.
- The panel is read-only — it never writes to Apollo or Jira.
- `@forge/react` (UI Kit 2) component APIs shift between Forge CLI versions;
  if `forge tunnel` errors on an unknown prop in `src/frontend/index.jsx`,
  check the current UI Kit component reference in Forge's docs and adjust.
