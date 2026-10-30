export const metadata = { title: "Admin" };

/**
 * Admin route group. The middleware redirects unauthenticated requests to
 * /admin/login; pages inside also verify the session server-side (never trust
 * the client, §9).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-surface">{children}</div>;
}
