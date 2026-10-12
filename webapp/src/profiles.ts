import type { UserProfile } from "@mattermost/types/users";

// Use the native Mattermost model, retaining only fields needed by this UI.
export type ViewerProfile = Pick<
  UserProfile,
  "id" | "first_name" | "last_name" | "nickname" | "username" | "delete_at"
>;
const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export function displayName(
  userId: string,
  profile: Partial<ViewerProfile> | undefined,
  setting?: string,
): string {
  const fullName = [clean(profile?.first_name), clean(profile?.last_name)]
    .filter(Boolean)
    .join(" ");
  const nickname = clean(profile?.nickname);
  const username = clean(profile?.username);
  let configured = "";
  switch (setting || "full_name") {
    case "full_name":
      configured = fullName;
      break;
    case "nickname_full_name":
      configured = nickname || fullName;
      break;
    case "username":
      configured = username;
      break;
  }
  return configured || fullName || nickname || username || userId;
}

export function selectProfiles(
  response: unknown,
  requested: string[],
): Record<string, ViewerProfile> {
  const wanted = new Set(requested);
  const profiles: Record<string, ViewerProfile> = {};
  if (!Array.isArray(response)) return profiles;
  for (const item of response) {
    if (!item || typeof item.id !== "string" || !wanted.has(item.id)) continue;
    profiles[item.id] = {
      id: item.id,
      first_name: clean(item.first_name),
      last_name: clean(item.last_name),
      nickname: clean(item.nickname),
      username: clean(item.username),
      delete_at: typeof item.delete_at === "number" ? item.delete_at : 0,
    };
  }
  return profiles;
}
