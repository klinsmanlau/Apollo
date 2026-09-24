# Apollo Public Read API (v1)

A read-only HTTP API for external integrations (dashboards, reporting tools) to
crawl Apollo test data. It is versioned and stable: response fields are an
explicit allow-list, so internal schema changes will not silently break you.

- **Base path:** `/api/v1`
- **Auth:** per-client API key, `Authorization: Bearer <key>`
- **Format:** JSON, UTF-8
- **Methods:** `GET` only (read-only)

> This is machine-to-machine auth and is independent of Apollo's human login
> (Clerk / SSO). Keys are issued and revoked separately.

---

## Authentication

Every request must send a valid key:

```
Authorization: Bearer apollo_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are:

- **Scoped** — each key grants specific scopes (e.g. `cases:read`,
  `executions:read`). A request for an endpoint whose scope the key lacks
  returns `403`.
- **Project-scoped (optional)** — a key may be locked to a single project. A
  request for a different project returns `403`. Keys with no project scope may
  read any project.
- **Revocable** — a revoked key returns `401`.

Keys are stored only as a SHA-256 hash; the raw value is shown once at creation
and cannot be recovered. Rotate a key by minting a new one and revoking the old.

### Errors

| Status | Meaning |
|--------|---------|
| `200`  | OK |
| `401`  | Missing, malformed, invalid, or revoked key |
| `403`  | Valid key, but it lacks the required scope or project |
| `404`  | Unknown route |
| `500`  | Server error |

Error body:

```json
{ "error": "API key lacks scope \"executions:read\"" }
```

---

## Conventions

### Pagination

Offset-based. All list endpoints accept:

| Param      | Type | Default | Notes |
|------------|------|---------|-------|
| `page`     | int  | `0`     | Zero-based page index |
| `pageSize` | int  | `50`    | Clamped to `1..200` |

and return an envelope:

```json
{
  "data": [ /* rows */ ],
  "page": 0,
  "pageSize": 50,
  "total": 1234,
  "hasMore": true
}
```

Iterate by incrementing `page` while `hasMore` is `true`.

### Incremental crawl

List endpoints are ordered by `updatedAt` ascending and accept an
`updatedSince` filter (ISO-8601). Store the max `updatedAt` you have seen and
pass it back next run to fetch only what changed:

```
?updatedSince=2026-09-24T00:00:00Z
```

---

## Endpoints

### List test cases

```
GET /api/v1/projects/{projectId}/cases
```

Scope: `cases:read`

| Query param       | Type   | Notes |
|-------------------|--------|-------|
| `page`            | int    | see Pagination |
| `pageSize`        | int    | see Pagination |
| `updatedSince`    | ISO-8601 | only cases updated at/after this time |
| `includeArchived` | `0`/`1` | default `0` (archived cases hidden) |

**Example**

```bash
curl -s \
  -H "Authorization: Bearer $APOLLO_API_KEY" \
  "https://<apollo-host>/api/v1/projects/$PROJECT_ID/cases?pageSize=100&updatedSince=2026-09-01T00:00:00Z"
```

**Row shape**

```json
{
  "key": "TS-T7060",
  "title": "Add card to Google Wallet",
  "priority": "high",
  "type": "functional",
  "status": "approved",
  "component": "Cards",
  "owner": "Alex Ong",
  "tags": ["regression", "wallet"],
  "coverage": ["PODCC-456"],
  "estimatedTimeSeconds": 300,
  "archived": false,
  "updatedAt": "2026-09-20T08:15:00.000Z"
}
```

- `priority`: `high | medium | low`
- `type`: `functional | regression | smoke | integration | performance | security | usability`
- `status` (case lifecycle): `draft | approved | deprecated`

---

### List cycles (with status counts)

```
GET /api/v1/projects/{projectId}/cycles
```

Scope: `cycles:read`

Cycles **newest-first** (by `keyNum` descending — higher cycle key = newer), so
`data[0]` is the **latest cycle**. Each row includes its dates (so you can map
cycles to your own sprint windows) and per-status execution `counts`.

| Query param    | Type     | Notes |
|----------------|----------|-------|
| `page`         | int      | see Pagination |
| `pageSize`     | int      | see Pagination |
| `updatedSince` | ISO-8601 | only cycles updated at/after this time |
| `folderId`     | string   | limit to one cycle folder |

**Example — the latest cycle and its pass-rate:**

```bash
curl -s -H "Authorization: Bearer $APOLLO_API_KEY" \
  "https://<apollo-host>/api/v1/projects/$PROJECT_ID/cycles?pageSize=1"
# -> data[0] is the latest cycle
```

**Row shape**

```json
{
  "key": "TS-R96",
  "keyNum": 96,
  "name": "Cards Regression — Sprint 42",
  "status": "in_progress",
  "environment": "staging",
  "version": "RC-42",
  "folder": { "id": "cf_123", "name": "Regression" },
  "folderPath": ["Automated", "Android", "Regression"],
  "startDate": "2026-09-22T00:00:00.000Z",
  "endDate": "2026-09-26T00:00:00.000Z",
  "createdAt": "2026-09-22T02:00:00.000Z",
  "updatedAt": "2026-09-24T04:15:02.000Z",
  "counts": {
    "total": 207,
    "not_executed": 12,
    "in_progress": 0,
    "pass": 180,
    "pass_auto": 8,
    "fail": 5,
    "blocked": 2
  },
  "executed": 195,
  "passed": 188,
  "passRate": 96.4
}
```

`executed` = total − `not_executed` − `in_progress`. `passed` = `pass` +
`pass_auto`. `passRate` = `passed / executed` as a percentage (one decimal), or
`null` when nothing has been executed. `status` (cycle-level) is Apollo's
`CycleStatus`.

`folder` is the cycle's immediate folder (or `null`); `folderPath` is the full
ancestor chain of folder names, root → leaf (or `null` when the cycle has no
folder). Use `folderPath` to classify a cycle by its hierarchy (e.g. detect
"Automated" / "Android" / "Regression" anywhere in the path).

> **Getting the latest cycle's results:** call this endpoint, take `data[0].key`,
> then call the executions endpoint with `?cycleKey=<that key>`. Or read the
> `counts` here directly if per-cycle totals are all you need.

---

### List executions (the results feed)

```
GET /api/v1/projects/{projectId}/executions
```

Scope: `executions:read`

One row per (cycle, case) — this is the endpoint a dashboard crawls to compute
coverage, pass-rates, and release readiness.

| Query param    | Type     | Notes |
|----------------|----------|-------|
| `page`         | int      | see Pagination |
| `pageSize`     | int      | see Pagination |
| `updatedSince` | ISO-8601 | only executions updated at/after this time |
| `status`       | csv      | filter by status, e.g. `pass,pass_auto` |
| `cycleKey`     | string   | limit to one cycle, e.g. `TS-R96` |

**Example — everything that changed today, only pass/fail:**

```bash
curl -s \
  -H "Authorization: Bearer $APOLLO_API_KEY" \
  "https://<apollo-host>/api/v1/projects/$PROJECT_ID/executions?status=pass,pass_auto,fail&updatedSince=2026-09-24T00:00:00Z"
```

**Row shape**

```json
{
  "caseKey": "TS-T7060",
  "caseTitle": "Add card to Google Wallet",
  "casePriority": "high",
  "cycleKey": "TS-R96",
  "cycleName": "Cards Regression — Sprint 42",
  "status": "pass",
  "environment": "staging",
  "executedBy": "Alex Ong",
  "executedAt": "2026-09-24T04:15:00.000Z",
  "assignedTo": "Alex Ong",
  "actualTimeSeconds": 255,
  "defectRef": null,
  "caseVersionNo": 3,
  "updatedAt": "2026-09-24T04:15:02.000Z"
}
```

**`status` values** (Apollo `ExecutionStatus`):

| Value          | Meaning |
|----------------|---------|
| `not_executed` | Not run yet |
| `in_progress`  | Being executed |
| `pass`         | Passed (manual) |
| `pass_auto`    | Passed via automation (DeviceCloud) — Zephyr "Passed [A]" |
| `fail`         | Failed |
| `blocked`      | Blocked |

`executedBy` / `assignedTo` are display names (falling back to email).
`caseVersionNo` is the test-case version this execution was recorded against
(may be `null` for legacy rows).

---

## Managing keys

Mint a key (raw value printed once):

```bash
npm run apikey:create -- \
  --name "qa-dashboard (prod)" \
  --scopes cases:read,executions:read \
  --project <projectId>
```

Omit `--project` for an all-projects key. Valid scopes: `cases:read`,
`executions:read`, `cycles:read`.

**Revoke** a key by setting `revokedAt` on its `ApiKey` row (e.g. via
`prisma studio` or a DB update). Revoked keys immediately return `401`.

---

## Versioning & stability

- The path is versioned (`/api/v1`). Breaking changes ship under a new version
  (`/api/v2`); `v1` fields will not be removed or repurposed.
- New optional fields may be added to responses over time — parse defensively
  and ignore unknown fields.

## Notes & limits

- `pageSize` is capped at 200.
- Rate limiting is not yet enforced — be a considerate crawler (paginate,
  use `updatedSince`, avoid tight polling loops).
- The API is read-only; there are no write endpoints.
