// Wire types for social (docs/social/PROTOCOL.md). Shared by the worker, the web UI and tests.

export type Share = "basic" | "lifts" | "full";
export const SHARES: readonly Share[] = ["basic", "lifts", "full"];
export const isShare = (x: unknown): x is Share => typeof x === "string" && (SHARES as readonly string[]).includes(x);
export const atLeast = (s: Share, min: Share) => SHARES.indexOf(s) >= SHARES.indexOf(min);

export const EMOJI = ["💪", "🔥", "👏", "🏆", "😤"] as const;
export const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{1,29}$/;

export interface WellKnown {
  v: 1; server: string; handle: string | null; name: string | null; publicKey: string; directory: string | null; software: "ironterm";
}

export interface SocialProfile {
  server: string; handle: string | null; name: string | null; share: Share;
  unit: "kg" | "lb" | null;
  streak: { current: number; best: number };
  week: { done: number; target: number };
  sessions52: number;
  graph: { start: string; levels: number[] };
  lifts: { key: string; name: string; e1rm: number | null; best: number | null }[];
  bodyweight: number | null;
  program: string | null;
  updatedAt: string;
}

export interface Reactions { emoji: string; from: { server: string; name: string | null }[] }
export interface Comment { id: string; from: { server: string; name: string | null }; text: string; at: string }

interface ItemBase { id: string; at: string; reactions: Reactions[]; comments: Comment[] }
export interface SessionItem extends ItemBase {
  kind: "session"; title: string; durationMin: number; sets: number;
  exercises: { name: string; lift: string | null; top?: { weight: number; reps: number } | null; sets?: { weight: number | null; reps: number | null }[] }[];
  volume?: number; note?: string;
}
export interface PrItem extends ItemBase { kind: "pr"; lift: string; liftName: string; prKind: string; reps: number; weight?: number; prev?: number | null }
export interface AchievementItem extends ItemBase { kind: "achievement"; title: string; tier: string; description: string }
export type FeedItem = SessionItem | PrItem | AchievementItem;

/** `unit`: the weights' unit (null at basic, where there are none) */
export interface FeedPage { items: FeedItem[]; next: string | null; share: Share; unit: "kg" | "lb" | null }

export interface Author { id: string; server: string; handle: string | null; name: string | null }
export interface Friend extends Author {
  status: "friends" | "outgoing" | "incoming";
  share: Share;
  theirShare: Share | null;
  since: string; lastSeen: string | null; fingerprint: string; note?: string | null;
}

export interface Compare {
  friend: Author; unit: "kg" | "lb";
  lifts: { key: string; name: string; me: number | null; them: number | null; meBw?: number | null; themBw?: number | null }[];
  weeks: { week: string; me: number; them: number }[];
  streak: { me: number; them: number };
}

export interface Notification {
  id: string; kind: "request" | "accepted" | "reaction" | "comment"; from: Author;
  item?: string; emoji?: string; text?: string; at: string; read: boolean;
}

export interface SocialMe {
  enabled: boolean; handle: string | null; name: string | null; server: string; directory: string | null; listed: boolean; fingerprint: string;
  /** directory configured on this server (SOCIAL_DIRECTORY), even before setup */
  directoryConfigured: boolean;
  unread: number;
}

export type InboxMessage =
  | { type: "friend_request"; id: string; from: { server: string; handle: string | null; name: string | null; directory: string | null }; note?: string | null }
  | { type: "friend_accept"; id: string; request: string }
  | { type: "friend_reject"; id: string; request: string }
  | { type: "unfriend"; id: string }
  | { type: "reaction"; id: string; item: string; emoji: string }
  | { type: "unreaction"; id: string; item: string }
  | { type: "comment"; id: string; item: string; text: string };
