/** Routes die alleen toegankelijk zijn voor ingelogde gebruikers. */
export const PROTECTED_PATH_PREFIXES = ["/dashboard"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
