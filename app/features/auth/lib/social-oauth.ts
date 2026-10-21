export function getSocialOAuthOptions(provider: string) {
  // Supabase appends options.scopes to Kakao's defaults (including email).
  // Forward the provider's singular scope parameter to replace that list.
  // Kakao expects comma-separated consent item IDs.
  return provider === "kakao"
    ? { queryParams: { scope: "profile_nickname,profile_image" } }
    : {};
}
