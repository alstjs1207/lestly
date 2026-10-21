type SiteEnvironment = {
  [key: string]: string | undefined;
  SITE_URL?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
};

/** PKCE's verifier cookie and the callback must stay on the same deployment. */
export function getSiteOrigin(request: Request, env: SiteEnvironment) {
  const requestOrigin = new URL(request.url).origin;
  if (env.VERCEL_ENV === "preview" || env.NODE_ENV === "development") {
    return requestOrigin;
  }
  return env.SITE_URL ? new URL(env.SITE_URL).origin : requestOrigin;
}
