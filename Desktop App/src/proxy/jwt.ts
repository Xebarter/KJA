/** Decode a JWT payload without verifying — the upstream still authenticates. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function userIdFromAuthHeader(authorization: string | undefined | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) return null;
  const payload = decodeJwtPayload(match[1]);
  if (!payload) return null;
  const sub = payload.sub;
  return typeof sub === "string" && sub ? sub : null;
}

export function accessExpFromAuthHeader(authorization: string | undefined | null): number | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) return null;
  const payload = decodeJwtPayload(match[1]);
  if (!payload || typeof payload.exp !== "number") return null;
  return payload.exp;
}

export function isServiceRoleRequest(
  authorization: string | undefined | null,
  serviceRoleKey: string | undefined,
): boolean {
  if (!authorization || !serviceRoleKey) return false;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) return false;
  return match[1] === serviceRoleKey;
}
