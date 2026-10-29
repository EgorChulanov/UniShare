// HTTP/WebSocket contract between the UniShare API server and every client.
import type { DiscoveryKind, Platform } from "./catalog";

export type AuthProvider = "telegram" | "vk" | "dev";
export type ClientPlatform = "telegram" | "vk" | "web";

export interface GameTag {
  name: string;
  coverUrl?: string | null;
  rawgId?: number | null;
}

export interface Subscription {
  id: string;
  name: string;
  planName?: string | null;
  billingCycleId?: string | null;
  startedAt?: string | null;
  expiresAt?: string | null;
  autoRenew?: boolean | null;
}

/** Linked sign-in identity, shown with the platform icon in the profile. */
export interface LinkedIdentity {
  provider: "telegram" | "vk";
  username: string | null;
  displayName: string | null;
  /** Public profile URL (t.me/... or vk.com/id...). Only returned to the owner. */
  url: string | null;
  canMessage: boolean;
}

export interface MyProfile {
  uid: string;
  username: string | null;
  avatarUrl: string | null;
  status: string | null;
  platforms: Platform[];
  platformGames: Partial<Record<Platform, string[]>>;
  games: string[];
  wantedGames: string[];
  gameMetadata: Record<string, GameTag>;
  skills: string[];
  skillsDescription: string | null;
  hasSkillsProfile: boolean;
  subscriptions: Subscription[];
  language: string;
  allowDirectContact: boolean;
  onboardingComplete: boolean;
  rating: number;
  reviewCount: number;
  createdAt: string;
  identities: LinkedIdentity[];
  /** Suggested values from the platform account for onboarding. */
  suggestions?: { username?: string | null; avatarUrl?: string | null };
}

/** Public card shown in the feed, chats, QR scans, and shared links. */
export interface ProfileCard {
  uid: string;
  username: string;
  avatarUrl: string | null;
  status: string | null;
  platforms: Platform[];
  platformGames: Partial<Record<Platform, GameTag[]>>;
  games: GameTag[];
  wantedGames: GameTag[];
  skills: string[];
  skillsDescription: string | null;
  subscriptions: Subscription[];
  rating: number;
  reviewCount: number;
  isOnline: boolean;
  lastSeen: string | null;
  /** Providers the user signed in with; used for the platform icons. */
  providers: ("telegram" | "vk")[];
}

export type ProfileUpdate = Partial<{
  username: string;
  avatarUrl: string | null;
  status: string | null;
  platforms: Platform[];
  platformGames: Partial<Record<Platform, string[]>>;
  wantedGames: string[];
  gameMetadata: Record<string, GameTag>;
  skills: string[];
  skillsDescription: string | null;
  hasSkillsProfile: boolean;
  subscriptions: Subscription[];
  language: string;
  allowDirectContact: boolean;
  onboardingComplete: boolean;
}>;

export interface AuthResponse {
  token: string;
  profile: MyProfile;
  isNewUser: boolean;
  /** Present when the request carried a link token that was applied. */
  linked?: "telegram" | "vk";
}

export interface SwipeResult {
  matched: boolean;
  chatId: string | null;
}

export interface LikeRequestItem {
  id: string;
  kind: DiscoveryKind;
  createdAt: string;
  from: ProfileCard;
}

export interface ChatSummary {
  id: string;
  kind: DiscoveryKind;
  partner: ProfileCard;
  lastMessage: string;
  lastMessageAt: string;
  lastSenderId: string | null;
  unread: number;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string | null;
  imageUrl: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface DirectContact {
  provider: "telegram" | "vk";
  url: string;
  label: string;
}

export interface ChatDetails extends ChatSummary {
  canReview: boolean;
  /** Ways to reach the partner outside UniShare, if they opted in. */
  contacts: DirectContact[];
}

export interface Story {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  imageUrl: string | null;
  symbol: string;
  accentHex: string;
  ctaTitle: string | null;
  ctaUrl: string | null;
  publishedAt: string;
  isSeen: boolean;
}

export interface Review {
  id: string;
  fromUid: string;
  fromUsername: string | null;
  rating: number;
  text: string | null;
  createdAt: string;
}

export interface GameSearchResult {
  id: number;
  name: string;
  backgroundImage: string | null;
  released: string | null;
}

export interface PublicConfig {
  telegramBotUsername: string | null;
  telegramAppShortName: string | null;
  vkAppId: number | null;
  /** Community that sends VK notifications (VKWebAppAllowMessagesFromGroup). */
  vkGroupId: number | null;
  publicUrl: string;
  supportEmail: string;
  privacyUrl: string;
  termsUrl: string;
  devAuth: boolean;
}

export interface LinkTokenResponse {
  token: string;
  expiresAt: string;
  telegramUrl: string | null;
  vkUrl: string | null;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
}

/** Server → client realtime events delivered over /api/ws. */
export type RealtimeEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "chat"; chat: ChatSummary }
  | { type: "chat_removed"; chatId: string }
  | { type: "read"; chatId: string; readerId: string; readAt: string }
  | { type: "request"; request: LikeRequestItem }
  | { type: "match"; chatId: string; partner: ProfileCard }
  | { type: "presence"; uid: string; isOnline: boolean }
  | { type: "typing"; chatId: string; uid: string };

/** Client → server realtime events. */
export type RealtimeCommand =
  | { type: "typing"; chatId: string }
  | { type: "visibility"; visible: boolean }
  | { type: "ping" };
