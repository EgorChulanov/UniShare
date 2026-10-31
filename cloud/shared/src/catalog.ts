// Product catalog shared by the API server and every client (Telegram, VK, web,
// future native shells). Mirrors UniShare/Models/ProfileModels.swift.

export const PLATFORMS = ["Steam", "Epic Games", "Nintendo", "PlayStation", "Xbox", "PC", "Mobile"] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface PlatformInfo {
  id: Platform;
  color: string;
  /** File name in web/public/brands, null when a generic glyph is used. */
  brand: string | null;
}

export const PLATFORM_INFO: Record<Platform, PlatformInfo> = {
  Steam: { id: "Steam", color: "#1B2838", brand: "steam.svg" },
  "Epic Games": { id: "Epic Games", color: "#313131", brand: "epicgames.svg" },
  Nintendo: { id: "Nintendo", color: "#E60012", brand: "nintendo-switch.svg" },
  PlayStation: { id: "PlayStation", color: "#003791", brand: "playstation.svg" },
  Xbox: { id: "Xbox", color: "#107C10", brand: "xbox.svg" },
  PC: { id: "PC", color: "#0078D4", brand: null },
  Mobile: { id: "Mobile", color: "#4A148C", brand: null },
};

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

export const DISCOVERY_KINDS = ["teammates", "skills"] as const;
export type DiscoveryKind = (typeof DISCOVERY_KINDS)[number];

export function isDiscoveryKind(value: unknown): value is DiscoveryKind {
  return value === "teammates" || value === "skills";
}

export interface BillingCycle {
  id: "1d" | "1m" | "3m" | "6m" | "12m";
  days: number;
}

export const CYCLES: Record<BillingCycle["id"], BillingCycle> = {
  "1d": { id: "1d", days: 1 },
  "1m": { id: "1m", days: 30 },
  "3m": { id: "3m", days: 90 },
  "6m": { id: "6m", days: 180 },
  "12m": { id: "12m", days: 365 },
};

export interface SubscriptionPlan {
  name: string;
  cycles: BillingCycle["id"][];
  maximumSlots?: number;
}

export interface SubscriptionService {
  name: string;
  brand: string | null;
  plans: SubscriptionPlan[];
}

export const SUBSCRIPTION_SERVICES: SubscriptionService[] = [
  {
    name: "Twitch",
    brand: "twitch.svg",
    plans: [
      { name: "Tier 1", cycles: ["1m", "3m", "6m"] },
      { name: "Tier 2", cycles: ["1m", "3m", "6m"] },
      { name: "Tier 3", cycles: ["1m", "3m", "6m"] },
    ],
  },
  {
    name: "YouTube Premium",
    brand: "youtube.svg",
    plans: [
      { name: "Individual", cycles: ["1m", "12m"] },
      { name: "Two-person", cycles: ["1m"], maximumSlots: 2 },
      { name: "Family", cycles: ["1m"], maximumSlots: 6 },
      { name: "Student", cycles: ["1m"] },
      { name: "Premium Lite", cycles: ["1m"] },
    ],
  },
  {
    name: "Discord",
    brand: "discord.svg",
    plans: [
      { name: "Nitro Basic", cycles: ["1m", "12m"] },
      { name: "Nitro", cycles: ["1m", "12m"] },
    ],
  },
  {
    name: "Xbox Game Pass",
    brand: "xbox.svg",
    plans: [
      { name: "Essential", cycles: ["1m", "3m", "12m"] },
      { name: "Premium", cycles: ["1m", "3m", "12m"] },
      { name: "Ultimate", cycles: ["1m", "3m", "12m"] },
      { name: "PC Game Pass", cycles: ["1m", "3m"] },
    ],
  },
  {
    name: "PlayStation Plus",
    brand: "playstation.svg",
    plans: [
      { name: "Essential", cycles: ["1m", "3m", "12m"] },
      { name: "Extra", cycles: ["1m", "3m", "12m"] },
      { name: "Premium", cycles: ["1m", "3m", "12m"] },
    ],
  },
  {
    name: "Nintendo Switch Online",
    brand: "nintendo-switch.svg",
    plans: [
      { name: "Individual", cycles: ["1m", "3m", "12m"] },
      { name: "Family", cycles: ["12m"], maximumSlots: 8 },
      { name: "Individual + Expansion Pack", cycles: ["12m"] },
      { name: "Family + Expansion Pack", cycles: ["12m"], maximumSlots: 8 },
    ],
  },
  {
    name: "EA Play",
    brand: "ea.svg",
    plans: [
      { name: "EA Play", cycles: ["1m", "12m"] },
      { name: "EA Play Pro", cycles: ["1m", "12m"] },
    ],
  },
  {
    name: "Ubisoft+",
    brand: "ubisoft.svg",
    plans: [
      { name: "Classics", cycles: ["1m"] },
      { name: "Premium", cycles: ["1m"] },
    ],
  },
  {
    name: "GeForce Now",
    brand: "nvidia.svg",
    plans: [
      { name: "Performance", cycles: ["1m", "6m"] },
      { name: "Ultimate", cycles: ["1m", "6m"] },
      { name: "Performance Day Pass", cycles: ["1d"] },
      { name: "Ultimate Day Pass", cycles: ["1d"] },
    ],
  },
];

export function subscriptionService(name: string): SubscriptionService | undefined {
  const normalized = name.toLowerCase();
  if (normalized.includes("youtube")) return SUBSCRIPTION_SERVICES.find((s) => s.name === "YouTube Premium");
  return SUBSCRIPTION_SERVICES.find((s) => s.name.toLowerCase() === normalized);
}

export const SUGGESTED_SKILLS = [
  "Game Design", "Unity Dev", "Unreal Engine", "3D Art", "2D Art",
  "Pixel Art", "Animation", "Streaming", "Video Editing", "Coaching",
  "Community Manager", "Speedrunner", "Competitive", "Game Testing",
  "Sound Design", "Concept Art", "Narrative Design", "VR/AR",
];

/** Offline fallback catalog: what search finds when the stores do not answer, and "Popular now" evergreens. */
export const POPULAR_GAMES = [
  "Fortnite", "Minecraft", "Roblox", "Grand Theft Auto V", "Counter-Strike 2",
  "Valorant", "Dota 2", "League of Legends", "Overwatch 2", "Apex Legends",
  "Call of Duty: Warzone", "Call of Duty: Black Ops 6", "PUBG: Battlegrounds",
  "Rocket League", "Tom Clancy's Rainbow Six Siege", "Destiny 2", "Warframe",
  "Genshin Impact", "Honkai: Star Rail", "Zenless Zone Zero", "Marvel Rivals",
  "EA Sports FC 26", "Forza Horizon 5", "Gran Turismo 7", "The Crew Motorfest",
  "Red Dead Redemption 2", "Cyberpunk 2077", "The Witcher 3: Wild Hunt",
  "Elden Ring", "Dark Souls III", "Bloodborne", "Sekiro: Shadows Die Twice",
  "Baldur's Gate 3", "Hades", "Hades II", "Hogwarts Legacy", "Helldivers 2",
  "Death Stranding 2: On the Beach", "Clair Obscur: Expedition 33", "Monster Hunter Wilds",
  "The Last of Us Part II", "God of War Ragnarok", "Ghost of Tsushima",
  "Horizon Forbidden West", "Marvel's Spider-Man 2", "Astro Bot",
  "The Legend of Zelda: Tears of the Kingdom", "The Legend of Zelda: Breath of the Wild",
  "Super Mario Odyssey", "Mario Kart 8 Deluxe", "Super Smash Bros. Ultimate",
  "Animal Crossing: New Horizons", "Pokemon Scarlet", "Pokemon Violet",
  "Splatoon 3", "Metroid Prime 4: Beyond", "Palworld", "Fall Guys", "Among Us",
  "Terraria", "Stardew Valley", "No Man's Sky", "Sea of Thieves",
  "Dead by Daylight", "Phasmophobia", "Rust", "ARK: Survival Ascended",
  "World of Warcraft", "Final Fantasy XIV", "The Elder Scrolls Online",
  "Diablo IV", "Path of Exile 2", "Fallout 76", "The Sims 4",
  // Unreleased, console, mobile and Russian titles the stores do not find, and
  // the big games of Russia and the CIS.
  "Grand Theft Auto VI", "The Witcher 4", "Мир танков", "Мир кораблей", "Tanks Blitz", "Смута",
  "World of Tanks", "War Thunder", "Warface", "Escape from Tarkov", "Standoff 2", "Brawl Stars",
  "Clash Royale", "Clash of Clans", "PUBG Mobile", "Call of Duty: Mobile", "Mobile Legends: Bang Bang",
  "Free Fire", "Pokémon GO", "Pokémon Legends: Z-A", "Hearthstone", "StarCraft II", "Mario Kart World",
  "Super Mario Bros. Wonder", "Donkey Kong Bananza", "The Legend of Zelda: Echoes of Wisdom", "Ghost of Yōtei",
];

export const REPORT_REASONS = [
  { key: "report.reason.spam", icon: "spam" },
  { key: "report.reason.content", icon: "content" },
  { key: "report.reason.harassment", icon: "harassment" },
  { key: "report.reason.fake", icon: "fake" },
  { key: "report.reason.underage", icon: "underage" },
  { key: "report.reason.other", icon: "other" },
] as const;

export const LIMITS = {
  usernameMin: 3,
  usernameMax: 30,
  statusMax: 180,
  skillsDescriptionMax: 600,
  messageMax: 1000,
  reviewMax: 1000,
  reportDetailsMax: 1500,
  gameNameMax: 80,
  gamesPerPlatform: 30,
  wantedGames: 30,
  skills: 20,
  subscriptions: 12,
  avatarBytes: 5 * 1024 * 1024,
  chatImageBytes: 10 * 1024 * 1024,
  maxUndoPerDay: 3,
} as const;
