"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SelectField, type Opt } from "@/components/select-field";
import { addMember, updateMemberRole, removeMember } from "@/lib/actions/members";

export type MemberRow = {
  id: string;
  role: string;
  joined: string;
  userId: string;
  name: string | null;
  email: string;
};

const ROLE_OPTIONS: Opt[] = [
  { value: "admin", label: "Admin" },
  { value: "lead", label: "Lead" },
  { value: "tester", label: "Tester" },
  { value: "viewer", label: "Viewer" },
];

const ROLE_HINT: Record<string, string> = {
  admin: "Manage members, delete anything",
  lead: "Author cases, suites & cycles, import",
  tester: "Record execution results",
  viewer: "Read-only",
};

export function MembersPanel({
  projectId,
  canManage,
  currentUserId,
  members,
}: {
  projectId: string;
  canManage: boolean;
  currentUserId: string;
  members: MemberRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState("tester");

  function run(action: () => Promise<{ ok?: true; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if ("error" in res && res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {canManage && (
        <form
          className="card mb-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            run(() => addMember(projectId, email, newRole));
            setEmail("");
          }}
        >
          <h2 className="mb-3 text-sm font-semibold text-muted">Add member</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              required
              className="field flex-1"
            />
            <div className="w-36">
              <SelectField
                value={newRole}
                options={ROLE_OPTIONS}
                onChange={(v) => v && setNewRole(v)}
                allowClear={false}
                bordered
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-fg px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add"}
            </button>
          </div>
          <p className="mt-2 text-xs text-subtle">
            The person must have signed in to Apollo at least once.
          </p>
        </form>
      )}

      {error && (
        <p className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">Member</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Joined</th>
              {canManage && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-line/50 last:border-0">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-fg">
                    {m.name || m.email}
                    {m.userId === currentUserId && (
                      <span className="ml-2 text-xs text-subtle">(you)</span>
                    )}
                  </div>
                  {m.name && <div className="text-xs text-muted">{m.email}</div>}
                </td>
                <td className="px-4 py-2.5">
                  {canManage ? (
                    <div className="w-32" title={ROLE_HINT[m.role]}>
                      <SelectField
                        value={m.role}
                        options={ROLE_OPTIONS}
                        onChange={(v) => {
                          if (v && v !== m.role)
                            run(() => updateMemberRole(projectId, m.id, v));
                        }}
                        allowClear={false}
                      />
                    </div>
                  ) : (
                    <span title={ROLE_HINT[m.role]} className="text-fg">
                      {ROLE_OPTIONS.find((o) => o.value === m.role)?.label ?? m.role}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted">
                  {new Date(m.joined).toLocaleDateString()}
                </td>
                {canManage && (
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${m.name || m.email} from this project?`))
                          run(() => removeMember(projectId, m.id));
                      }}
                      disabled={pending}
                      className="text-xs text-subtle transition-colors hover:text-red-500 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
