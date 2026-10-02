/** Authorize privileged workers independently of the Edge gateway's JWT check. */
export function isWorkerAuthorized(
  request: Request,
  secret: string | undefined,
  bearerOnly = false,
): boolean {
  if (!secret?.trim()) return false;
  const authorization = request.headers.get("Authorization");
  if (!authorization) return false;
  const provided = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : bearerOnly
      ? ""
      : authorization;
  if (provided.length !== secret.length) return false;
  let difference = 0;
  for (let index = 0; index < secret.length; index++) {
    difference |= provided.charCodeAt(index) ^ secret.charCodeAt(index);
  }
  return difference === 0;
}
