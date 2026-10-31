import {
  LIMITS,
  PLATFORMS,
  isPlatform,
  normalizeGameName,
  sanitizeGameName,
  sanitizePickedAvatar,
  sanitizeUsername,
  uniqueGameNames,
  type GameTag,
  type LinkedIdentity,
  type MyProfile,
  type Platform,
  type ProfileCard,
  type ProfileUpdate,
  type SteamAccount,
  type Subscription,
} from "@unishare/shared";
import { badRequest } from "./errors";

export interface UserRow {
  uid: string;
  username: string | null;
  avatar_url: string | null;
  status: string | null;
  platforms: string[];
  platform_games: Record<string, string[]>;
  games: string[];
  wanted_games: string[];
  game_metadata: Record<string, GameTag>;
  skills: string[];
  skills_description: string | null;
  has_skills_profile: boolean;
  subscriptions: Subscription[];
  language: string;
  allow_direct_contact: boolean;
  onboarding_complete: boolean;
  is_online: boolean;
  last_seen: string | null;
  rating: number;
  review_count: number;
  account_state: string;
  /** Added by migration 004_admin.sql. */
  is_admin?: boolean;
  created_at: string;
  updated_at: string;
  providers?: string[] | null;
}

export interface IdentityRow {
  provider: string;
  provider_user_id: string;
  username: string | null;
  display_name: string | null;
  photo_url: string | null;
  can_message: boolean;
}

/** Selects a user row plus the list of linked providers (for platform icons). */
export const USER_COLUMNS = `u.*,
  array(select i.provider from user_identities i where i.user_id = u.uid and i.provider not in ('dev', 'steam') order by i.provider) as providers`;

export function identityUrl(identity: Pick<IdentityRow, "provider" | "provider_user_id" | "username">): string | null {
  if (identity.provider === "telegram") return identity.username ? `https://t.me/${identity.username}` : null;
  if (identity.provider === "vk") return `https://vk.com/id${identity.provider_user_id}`;
  return null;
}

export function toLinkedIdentities(rows: IdentityRow[]): LinkedIdentity[] {
  return rows
    .filter((row) => row.provider === "telegram" || row.provider === "vk")
    .map((row) => ({
      provider: row.provider as "telegram" | "vk",
      username: row.username,
      displayName: row.display_name,
      url: identityUrl(row),
      canMessage: row.can_message,
    }));
}

function toSteamAccount(rows: IdentityRow[]): SteamAccount | null {
  const steam = rows.find((row) => row.provider === "steam");
  if (!steam) return null;
  return {
    steamId: steam.provider_user_id,
    personaName: steam.display_name,
    avatarUrl: steam.photo_url,
    profileUrl: `https://steamcommunity.com/profiles/${steam.provider_user_id}`,
  };
}

function platformsOf(row: UserRow): Platform[] {
  return (row.platforms ?? []).filter(isPlatform);
}

export function toMyProfile(row: UserRow, identities: IdentityRow[]): MyProfile {
  const platformGames: Partial<Record<Platform, string[]>> = {};
  for (const [platform, games] of Object.entries(row.platform_games ?? {})) {
    if (isPlatform(platform)) platformGames[platform] = games;
  }
  const withPhoto = identities.find((identity) => identity.photo_url);
  return {
    uid: row.uid,
    username: row.username,
    avatarUrl: row.avatar_url,
    status: row.status,
    platforms: platformsOf(row),
    platformGames,
    games: row.games ?? [],
    wantedGames: row.wanted_games ?? [],
    gameMetadata: row.game_metadata ?? {},
    skills: row.skills ?? [],
    skillsDescription: row.skills_description,
    hasSkillsProfile: row.has_skills_profile,
    subscriptions: row.subscriptions ?? [],
    language: row.language,
    allowDirectContact: row.allow_direct_contact,
    onboardingComplete: row.onboarding_complete,
    rating: row.rating,
    reviewCount: row.review_count,
    createdAt: row.created_at,
    identities: toLinkedIdentities(identities),
    isAdmin: Boolean(row.is_admin),
    steam: toSteamAccount(identities),
    suggestions: row.onboarding_complete
      ? undefined
      : {
          username: identities.find((identity) => identity.username)?.username ?? null,
          avatarUrl: withPhoto?.photo_url ?? null,
        },
  };
}

export function toProfileCard(row: UserRow): ProfileCard {
  const metadata = row.game_metadata ?? {};
  const tag = (name: string): GameTag => {
    const known = metadata[normalizeGameName(name)];
    return { name, coverUrl: known?.coverUrl ?? null, rawgId: known?.rawgId ?? null, steamAppId: known?.steamAppId ?? null };
  };
  const platforms = platformsOf(row);
  const platformGames: Partial<Record<Platform, GameTag[]>> = {};
  for (const platform of platforms) {
    const games = row.platform_games?.[platform];
    if (games?.length) platformGames[platform] = games.map(tag);
  }
  return {
    uid: row.uid,
    username: row.username ?? "player",
    avatarUrl: row.avatar_url,
    status: row.status,
    platforms,
    platformGames,
    games: (row.games ?? []).slice(0, 30).map(tag),
    wantedGames: (row.wanted_games ?? []).slice(0, 30).map(tag),
    skills: row.skills ?? [],
    skillsDescription: row.skills_description,
    subscriptions: row.subscriptions ?? [],
    rating: row.rating,
    reviewCount: row.review_count,
    isOnline: row.is_online,
    lastSeen: row.last_seen,
    providers: (row.providers ?? []).filter((p): p is "telegram" | "vk" => p === "telegram" || p === "vk"),
  };
}

// ── Update sanitization ─────────────────────────────────────────────────────

function optionalText(value: unknown, max: number, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw badRequest(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw badRequest(`${field} is too long`, `${field}_too_long`);
  return trimmed || null;
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return value.startsWith("/media/") ? value : null;
  }
}

function sanitizeSubscriptions(value: unknown): Subscription[] {
  if (!Array.isArray(value)) throw badRequest("subscriptions must be an array");
  return value.slice(0, LIMITS.subscriptions).flatMap((item): Subscription[] => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 60) : "";
    if (!name) return [];
    const date = (input: unknown) =>
      typeof input === "string" && !Number.isNaN(Date.parse(input)) ? new Date(input).toISOString() : null;
    return [{
      id: typeof raw.id === "string" ? raw.id.slice(0, 64) : crypto.randomUUID(),
      name,
      planName: typeof raw.planName === "string" ? raw.planName.slice(0, 60) : null,
      billingCycleId: typeof raw.billingCycleId === "string" ? raw.billingCycleId.slice(0, 8) : null,
      startedAt: date(raw.startedAt),
      expiresAt: date(raw.expiresAt),
      autoRenew: typeof raw.autoRenew === "boolean" ? raw.autoRenew : null,
    }];
  });
}

function sanitizeMetadata(value: unknown): Record<string, GameTag> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest("gameMetadata must be an object");
  const result: Record<string, GameTag> = {};
  for (const raw of Object.values(value as Record<string, unknown>).slice(0, 300)) {
    if (!raw || typeof raw !== "object") continue;
    const tag = raw as Record<string, unknown>;
    const name = typeof tag.name === "string" ? sanitizeGameName(tag.name) : null;
    if (!name) continue;
    result[normalizeGameName(name)] = {
      name,
      coverUrl: httpsUrl(tag.coverUrl),
      rawgId: Number.isSafeInteger(tag.rawgId) ? Number(tag.rawgId) : null,
      steamAppId: Number.isSafeInteger(tag.steamAppId) && Number(tag.steamAppId) > 0 ? Number(tag.steamAppId) : null,
    };
  }
  return result;
}

/**
 * An avatar a profile patch may set: none, a preset or game art (the rule of POST /api/me/avatar/pick),
 * or a photo the account owns (routes/avatar.ts ownAvatarMatcher). Anything else is refused, not dropped.
 */
function avatarColumn(value: unknown, isOwnAvatar: (url: string) => boolean): string | null {
  if (value === null) return null;
  const picked = sanitizePickedAvatar(value);
  if (picked) return picked;
  if (typeof value === "string" && isOwnAvatar(value)) return value;
  throw badRequest("Pick a UniShare avatar, game art or your own photo", "invalid_avatar");
}

/** Validates a profile patch and converts it into column → value pairs. */
export function profileUpdateToColumns(update: ProfileUpdate, isOwnAvatar: (url: string) => boolean = () => false): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  if (update.username !== undefined) {
    const username = typeof update.username === "string" ? sanitizeUsername(update.username) : null;
    if (!username) throw badRequest("Username must contain 3–30 letters, digits, '_', '.' or '-'", "invalid_username");
    columns.username = username;
  }
  if (update.avatarUrl !== undefined) columns.avatar_url = avatarColumn(update.avatarUrl, isOwnAvatar);
  if (update.status !== undefined) columns.status = optionalText(update.status, LIMITS.statusMax, "status");
  if (update.platforms !== undefined) {
    if (!Array.isArray(update.platforms)) throw badRequest("platforms must be an array");
    columns.platforms = PLATFORMS.filter((platform) => update.platforms!.includes(platform));
  }
  if (update.platformGames !== undefined) {
    if (!update.platformGames || typeof update.platformGames !== "object") throw badRequest("platformGames must be an object");
    const platformGames: Record<string, string[]> = {};
    for (const [platform, games] of Object.entries(update.platformGames)) {
      if (!isPlatform(platform) || !Array.isArray(games)) continue;
      const names = uniqueGameNames(games.filter((g): g is string => typeof g === "string")).slice(0, LIMITS.gamesPerPlatform);
      if (names.length) platformGames[platform] = names;
    }
    columns.platform_games = JSON.stringify(platformGames);
    columns.games = uniqueGameNames(Object.values(platformGames).flat());
  }
  if (update.wantedGames !== undefined) {
    if (!Array.isArray(update.wantedGames)) throw badRequest("wantedGames must be an array");
    columns.wanted_games = uniqueGameNames(update.wantedGames.filter((g): g is string => typeof g === "string")).slice(0, LIMITS.wantedGames);
  }
  if (update.gameMetadata !== undefined) columns.game_metadata = JSON.stringify(sanitizeMetadata(update.gameMetadata));
  if (update.skills !== undefined) {
    if (!Array.isArray(update.skills)) throw badRequest("skills must be an array");
    const seen = new Set<string>();
    columns.skills = update.skills
      .filter((skill): skill is string => typeof skill === "string")
      .map((skill) => skill.trim().slice(0, 40))
      .filter((skill) => skill.length >= 2 && !seen.has(skill.toLowerCase()) && seen.add(skill.toLowerCase()))
      .slice(0, LIMITS.skills);
  }
  if (update.skillsDescription !== undefined) {
    columns.skills_description = optionalText(update.skillsDescription, LIMITS.skillsDescriptionMax, "skillsDescription");
  }
  if (update.hasSkillsProfile !== undefined) columns.has_skills_profile = Boolean(update.hasSkillsProfile);
  if (update.subscriptions !== undefined) columns.subscriptions = JSON.stringify(sanitizeSubscriptions(update.subscriptions));
  if (update.language !== undefined) {
    if (!["ru", "en", "uk", "be"].includes(String(update.language))) throw badRequest("Unsupported language");
    columns.language = update.language;
  }
  if (update.allowDirectContact !== undefined) columns.allow_direct_contact = Boolean(update.allowDirectContact);
  if (update.onboardingComplete !== undefined) columns.onboarding_complete = Boolean(update.onboardingComplete);
  return columns;
}
