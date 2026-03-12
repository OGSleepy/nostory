import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from 'react';
import {
  NRelay1, NPool, NSecSigner, NConnectSigner,
  NCache,
} from '@nostrify/nostrify';
import { NSchema as n } from '@nostrify/nostrify';
import { LNURL } from '@nostrify/nostrify/ln';
import type { NostrEvent, NostrFilter, NostrSigner } from '@nostrify/nostrify';
import { generateSecretKey } from 'nostr-tools';
import { EventStore } from 'applesauce-core';

// Singleton EventStore — applesauce reactive profile/event model layer
export const eventStore = new EventStore();
import { useNostrStore } from '@/store/nostrStore';
import { DEFAULT_RELAYS, KINDS, LIST_KINDS, STORY_EXPIRY_SECONDS } from '@/types/nostr';
import type { UserProfile, Post, Contact, Story, LongFormPost, AppNotification } from '@/types/nostr';
import * as nip19 from 'nostr-tools/nip19';

const BLOSSOM_SERVER = 'https://blossom.primal.net/';

interface NostrContextValue {
  pool: NPool | null;
  relay: NRelay1 | null;
  isConnected: boolean;
  connect: (relays?: string[]) => Promise<void>;
  disconnect: () => void;
  pubkey: string | null;
  isAuthenticated: boolean;
  loginWithExtension: () => Promise<boolean>;
  loginWith_nsec: (nsec: string) => Promise<boolean>;
  loginWithBunker: (bunkerUri: string) => Promise<boolean>;
  logout: () => void;
  signer: NostrSigner | null;
  publishEvent: (event: Partial<NostrEvent>) => Promise<NostrEvent | null>;
  publishTextNote: (content: string, tags?: string[][]) => Promise<NostrEvent | null>;
  publishReply: (content: string, parentEvent: NostrEvent) => Promise<NostrEvent | null>;
  publishMetadata: (metadata: Partial<UserProfile>) => Promise<NostrEvent | null>;
  publishContactList: (contacts: Contact[]) => Promise<NostrEvent | null>;
  publishReaction: (eventId: string, pubkey: string, content: string) => Promise<NostrEvent | null>;
  publishRepost: (event: NostrEvent) => Promise<NostrEvent | null>;
  publishDM: (content: string, recipientPubkey: string) => Promise<NostrEvent | null>;
  deleteEvent: (eventId: string) => Promise<NostrEvent | null>;
  publishStory: (mediaUrl: string, mediaType: 'image' | 'video', caption?: string) => Promise<NostrEvent | null>;
  sendZap: (recipientPubkey: string, eventId: string | null, amountSats: number, comment?: string) => Promise<boolean>;
  uploadFile: (file: File) => Promise<string>;
  connectNWC: (nwcUrl: string) => Promise<void>;
  disconnectNWC: () => void;
  getWalletBalance: () => Promise<number | null>;
  queryEvents: (filters: NostrFilter[]) => Promise<NostrEvent[]>;
  subscribeEvents: (filters: NostrFilter[], onEvent: (event: NostrEvent) => void) => Promise<() => void>;
  loadProfile: (pubkey: string) => Promise<UserProfile | null>;
  loadContacts: (pubkey: string) => Promise<Contact[]>;
  loadStories: () => Promise<Story[]>;
  loadRelayList: (pubkey: string) => Promise<string[]>;
  // NIP-51 Mute list
  muteUser: (targetPubkey: string) => Promise<void>;
  unmuteUser: (targetPubkey: string) => Promise<void>;
  // NIP-51 Bookmarks
  bookmarkEvent: (eventId: string) => Promise<void>;
  unbookmarkEvent: (eventId: string) => Promise<void>;
  loadBookmarks: () => Promise<string[]>;
  // Followed hashtags
  followHashtagOnRelay: (tag: string) => Promise<void>;
  unfollowHashtagOnRelay: (tag: string) => Promise<void>;
  // NIP-23 Long-form
  publishLongForm: (title: string, content: string, summary?: string, image?: string) => Promise<NostrEvent | null>;
  loadLongFormPosts: (authors?: string[]) => Promise<LongFormPost[]>;
  // Quote reposts (kind 1 with q tag)
  publishQuoteRepost: (originalEvent: NostrEvent, comment: string) => Promise<NostrEvent | null>;
  // Notifications
  loadNotifications: () => Promise<void>;
  // NIP-05 verification
  verifyNip05: (nip05: string, pubkey: string) => Promise<boolean>;
}

const NostrContext = createContext<NostrContextValue | null>(null);

export const useNostr = () => {
  const context = useContext(NostrContext);
  if (!context) throw new Error('useNostr must be used within NostrProvider');
  return context;
};

export const NostrProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const poolRef = useRef<NPool | null>(null);
  const signerRef = useRef<NostrSigner | null>(null);
  // NCache: LRU cache (max 2000 events) sits in front of pool to avoid re-querying relays
  const cacheRef = useRef<NCache>(new NCache({ max: 2000 }));
  // Relay list store: keeps NIP-65 events for outbox routing (pubkey -> event)
  const relayStoreRef = useRef<Map<string, NostrEvent>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const { pubkey, setAuth, logout: storeLogout, addProfile, addPosts, setContacts, addStories,
    setNwcUrl, setNwcConnected, setWalletBalance,
  } = useNostrStore();

  const connect = useCallback(async (relays: string[] = DEFAULT_RELAYS) => {
    try {
      const pool = new NPool({
        open: (url: string) => new NRelay1(url),
        // Outbox model: route author-specific queries to that author's relays
        reqRouter: async (filters) => {
          const routes = new Map<string, NostrFilter[]>();
          const authorRelays = new Map<string, string[]>();

          // Collect all authors across filters
          const allAuthors = new Set<string>();
          for (const filter of filters) {
            for (const author of filter.authors ?? []) {
              allAuthors.add(author);
            }
          }

          // Look up each author's NIP-65 relay list from local store
          if (allAuthors.size > 0) {
            const relayEvents = [...allAuthors]
              .map(a => relayStoreRef.current.get(a))
              .filter((e): e is NostrEvent => !!e);
            for (const event of relayEvents) {
              const authorUrls = event.tags
                .filter((t: string[]) => t[0] === 'r' && t[1])
                .map((t: string[]) => t[1])
                .slice(0, 3);
              if (authorUrls.length) authorRelays.set(event.pubkey, authorUrls);
            }
          }

          // Route filters to author-specific relays when known, else fall back to defaults
          for (const filter of filters) {
            const filterAuthors = filter.authors ?? [];
            if (filterAuthors.length > 0) {
              const usedRelays = new Set<string>();
              for (const author of filterAuthors) {
                const urls = authorRelays.get(author) ?? relays;
                urls.forEach(u => usedRelays.add(u));
              }
              for (const url of usedRelays) {
                const existing = routes.get(url) ?? [];
                routes.set(url, [...existing, filter]);
              }
            } else {
              for (const url of relays) {
                const existing = routes.get(url) ?? [];
                routes.set(url, [...existing, filter]);
              }
            }
          }

          return routes;
        },
        // Publish to user's own write relays if known, else all defaults
        eventRouter: async (event) => {
          const stored = relayStoreRef.current.get(event.pubkey);
          if (stored) {
            const writeRelays = stored.tags
              .filter((t: string[]) => t[0] === 'r' && (!t[2] || t[2] === 'write'))
              .map((t: string[]) => t[1]);
            if (writeRelays.length) return writeRelays;
          }
          return relays;
        },
      });

      poolRef.current = pool;
      setIsConnected(true);

      const feed = await pool.query([{ kinds: [KINDS.TEXT_NOTE], limit: 50 }]);
      const posts = feed.map(eventToPost);
      // Store events in cache
      for (const event of feed) await cacheRef.current.event(event);
      addPosts(posts);

      const pkeys = [...new Set(posts.map(p => p.pubkey))];
      if (pkeys.length > 0) {
        const profiles = await pool.query([{ kinds: [KINDS.METADATA], authors: pkeys }]);
        for (const event of profiles) {
          await cacheRef.current.event(event);
          // Feed into applesauce EventStore for reactive profile access
          eventStore.add(event);
          const p = eventToProfile(event);
          if (p) addProfile(p);
        }
      }
      await loadStories();
    } catch (error) {
      console.error('Failed to connect:', error);
      setIsConnected(false);
    }
  }, [addPosts, addProfile]);

  const disconnect = useCallback(() => { poolRef.current = null; setIsConnected(false); }, []);

  // Shared post-login setup: load profile, contacts, relay list, reconnect with user relays
  const postLogin = async (pubKey: string) => {
    if (!poolRef.current) return;
    const [profiles, contacts, relayListEvents] = await Promise.all([
      poolRef.current.query([{ kinds: [KINDS.METADATA], authors: [pubKey], limit: 1 }]),
      poolRef.current.query([{ kinds: [KINDS.CONTACTS], authors: [pubKey], limit: 1 }]),
      poolRef.current.query([{ kinds: [KINDS.RELAY_LIST], authors: [pubKey], limit: 1 }]),
    ]);

    if (profiles.length > 0) {
      await cacheRef.current.event(profiles[0]);
      // Feed into applesauce EventStore so ProfileModel / use$ can react to it
      eventStore.add(profiles[0]);
      const p = eventToProfile(profiles[0]);
      if (p) addProfile(p);
    }
    if (contacts.length > 0) setContacts(eventToContacts(contacts[0]));

    // Store NIP-65 event in local relay store for outbox routing
    if (relayListEvents.length > 0) {
      relayStoreRef.current.set(relayListEvents[0].pubkey, relayListEvents[0]);
      const userRelays = relayListEvents[0].tags
        .filter((t: string[]) => t[0] === 'r' && t[1])
        .map((t: string[]) => t[1]);
      if (userRelays.length) await connect(userRelays);
    }
  };

  const loginWithExtension = useCallback(async () => {
    try {
      if (!window.nostr) throw new Error('No NIP-07 extension found');
      const browserSigner = window.nostr as NostrSigner;
      const pubKey = await browserSigner.getPublicKey();
      signerRef.current = browserSigner;
      setAuth(pubKey, nip19.npubEncode(pubKey));
      await postLogin(pubKey);
      return true;
    } catch (error) { console.error('Login failed:', error); return false; }
  }, [setAuth, addProfile, setContacts]);

  const loginWith_nsec = useCallback(async (nsec: string) => {
    try {
      const { type, data } = nip19.decode(nsec);
      if (type !== 'nsec') throw new Error('Invalid nsec');
      const secSigner = new NSecSigner(data as Uint8Array);
      const pubKey = await secSigner.getPublicKey();
      signerRef.current = secSigner;
      setAuth(pubKey, nip19.npubEncode(pubKey));
      await postLogin(pubKey);
      return true;
    } catch (error) { console.error('Login with nsec failed:', error); return false; }
  }, [setAuth, addProfile]);

  // NIP-46: login with bunker:// URI (Amber, nsecbunker, nsec.app)
  const loginWithBunker = useCallback(async (bunkerUri: string) => {
    try {
      const url = new URL(bunkerUri);
      if (url.protocol !== 'bunker:') throw new Error('Invalid bunker:// URI');

      const pubkey = url.hostname || url.pathname.replace('//', '');
      const relayParam = url.searchParams.get('relay');
      const secret = url.searchParams.get('secret') ?? undefined;

      if (!relayParam) throw new Error('bunker:// URI missing relay param');

      // NConnectSigner requires a local ephemeral signer for the handshake
      const localSigner = new NSecSigner(generateSecretKey());
      const bunkerRelay = new NRelay1(relayParam);

      const connectSigner = new NConnectSigner({
        pubkey,
        signer: localSigner,
        relay: bunkerRelay,
        timeout: 30000,
      });

      await connectSigner.connect(secret);

      const pubKey = await connectSigner.getPublicKey();
      signerRef.current = connectSigner;
      setAuth(pubKey, nip19.npubEncode(pubKey));
      await postLogin(pubKey);
      return true;
    } catch (error) {
      console.error('Bunker login failed:', error);
      return false;
    }
  }, [setAuth, addProfile, setContacts]);

  const logout = useCallback(() => { signerRef.current = null; storeLogout(); }, [storeLogout]);

  const publishEvent = useCallback(async (event: Partial<NostrEvent>): Promise<NostrEvent | null> => {
    if (!signerRef.current || !poolRef.current) throw new Error('Not authenticated or not connected');
    try {
      const signedEvent = await signerRef.current.signEvent({
        kind: event.kind || KINDS.TEXT_NOTE,
        content: event.content || '',
        tags: event.tags || [],
        created_at: Math.floor(Date.now() / 1000),
      } as any);
      await poolRef.current.event(signedEvent);
      // Store in cache after publishing
      await cacheRef.current.event(signedEvent);
      return signedEvent;
    } catch (error) { console.error('Failed to publish event:', error); return null; }
  }, []);

  const publishTextNote = useCallback(async (content: string, tags: string[][] = []) =>
    publishEvent({ kind: KINDS.TEXT_NOTE, content, tags }), [publishEvent]);

  const publishReply = useCallback(async (content: string, parentEvent: NostrEvent): Promise<NostrEvent | null> => {
    const tags: string[][] = [
      ['e', parentEvent.id, '', 'reply'],
      ['p', parentEvent.pubkey],
    ];
    const rootTag = parentEvent.tags.find(t => t[0] === 'e' && t[3] === 'root');
    if (rootTag) tags.unshift(['e', rootTag[1], '', 'root']);
    return publishEvent({ kind: KINDS.TEXT_NOTE, content, tags });
  }, [publishEvent]);

  const publishMetadata = useCallback(async (metadata: Partial<UserProfile>) =>
    publishEvent({ kind: KINDS.METADATA, content: JSON.stringify(metadata), tags: [] }), [publishEvent]);

  const publishContactList = useCallback(async (contacts: Contact[]) =>
    publishEvent({ kind: KINDS.CONTACTS, content: '', tags: contacts.map(c => ['p', c.pubkey, c.relay || '', c.petname || '']) }), [publishEvent]);

  const publishReaction = useCallback(async (eventId: string, pubkey: string, content: string = '+') =>
    publishEvent({ kind: KINDS.REACTION, content, tags: [['e', eventId], ['p', pubkey]] }), [publishEvent]);

  const publishRepost = useCallback(async (event: NostrEvent) =>
    publishEvent({ kind: KINDS.REPOST, content: JSON.stringify(event), tags: [['e', event.id], ['p', event.pubkey]] }), [publishEvent]);

  const publishDM = useCallback(async (content: string, recipientPubkey: string) => {
    if (!signerRef.current) return null;
    const encrypted = await signerRef.current.nip04?.encrypt(recipientPubkey, content);
    if (!encrypted) throw new Error('Encryption failed');
    return publishEvent({ kind: KINDS.ENCRYPTED_DM, content: encrypted, tags: [['p', recipientPubkey]] });
  }, [publishEvent]);

  const publishStory = useCallback(async (mediaUrl: string, mediaType: 'image' | 'video', caption?: string) => {
    const now = Math.floor(Date.now() / 1000);
    const storyId = `story-${now}-${Math.random().toString(36).slice(2, 9)}`;
    const tags: string[][] = [
      ['d', storyId],
      ['url', mediaUrl],
      ['m', mediaType === 'video' ? 'video/mp4' : 'image/jpeg'],
      ['expiration', (now + STORY_EXPIRY_SECONDS).toString()],
      ['imeta', `url ${mediaUrl}`, `m ${mediaType === 'video' ? 'video/mp4' : 'image/jpeg'}`],
    ];
    return publishEvent({ kind: KINDS.STORY, content: caption || '', tags });
  }, [publishEvent]);

  const deleteEvent = useCallback(async (eventId: string) =>
    publishEvent({ kind: KINDS.DELETION, content: '', tags: [['e', eventId]] }), [publishEvent]);

  const uploadFile = useCallback(async (file: File): Promise<string> => {
    if (!signerRef.current) throw new Error('Must be logged in to upload files');

    // BUD-02: compute SHA256 of file — required as 'x' tag in auth event
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const sha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Sign kind 24242 auth event with x tag (sha256) and expiration (NIP-40)
    const authEvent = await signerRef.current.signEvent({
      kind: 24242,
      content: 'Upload file',
      tags: [
        ['t', 'upload'],
        ['x', sha256],
        ['expiration', String(Math.floor(Date.now() / 1000) + 3600)],
      ],
      created_at: Math.floor(Date.now() / 1000),
    } as any);

    const authHeader = btoa(JSON.stringify(authEvent));
    const res = await fetch(`${BLOSSOM_SERVER}upload`, {
      method: 'PUT',
      headers: { 'Authorization': `Nostr ${authHeader}`, 'Content-Type': file.type },
      body: file,
    });

    if (!res.ok) {
      const reason = res.headers.get('X-Reason') || res.statusText;
      throw new Error('Upload failed: ' + reason);
    }
    const data = await res.json();
    if (!data.url) throw new Error('Upload failed: no URL returned');
    return data.url;
  }, []);

  // NIP-57 zap using Nostrify's LNURL class
  const sendZap = useCallback(async (
    recipientPubkey: string,
    eventId: string | null,
    amountSats: number,
    comment: string = ''
  ): Promise<boolean> => {
    if (!signerRef.current || !poolRef.current) throw new Error('Not authenticated');

    // Check cache first, then relay
    let profileEvent: NostrEvent | undefined;
    const cached = await cacheRef.current.query([{ kinds: [KINDS.METADATA], authors: [recipientPubkey], limit: 1 }]);
    if (cached.length > 0) {
      profileEvent = cached[0];
    } else {
      const fetched = await poolRef.current.query([{ kinds: [KINDS.METADATA], authors: [recipientPubkey], limit: 1 }]);
      if (fetched.length > 0) {
        profileEvent = fetched[0];
        await cacheRef.current.event(fetched[0]);
      }
    }
    if (!profileEvent) throw new Error('Profile not found');

    // Use NSchema for safe metadata parsing
    const metadata = n.json().pipe(n.metadata()).parse(profileEvent.content);
    const { lud06, lud16 } = metadata;

    let lnurl: LNURL | undefined;
    if (lud16) lnurl = LNURL.fromLightningAddress(lud16);
    else if (lud06) lnurl = LNURL.fromString(lud06);
    if (!lnurl) throw new Error('Recipient has no Lightning address');

    const amountMsats = amountSats * 1000;
    const zapTags: string[][] = [
      ['p', recipientPubkey],
      ['amount', amountMsats.toString()],
      ['relays', ...DEFAULT_RELAYS],
      ['lnurl', lnurl.toString()],
    ];
    if (eventId) zapTags.push(['e', eventId]);

    const zapRequest = await signerRef.current.signEvent({
      kind: 9734,
      content: comment,
      tags: zapTags,
      created_at: Math.floor(Date.now() / 1000),
    } as any);

    const { pr } = await lnurl.getInvoice({ amount: amountMsats, nostr: zapRequest });

    // Try NWC first for seamless one-tap zapping
    if (nwcRef.current) {
      try {
        await payInvoiceNWC(pr);
        return true;
      } catch (e: any) {
        throw new Error('NWC payment failed: ' + e.message);
      }
    }

    if ((window as any).webln) {
      await (window as any).webln.enable();
      await (window as any).webln.sendPayment(pr);
      return true;
    } else {
      await navigator.clipboard.writeText(pr);
      throw new Error('INVOICE_COPIED');
    }
  }, []);

  // NIP-47 Nostr Wallet Connect via applesauce-wallet-connect
  const nwcRef = useRef<import('applesauce-wallet-connect').WalletConnect | null>(null);

  const connectNWC = useCallback(async (url: string): Promise<void> => {
    const { WalletConnect } = await import('applesauce-wallet-connect');
    const wallet = WalletConnect.fromConnectURI(url);
    nwcRef.current = wallet;
    setNwcUrl(url);
    setNwcConnected(true);
    // Fetch initial balance
    try {
      const result = await wallet.getBalance();
      setWalletBalance(Math.floor(result.balance / 1000));
    } catch { /* balance optional */ }
  }, []);

  const disconnectNWC = useCallback(() => {
    nwcRef.current = null;
    setNwcUrl(null);
    setNwcConnected(false);
    setWalletBalance(null);
  }, []);

  const getWalletBalance = useCallback(async (): Promise<number | null> => {
    if (!nwcRef.current) return null;
    try {
      const result = await nwcRef.current.getBalance();
      const sats = Math.floor(result.balance / 1000);
      setWalletBalance(sats);
      return sats;
    } catch { return null; }
  }, []);

  const payInvoiceNWC = useCallback(async (invoice: string): Promise<void> => {
    if (!nwcRef.current) throw new Error('No NWC wallet connected');
    await nwcRef.current.payInvoice(invoice);
  }, []);

  // Query: check NCache first, fall back to relay
  const queryEvents = useCallback(async (filters: NostrFilter[]): Promise<NostrEvent[]> => {
    if (!poolRef.current) return [];
    // Try cache first for profile/metadata queries (kind 0) — these rarely change
    const metadataOnly = filters.every(f => f.kinds?.every(k => k === 0));
    if (metadataOnly) {
      const cached = await cacheRef.current.query(filters);
      if (cached.length > 0) return cached;
    }
    const events = await poolRef.current.query(filters);
    // Populate cache with results
    for (const event of events) await cacheRef.current.event(event);
    return events;
  }, []);

  const subscribeEvents = useCallback(async (filters: NostrFilter[], onEvent: (event: NostrEvent) => void): Promise<() => void> => {
    if (!poolRef.current) return () => {};
    const controller = new AbortController();
    (async () => {
      try {
        for await (const msg of poolRef.current!.req(filters, { signal: controller.signal })) {
          if (msg[0] === 'EVENT') {
            await cacheRef.current.event(msg[2]);
            onEvent(msg[2]);
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') console.error('Subscription error:', error);
      }
    })();
    return () => controller.abort();
  }, []);

  const loadProfile = useCallback(async (pubkey: string): Promise<UserProfile | null> => {
    // Check cache first
    const cached = await cacheRef.current.query([{ kinds: [KINDS.METADATA], authors: [pubkey], limit: 1 }]);
    if (cached.length > 0) return eventToProfile(cached[0]);
    if (!poolRef.current) return null;
    const events = await poolRef.current.query([{ kinds: [KINDS.METADATA], authors: [pubkey], limit: 1 }]);
    if (events.length > 0) {
      await cacheRef.current.event(events[0]);
      return eventToProfile(events[0]);
    }
    return null;
  }, []);

  const loadContacts = useCallback(async (pubkey: string): Promise<Contact[]> => {
    if (!poolRef.current) return [];
    const events = await poolRef.current.query([{ kinds: [KINDS.CONTACTS], authors: [pubkey], limit: 1 }]);
    return events.length > 0 ? eventToContacts(events[0]) : [];
  }, []);

  const loadStories = useCallback(async (): Promise<Story[]> => {
    if (!poolRef.current) return [];
    const now = Math.floor(Date.now() / 1000);
    const events = await poolRef.current.query([{ kinds: [KINDS.STORY], since: now - STORY_EXPIRY_SECONDS, limit: 200 }]);
    const stories = events.map(eventToStory).filter(Boolean) as Story[];
    addStories(stories);
    return stories;
  }, [addStories]);

  const loadRelayList = useCallback(async (pubKey: string): Promise<string[]> => {
    if (!poolRef.current) return DEFAULT_RELAYS;
    try {
      const events = await poolRef.current.query([{ kinds: [KINDS.RELAY_LIST], authors: [pubKey], limit: 1 }]);
      if (!events.length) return DEFAULT_RELAYS;
      relayStoreRef.current.set(events[0].pubkey, events[0]);
      const relays = events[0].tags.filter((t: string[]) => t[0] === 'r' && t[1]).map((t: string[]) => t[1]);
      return relays.length > 0 ? relays : DEFAULT_RELAYS;
    } catch { return DEFAULT_RELAYS; }
  }, []);

  // ── NIP-51 Mute list (kind 10000) ────────────────────────────────────────
  const muteUser = useCallback(async (targetPubkey: string) => {
    const store = useNostrStore.getState();
    const current = store.mutedPubkeys;
    if (current.includes(targetPubkey)) return;
    const newList = [...current, targetPubkey];
    const tags: string[][] = [
      ...newList.map(p => ['p', p]),
      ...store.mutedHashtags.map(h => ['t', h]),
      ...store.mutedWords.map(w => ['word', w]),
    ];
    await publishEvent({ kind: LIST_KINDS.MUTE_LIST, content: '', tags });
    store.addMutedPubkey(targetPubkey);
  }, [publishEvent]);

  const unmuteUser = useCallback(async (targetPubkey: string) => {
    const store = useNostrStore.getState();
    const newList = store.mutedPubkeys.filter(p => p !== targetPubkey);
    const tags: string[][] = [
      ...newList.map(p => ['p', p]),
      ...store.mutedHashtags.map(h => ['t', h]),
      ...store.mutedWords.map(w => ['word', w]),
    ];
    await publishEvent({ kind: LIST_KINDS.MUTE_LIST, content: '', tags });
    store.removeMutedPubkey(targetPubkey);
  }, [publishEvent]);

  // ── NIP-51 Bookmarks (kind 30001) ────────────────────────────────────────
  const bookmarkEvent = useCallback(async (eventId: string) => {
    const store = useNostrStore.getState();
    const ids = [...new Set([...store.bookmarkedIds, eventId])];
    await publishEvent({ kind: LIST_KINDS.BOOKMARKS, content: '', tags: ids.map(id => ['e', id]) });
    store.addBookmark(eventId);
  }, [publishEvent]);

  const unbookmarkEvent = useCallback(async (eventId: string) => {
    const store = useNostrStore.getState();
    const ids = store.bookmarkedIds.filter(id => id !== eventId);
    await publishEvent({ kind: LIST_KINDS.BOOKMARKS, content: '', tags: ids.map(id => ['e', id]) });
    store.removeBookmark(eventId);
  }, [publishEvent]);

  const loadBookmarks = useCallback(async (): Promise<string[]> => {
    if (!poolRef.current || !pubkey) return [];
    const events = await poolRef.current.query([{ kinds: [LIST_KINDS.BOOKMARKS], authors: [pubkey], limit: 1 }]);
    if (!events.length) return [];
    const ids = events[0].tags.filter((t: string[]) => t[0] === 'e').map((t: string[]) => t[1]);
    const store = useNostrStore.getState();
    store.setMuteList(store.mutedPubkeys, store.mutedHashtags, store.mutedWords);
    ids.forEach(id => store.addBookmark(id));
    return ids;
  }, [pubkey]);

  // ── Followed hashtags ─────────────────────────────────────────────────────
  const followHashtagOnRelay = useCallback(async (tag: string) => {
    const store = useNostrStore.getState();
    const tags = [...new Set([...store.followedHashtags, tag.toLowerCase()])];
    await publishEvent({ kind: LIST_KINDS.FOLLOW_HASHTAGS, content: '', tags: tags.map(t => ['t', t]) });
    store.followHashtag(tag);
  }, [publishEvent]);

  const unfollowHashtagOnRelay = useCallback(async (tag: string) => {
    const store = useNostrStore.getState();
    const tags = store.followedHashtags.filter(t => t !== tag.toLowerCase());
    await publishEvent({ kind: LIST_KINDS.FOLLOW_HASHTAGS, content: '', tags: tags.map(t => ['t', t]) });
    store.unfollowHashtag(tag);
  }, [publishEvent]);

  // ── NIP-23 Long-form articles (kind 30023) ────────────────────────────────
  const publishLongForm = useCallback(async (
    title: string, content: string, summary?: string, image?: string
  ): Promise<NostrEvent | null> => {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
    const now = Math.floor(Date.now() / 1000);
    const tags: string[][] = [
      ['d', slug],
      ['title', title],
      ['published_at', now.toString()],
    ];
    if (summary) tags.push(['summary', summary]);
    if (image) tags.push(['image', image]);
    return publishEvent({ kind: KINDS.LONG_FORM, content, tags });
  }, [publishEvent]);

  const loadLongFormPosts = useCallback(async (authors?: string[]): Promise<LongFormPost[]> => {
    if (!poolRef.current) return [];
    const filter: NostrFilter = { kinds: [KINDS.LONG_FORM], limit: 20 };
    if (authors) filter.authors = authors;
    const events = await poolRef.current.query([filter]);
    return events.map(e => ({
      id: e.id, pubkey: e.pubkey, content: e.content, created_at: e.created_at,
      tags: e.tags, sig: e.sig,
      title: e.tags.find(t => t[0] === 'title')?.[1] || 'Untitled',
      summary: e.tags.find(t => t[0] === 'summary')?.[1],
      image: e.tags.find(t => t[0] === 'image')?.[1],
      published_at: Number(e.tags.find(t => t[0] === 'published_at')?.[1] || e.created_at),
    }));
  }, []);

  // ── Quote reposts (kind 1 with q tag) ────────────────────────────────────
  const publishQuoteRepost = useCallback(async (originalEvent: NostrEvent, comment: string): Promise<NostrEvent | null> => {
    const nevent = nip19.neventEncode({ id: originalEvent.id, author: originalEvent.pubkey });
    const content = `${comment}\n\nnostr:${nevent}`;
    const tags: string[][] = [
      ['q', originalEvent.id],
      ['p', originalEvent.pubkey],
    ];
    return publishEvent({ kind: KINDS.TEXT_NOTE, content, tags });
  }, [publishEvent]);

  // ── Notifications ─────────────────────────────────────────────────────────
  const loadNotifications = useCallback(async () => {
    if (!poolRef.current || !pubkey) return;
    const since = Math.floor(Date.now() / 1000) - 7 * 24 * 3600; // last 7 days
    const [mentions, reactions, reposts, zaps, follows] = await Promise.all([
      poolRef.current.query([{ kinds: [KINDS.TEXT_NOTE], '#p': [pubkey], since, limit: 50 }]),
      poolRef.current.query([{ kinds: [KINDS.REACTION], '#p': [pubkey], since, limit: 100 }]),
      poolRef.current.query([{ kinds: [KINDS.REPOST], '#p': [pubkey], since, limit: 50 }]),
      poolRef.current.query([{ kinds: [KINDS.ZAP_RECEIPT], '#p': [pubkey], since, limit: 50 }]),
      poolRef.current.query([{ kinds: [KINDS.CONTACTS], '#p': [pubkey], since, limit: 50 }]),
    ]);

    const notifs: AppNotification[] = [];

    for (const e of mentions) {
      const isReply = e.tags.some(t => t[0] === 'e');
      notifs.push({
        id: e.id, type: isReply ? 'reply' : 'mention',
        pubkey: e.pubkey, targetId: e.tags.find(t => t[0] === 'e')?.[1],
        content: e.content.slice(0, 100),
        created_at: e.created_at, read: false,
      });
    }
    for (const e of reactions) {
      notifs.push({
        id: e.id, type: 'reaction', pubkey: e.pubkey,
        targetId: e.tags.find(t => t[0] === 'e')?.[1],
        content: e.content, created_at: e.created_at, read: false,
      });
    }
    for (const e of reposts) {
      notifs.push({
        id: e.id, type: 'repost', pubkey: e.pubkey,
        targetId: e.tags.find(t => t[0] === 'e')?.[1],
        created_at: e.created_at, read: false,
      });
    }
    for (const e of zaps) {
      const amountTag = e.tags.find(t => t[0] === 'amount');
      const amount = amountTag ? parseInt(amountTag[1]) : 0;
      notifs.push({
        id: e.id, type: 'zap', pubkey: e.pubkey,
        targetId: e.tags.find(t => t[0] === 'e')?.[1],
        amount, created_at: e.created_at, read: false,
      });
    }
    for (const e of follows) {
      notifs.push({
        id: e.id, type: 'follow', pubkey: e.pubkey,
        created_at: e.created_at, read: false,
      });
    }

    notifs.sort((a, b) => b.created_at - a.created_at);
    useNostrStore.getState().addNotifications(notifs);
  }, [pubkey]);

  // ── NIP-05 verification ──────────────────────────────────────────────────
  const verifyNip05 = useCallback(async (nip05: string, pubkeyHex: string): Promise<boolean> => {
    try {
      const [name, domain] = nip05.split('@');
      if (!name || !domain) return false;
      const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${name}`);
      if (!res.ok) return false;
      const data = await res.json();
      return data.names?.[name] === pubkeyHex;
    } catch { return false; }
  }, []);

  useEffect(() => { connect(); return () => { disconnect(); }; }, []);

  const value: NostrContextValue = {
    pool: poolRef.current, relay: null, isConnected, connect, disconnect,
    pubkey, isAuthenticated: !!pubkey,
    loginWithExtension, loginWith_nsec, loginWithBunker, logout,
    signer: signerRef.current,
    publishEvent, publishTextNote, publishReply, publishMetadata, publishContactList,
    publishReaction, publishRepost, publishDM, deleteEvent, publishStory,
    sendZap, uploadFile, connectNWC, disconnectNWC, getWalletBalance,
    queryEvents, subscribeEvents, loadProfile, loadContacts, loadStories, loadRelayList,
    muteUser, unmuteUser, bookmarkEvent, unbookmarkEvent, loadBookmarks,
    followHashtagOnRelay, unfollowHashtagOnRelay,
    publishLongForm, loadLongFormPosts, publishQuoteRepost,
    loadNotifications, verifyNip05,
  };

  return <NostrContext.Provider value={value}>{children}</NostrContext.Provider>;
};

// Helper functions

function eventToPost(event: NostrEvent): Post {
  return { id: event.id, pubkey: event.pubkey, content: event.content, created_at: event.created_at, tags: event.tags, sig: event.sig, kind: event.kind };
}

function eventToProfile(event: NostrEvent): UserProfile | null {
  try {
    // Use NSchema for safe metadata parsing
    const metadata = n.json().pipe(n.metadata()).parse(event.content);
    return { pubkey: event.pubkey, npub: event.pubkey, ...metadata };
  } catch { return null; }
}

function eventToContacts(event: NostrEvent): Contact[] {
  return event.tags.filter(tag => tag[0] === 'p').map(tag => ({ pubkey: tag[1], relay: tag[2], petname: tag[3] }));
}

function eventToStory(event: NostrEvent): Story | null {
  try {
    const urlTag = event.tags.find(t => t[0] === 'url');
    const mediaTypeTag = event.tags.find(t => t[0] === 'm');
    const expirationTag = event.tags.find(t => t[0] === 'expiration');
    return {
      id: event.id, pubkey: event.pubkey, content: event.content,
      created_at: event.created_at,
      expires_at: expirationTag ? parseInt(expirationTag[1]) : event.created_at + STORY_EXPIRY_SECONDS,
      tags: event.tags, sig: event.sig, kind: event.kind,
      mediaUrl: urlTag?.[1],
      mediaType: mediaTypeTag?.[1] as 'image' | 'video',
    };
  } catch { return null; }
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: any): Promise<any>;
      getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
      nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
  }
}
