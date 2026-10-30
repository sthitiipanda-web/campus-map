import type { AdminRole } from "@/types/next-auth";

/** editor (draft edits) < admin (publish) < super-admin (manage users) — §9. */
const ROLE_RANK: Record<AdminRole, number> = {
  editor: 1,
  admin: 2,
  "super-admin": 3,
};

export function hasRole(actual: AdminRole | undefined, required: AdminRole): boolean {
  if (!actual) return false;
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}
