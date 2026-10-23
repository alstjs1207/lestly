export interface ReflectionEntry {
  text: string;
  updatedAt: string;
}
export type ReflectionEntries = Record<string, ReflectionEntry>;
export const reflectionStorageKey = (profileId: string) =>
  `lestly:reflections:v1:${profileId}`;

export function parseReflections(raw: string | null): ReflectionEntries {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([day, value]) =>
          /^\d{4}-\d{2}-\d{2}$/.test(day) &&
          value &&
          typeof value === "object" &&
          typeof value.text === "string" &&
          value.text.length <= 500 &&
          typeof value.updatedAt === "string",
      ),
    );
  } catch {
    return {};
  }
}
