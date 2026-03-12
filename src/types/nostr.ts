export interface UserProfile {
  pubkey: string;
  npub: string;
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  website?: string;
  nip05?: string;
  lud16?: string;
  lud06?: string;
  created_at?: number;
}

export interface Post {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
  sig: string;
  kind: number;
  author?: UserProfile;
  reactions?: Reaction[];
  replies?: Post[];
  reposts?: string[];
  zaps?: ZapReceipt[];
}

export interface Story {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  expires_at: number;
  tags: string[][];
  sig: string;
  kind: number;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  author?: UserProfile;
  viewed?: boolean;
}

export interface Reaction {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
}

export interface ZapReceipt {
  id: string;
  pubkey: string;
  amount: number;
  comment?: string;
  created_at: number;
}

export interface NostrContextType {
  relay: any;
  pool: any;
  signer: any;
  pubkey: string | null;
  isConnected: boolean;
  connect: (relays?: string[]) => Promise<void>;
  disconnect: () => void;
}

export interface FeedItem extends Post {
  type: 'text' | 'image' | 'video' | 'repost';
  mediaUrls?: string[];
}

export interface ChatMessage {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  decrypted?: string;
}

export interface Contact {
  pubkey: string;
  profile?: UserProfile;
  relay?: string;
  petname?: string;
}

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://nostr.wine',
];

export const VIDEO_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
];

export const KINDS = {
  METADATA: 0,
  TEXT_NOTE: 1,
  RECOMMEND_RELAY: 2,
  CONTACTS: 3,
  ENCRYPTED_DM: 4,
  DELETION: 5,
  REPOST: 6,
  REACTION: 7,
  BADGE_AWARD: 8,
  CHANNEL_CREATE: 40,
  CHANNEL_METADATA: 41,
  CHANNEL_MESSAGE: 42,
  CHANNEL_HIDE_MESSAGE: 43,
  CHANNEL_MUTE_USER: 44,
  FILE_HEADER: 1063,
  FILE_CHUNK: 1064,
  STATUS: 30315,
  LONG_FORM: 30023,
  LONG_FORM_DRAFT: 30024,
  HIGHLIGHT: 9802,
  ZAP_REQUEST: 9734,
  ZAP_RECEIPT: 9735,
  // NIP-65: Relay List Metadata — stores a user's preferred read/write relays
  RELAY_LIST: 10002,
  // Proposed NIP: Ephemeral Stories (Kind 30315)
  // Kind 30315 is a new addressable event kind proposed for Instagram-style ephemeral stories.
  // Each story is a separate addressable event identified by a unique `d` tag (UUID).
  // Stories self-expire via the NIP-40 `expiration` tag (set to created_at + 86400).
  // Media is referenced via `imeta` tags (NIP-92) or fallback `url`/`m` tags.
  // Reference: https://github.com/nostr-protocol/nostr/issues (pending NIP proposal)
  STORY: 30315,
} as const;

// Story expires after 24 hours (in seconds)
export const STORY_EXPIRY_SECONDS = 24 * 60 * 60;

// NIP-51 Lists
export const LIST_KINDS = {
  MUTE_LIST: 10000,       // muted pubkeys + words + hashtags
  BOOKMARKS: 30001,       // bookmarked event IDs
  FOLLOW_HASHTAGS: 10001, // hashtags user follows (kind 1 t-tags filter)
} as const;

// NIP-23 Long-form article
export interface LongFormPost {
  id: string;
  pubkey: string;
  title: string;
  content: string;
  summary?: string;
  image?: string;
  published_at?: number;
  created_at: number;
  tags: string[][];
  sig: string;
}

// Notification types
export type NotificationType = 'reaction' | 'reply' | 'repost' | 'zap' | 'follow' | 'mention' | 'quote';

export interface AppNotification {
  id: string;
  type: NotificationType;
  pubkey: string;        // who triggered it
  targetId?: string;     // the event it targets
  amount?: number;       // for zaps (msats)
  content?: string;      // reaction content or reply preview
  created_at: number;
  read: boolean;
}
