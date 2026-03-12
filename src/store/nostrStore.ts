import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile, Post, Contact, ChatMessage, Story, AppNotification } from '@/types/nostr';

interface NostrState {
  // Auth
  pubkey: string | null;
  npub: string | null;
  isAuthenticated: boolean;
  setAuth: (pubkey: string | null, npub: string | null) => void;
  logout: () => void;

  // Profile
  profile: UserProfile | null;
  setProfile: (profile: UserProfile | null) => void;

  // Posts
  posts: Post[];
  addPost: (post: Post) => void;
  addPosts: (posts: Post[]) => void;
  updatePost: (id: string, updates: Partial<Post>) => void;
  clearPosts: () => void;

  // Stories
  stories: Story[];
  addStory: (story: Story) => void;
  addStories: (stories: Story[]) => void;
  markStoryViewed: (storyId: string) => void;
  cleanupExpiredStories: () => void;
  getActiveStories: () => Story[];
  getStoriesByPubkey: (pubkey: string) => Story[];

  // Contacts (Following)
  contacts: Contact[];
  addContact: (contact: Contact) => void;
  removeContact: (pubkey: string) => void;
  setContacts: (contacts: Contact[]) => void;

  // Profiles cache
  profiles: Map<string, UserProfile>;
  addProfile: (profile: UserProfile) => void;
  getProfile: (pubkey: string) => UserProfile | undefined;

  // Messages
  messages: Map<string, ChatMessage[]>;
  addMessage: (pubkey: string, message: ChatMessage) => void;
  getMessages: (pubkey: string) => ChatMessage[]

  // Mute list (NIP-51 kind 10000)
  mutedPubkeys: string[];
  mutedHashtags: string[];
  mutedWords: string[];
  setMuteList: (pubkeys: string[], hashtags: string[], words: string[]) => void;
  addMutedPubkey: (pubkey: string) => void;
  removeMutedPubkey: (pubkey: string) => void;
  isMuted: (pubkey: string) => boolean;

  // Bookmarks (NIP-51 kind 30001)
  bookmarkedIds: string[];
  addBookmark: (eventId: string) => void;
  removeBookmark: (eventId: string) => void;
  isBookmarked: (eventId: string) => boolean;

  // Followed hashtags (NIP-51 kind 10001)
  followedHashtags: string[];
  followHashtag: (tag: string) => void;
  unfollowHashtag: (tag: string) => void;

  // Notifications
  notifications: AppNotification[];
  addNotifications: (notifs: AppNotification[]) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  unreadCount: () => number;

  // NWC Wallet (NIP-47)
  nwcUrl: string | null;
  nwcConnected: boolean;
  defaultZapAmount: number;
  walletBalance: number | null;
  setNwcUrl: (url: string | null) => void;
  setNwcConnected: (connected: boolean) => void;
  setDefaultZapAmount: (amount: number) => void;
  setWalletBalance: (balance: number | null) => void;

  // Login method for session restore — DEPRECATED: now managed by AccountManager
  loginMethod: 'extension' | 'nsec' | 'bunker' | null;
  setLoginMethod: (method: 'extension' | 'nsec' | 'bunker' | null) => void;

  // Notification read tracking
  notificationsLastReadAt: number;
  setNotificationsLastReadAt: (ts: number) => void;

  // UI State
  activeTab: 'feed' | 'explore' | 'create' | 'messages' | 'profile' | 'video' | 'notifications' | 'bookmarks';
  setActiveTab: (tab: NostrState['activeTab']) => void;

  // Media
  mediaFilter: 'all' | 'images' | 'videos';
  setMediaFilter: (filter: 'all' | 'images' | 'videos') => void;
}

export const useNostrStore = create<NostrState>()(
  persist(
    (set, get) => ({
      // Auth
      pubkey: null, npub: null, isAuthenticated: false,
      setAuth: (pubkey, npub) => set({ pubkey, npub, isAuthenticated: !!pubkey }),
      logout: () => set({
        pubkey: null, npub: null, isAuthenticated: false, profile: null,
        mutedPubkeys: [], mutedHashtags: [], mutedWords: [],
        bookmarkedIds: [], followedHashtags: [], notifications: [],
        loginMethod: null,
      }),

      // Profile
      profile: null, setProfile: (profile) => set({ profile }),

      // Posts
      posts: [],
      addPost: (post) => set((state) => ({ posts: [post, ...state.posts] })),
      addPosts: (newPosts) => set((state) => ({
        posts: [...newPosts, ...state.posts]
          .filter((p, i, self) => i === self.findIndex(x => x.id === p.id))
          .sort((a, b) => b.created_at - a.created_at)
      })),
      updatePost: (id, updates) => set((state) => ({
        posts: state.posts.map(p => p.id === id ? { ...p, ...updates } : p)
      })),
      clearPosts: () => set({ posts: [] }),

      // Stories
      stories: [],
      addStory: (story) => set((state) => {
        const now = Math.floor(Date.now() / 1000);
        if (story.expires_at > now) {
          return { stories: [story, ...state.stories.filter(s => s.id !== story.id && s.expires_at > now)] };
        }
        return state;
      }),
      addStories: (newStories) => set((state) => {
        const now = Math.floor(Date.now() / 1000);
        const valid = newStories.filter(s => s.expires_at > now);
        return {
          stories: [...valid, ...state.stories]
            .filter((s, i, self) => i === self.findIndex(x => x.id === s.id) && s.expires_at > now)
            .sort((a, b) => b.created_at - a.created_at)
        };
      }),
      markStoryViewed: (id) => set((s) => ({ stories: s.stories.map(x => x.id === id ? { ...x, viewed: true } : x) })),
      cleanupExpiredStories: () => set((state) => {
        const now = Math.floor(Date.now() / 1000);
        return { stories: state.stories.filter(s => s.expires_at > now) };
      }),
      getActiveStories: () => {
        const now = Math.floor(Date.now() / 1000);
        return get().stories.filter(s => s.expires_at > now);
      },
      getStoriesByPubkey: (pubkey) => {
        const now = Math.floor(Date.now() / 1000);
        return get().stories.filter(s => s.pubkey === pubkey && s.expires_at > now);
      },

      // Contacts
      contacts: [],
      addContact: (c) => set((s) => ({ contacts: [...s.contacts.filter(x => x.pubkey !== c.pubkey), c] })),
      removeContact: (pubkey) => set((s) => ({ contacts: s.contacts.filter(c => c.pubkey !== pubkey) })),
      setContacts: (contacts) => set({ contacts }),

      // Profiles cache
      profiles: new Map(),
      addProfile: (profile) => set((state) => {
        const p = new Map(state.profiles);
        p.set(profile.pubkey, profile);
        return { profiles: p };
      }),
      getProfile: (pubkey) => get().profiles.get(pubkey),

      // Messages
      messages: new Map(),
      addMessage: (pubkey, message) => set((state) => {
        const m = new Map(state.messages);
        m.set(pubkey, [...(m.get(pubkey) || []), message]);
        return { messages: m };
      }),
      getMessages: (pubkey) => get().messages.get(pubkey) || [],

      // Mute list
      mutedPubkeys: [],
      mutedHashtags: [],
      mutedWords: [],
      setMuteList: (pubkeys, hashtags, words) => set({ mutedPubkeys: pubkeys, mutedHashtags: hashtags, mutedWords: words }),
      addMutedPubkey: (pubkey) => set((s) => ({ mutedPubkeys: [...s.mutedPubkeys.filter(p => p !== pubkey), pubkey] })),
      removeMutedPubkey: (pubkey) => set((s) => ({ mutedPubkeys: s.mutedPubkeys.filter(p => p !== pubkey) })),
      isMuted: (pubkey) => get().mutedPubkeys.includes(pubkey),

      // Bookmarks
      bookmarkedIds: [],
      addBookmark: (id) => set((s) => ({ bookmarkedIds: [...s.bookmarkedIds.filter(x => x !== id), id] })),
      removeBookmark: (id) => set((s) => ({ bookmarkedIds: s.bookmarkedIds.filter(x => x !== id) })),
      isBookmarked: (id) => get().bookmarkedIds.includes(id),

      // Followed hashtags
      followedHashtags: [],
      followHashtag: (tag) => set((s) => ({
        followedHashtags: [...s.followedHashtags.filter(t => t !== tag.toLowerCase()), tag.toLowerCase()]
      })),
      unfollowHashtag: (tag) => set((s) => ({ followedHashtags: s.followedHashtags.filter(t => t !== tag.toLowerCase()) })),

      // Notifications
      notifications: [],
      addNotifications: (notifs) => set((state) => {
        const existing = new Set(state.notifications.map(n => n.id));
        const fresh = notifs.filter(n => !existing.has(n.id));
        return { notifications: [...fresh, ...state.notifications].sort((a, b) => b.created_at - a.created_at).slice(0, 200) };
      }),
      markNotificationRead: (id) => set((s) => ({
        notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n)
      })),
      markAllNotificationsRead: () => set((s) => ({ notifications: s.notifications.map(n => ({ ...n, read: true })) })),
      unreadCount: () => get().notifications.filter(n => !n.read).length,

      // NWC Wallet
      nwcUrl: null,
      nwcConnected: false,
      defaultZapAmount: 21,
      walletBalance: null,
      setNwcUrl: (url) => set({ nwcUrl: url }),
      setNwcConnected: (connected) => set({ nwcConnected: connected }),
      setDefaultZapAmount: (amount) => set({ defaultZapAmount: amount }),
      setWalletBalance: (balance) => set({ walletBalance: balance }),

      // UI
      activeTab: 'feed',
      setActiveTab: (tab) => set({ activeTab: tab }),
      mediaFilter: 'all',
      setMediaFilter: (filter) => set({ mediaFilter: filter }),

      // Login method restore
      loginMethod: null,
      setLoginMethod: (method) => set({ loginMethod: method }),

      // Notification read tracking
      notificationsLastReadAt: 0,
      setNotificationsLastReadAt: (ts) => set({ notificationsLastReadAt: ts }),
    }),
    {
      name: 'nostr-storage',
      partialize: (state) => ({
        pubkey: state.pubkey, npub: state.npub, profile: state.profile,
        contacts: state.contacts,
        mutedPubkeys: state.mutedPubkeys,
        mutedHashtags: state.mutedHashtags,
        mutedWords: state.mutedWords,
        bookmarkedIds: state.bookmarkedIds,
        followedHashtags: state.followedHashtags,
        nwcUrl: state.nwcUrl,
        nwcConnected: state.nwcConnected,
        defaultZapAmount: state.defaultZapAmount,
        loginMethod: state.loginMethod,
        notificationsLastReadAt: state.notificationsLastReadAt,
      }),
    }
  )
);
