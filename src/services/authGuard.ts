import admin from "firebase-admin";

/**
 * Server-side role check backed by a verified Firebase ID token.
 *
 * Token path : Authorization: Bearer <Firebase ID token>. The role comes from
 *              Firestore users/{uid}.role (same source the Firestore rules use),
 *              or ADMIN_EMAILS (comma separated, verified e-mails) => admin.
 *
 * Legacy path: the old behaviour (role sent in the request body/query). It is
 *              still accepted so the live site keeps working while clients are
 *              updated, UNLESS enforcement is on:
 *                - strict = true (used by the new Order Alert endpoints), or
 *                - env ENFORCE_ADMIN_TOKEN=true (flip this when you are ready).
 */
export type GuardResult =
  | { ok: true; role: string; via: "token" | "legacy" }
  | { ok: false; status: number; error: string };

// Overridable for tests only
let verifyToken: (t: string) => Promise<any> = (t) => admin.auth().verifyIdToken(t);
export const __setTokenVerifier = (fn: (t: string) => Promise<any>) => { verifyToken = fn; };

const warned = new Set<string>();
const warnOnce = (k: string, msg: string) => {
  if (warned.has(k)) return;
  warned.add(k);
  console.warn(`[AuthGuard] ${msg}`);
};

async function roleFromToken(req: any, db: any): Promise<{ role: string; error?: string } | null> {
  const header = String(req.headers?.authorization || "");
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  try {
    const decoded = await verifyToken(header.slice(7).trim());
    const adminEmails = String(process.env.ADMIN_EMAILS || "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (decoded.email && decoded.email_verified && adminEmails.includes(decoded.email.toLowerCase())) {
      return { role: "admin" };
    }
    const snap = await db.collection("users").doc(decoded.uid).get();
    const role = snap.exists ? String(snap.data()?.role || "").toLowerCase().trim() : "";
    return { role };
  } catch (e: any) {
    return { role: "", error: "Invalid or expired login token" };
  }
}

export async function authorizeRequest(
  req: any,
  db: any,
  allowedRoles: string[],
  opts: { strict?: boolean } = {},
): Promise<GuardResult> {
  const enforce = !!opts.strict || String(process.env.ENFORCE_ADMIN_TOKEN || "").toLowerCase() === "true";
  const tokenInfo = await roleFromToken(req, db);

  if (tokenInfo && !tokenInfo.error && allowedRoles.includes(tokenInfo.role)) {
    return { ok: true, role: tokenInfo.role, via: "token" };
  }

  if (enforce) {
    if (!tokenInfo) return { ok: false, status: 401, error: "Login token required" };
    if (tokenInfo.error) return { ok: false, status: 401, error: tokenInfo.error };
    return {
      ok: false,
      status: 403,
      error: `Not allowed for role "${tokenInfo.role || "unknown"}" (needs: ${allowedRoles.join("/")})`,
    };
  }

  // Not enforcing yet: fall back to the legacy client-supplied role.
  const legacyRole = String(req.body?.requesterRole ?? req.query?.requesterRole ?? "").toLowerCase().trim();
  if (allowedRoles.includes(legacyRole)) {
    warnOnce(
      `${req.path}`,
      `${req.path}: accepted via legacy client-supplied role (${tokenInfo ? "token role mismatch/invalid" : "no token"}). Set ENFORCE_ADMIN_TOKEN=true once tokens verify.`,
    );
    return { ok: true, role: legacyRole, via: "legacy" };
  }
  return { ok: false, status: 403, error: "Unauthorized" };
}
