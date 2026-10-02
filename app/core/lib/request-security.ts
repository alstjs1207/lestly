/** Browser mutation requests must come from this origin, including sibling sites. */
export function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite === "cross-site" || fetchSite === "same-site") return false;

  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin");

  if (origin !== null) {
    // "null" is used by opaque origins such as sandboxed documents.
    return origin === requestOrigin;
  }

  const referer = request.headers.get("Referer");
  if (referer !== null) {
    try {
      return new URL(referer).origin === requestOrigin;
    } catch {
      return false;
    }
  }

  // Header-less server clients remain compatible. Modern browsers provide
  // Fetch Metadata even when their referrer policy suppresses Referer.
  return (
    fetchSite === null || fetchSite === "same-origin" || fetchSite === "none"
  );
}

const invalidRedirectCharacters = /[\\\u0000-\u001f\u007f]/;

/** Normalize local paths without letting browser URL parsing turn them into hosts. */
export function getSafeRedirectPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (
    !value ||
    value !== value.trim() ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    invalidRedirectCharacters.test(value)
  ) {
    return fallback;
  }

  try {
    const target = new URL(value, "https://redirect.invalid");
    if (
      target.origin !== "https://redirect.invalid" ||
      target.pathname.startsWith("//")
    ) {
      return fallback;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

/** Email callbacks may be absolute URLs, but must stay on the configured site. */
export function getSafeEmailRedirect(
  value: string | null | undefined,
  siteUrl: string,
  fallbackPath: string,
): string {
  const siteOrigin = new URL(siteUrl).origin;
  const fallback = new URL(fallbackPath, siteOrigin).toString();
  if (
    !value ||
    value !== value.trim() ||
    invalidRedirectCharacters.test(value)
  ) {
    return fallback;
  }

  try {
    const target = new URL(value, siteOrigin);
    if (
      target.origin !== siteOrigin ||
      target.username ||
      target.password ||
      target.pathname.startsWith("//")
    ) {
      return fallback;
    }
    return target.toString();
  } catch {
    return fallback;
  }
}
