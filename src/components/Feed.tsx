import { useEffect, useState, useCallback, useRef } from 'react';
import { useNostr } from '@/context/NostrContext';
import { useNostrStore } from '@/store/nostrStore';
import { PostCard } from '@/components/PostCard';
import { Stories } from '@/components/Stories';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Users, Image as ImageIcon, Hash } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { KINDS } from '@/types/nostr';

export const Feed: React.FC = () => {
  const { queryEvents, subscribeEvents, isConnected } = useNostr();
  const { posts, addPosts, addProfile, contacts, mutedPubkeys, mutedHashtags, followedHashtags } = useNostrStore();
  const [activeFilter, setActiveFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const loadPosts = useCallback(async () => {
    if (!isConnected) return;
    setIsLoading(true);
    try {
      const authors = contacts.length > 0 ? contacts.map(c => c.pubkey) : undefined;
      const filters: any[] = [{ kinds: [KINDS.TEXT_NOTE], authors, limit: 50 }];
      // Also fetch hashtag posts if user follows any
      if (followedHashtags.length > 0) {
        filters.push({ kinds: [KINDS.TEXT_NOTE], '#t': followedHashtags, limit: 30 });
      }
      const events = await queryEvents(filters);
      const newPosts = events.map(event => ({
        id: event.id, pubkey: event.pubkey, content: event.content,
        created_at: event.created_at, tags: event.tags, sig: event.sig, kind: event.kind,
      }));
      addPosts(newPosts);
      const pubkeys = [...new Set(newPosts.map(p => p.pubkey))];
      if (pubkeys.length > 0) {
        const profiles = await queryEvents([{ kinds: [KINDS.METADATA], authors: pubkeys }]);
        profiles.forEach(event => {
          try {
            const data = JSON.parse(event.content);
            addProfile({ pubkey: event.pubkey, npub: event.pubkey, ...data });
          } catch {}
        });
      }
    } catch (error) {
      console.error('Failed to load posts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, queryEvents, addPosts, addProfile, contacts, followedHashtags]);

  useEffect(() => {
    if (!isConnected) return;
    const setupSubscription = async () => {
      const authors = contacts.length > 0 ? contacts.map(c => c.pubkey) : undefined;
      const unsubscribe = await subscribeEvents(
        [{ kinds: [KINDS.TEXT_NOTE], authors, since: Math.floor(Date.now() / 1000) }],
        (event: NostrEvent) => {
          addPosts([{ id: event.id, pubkey: event.pubkey, content: event.content, created_at: event.created_at, tags: event.tags, sig: event.sig, kind: event.kind }]);
        }
      );
      unsubscribeRef.current = unsubscribe;
    };
    setupSubscription();
    return () => { unsubscribeRef.current?.(); };
  }, [isConnected, subscribeEvents, addPosts, contacts]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // Filter posts: remove muted users + apply tab filter
  const filteredPosts = posts.filter(post => {
    // Always hide muted users
    if (mutedPubkeys.includes(post.pubkey)) return false;
    // Hide if post contains muted hashtags
    if (mutedHashtags.length > 0) {
      const postTags = post.tags.filter(t => t[0] === 't').map(t => t[1].toLowerCase());
      if (postTags.some(t => mutedHashtags.includes(t))) return false;
    }
    if (activeFilter === 'following') {
      return contacts.some(c => c.pubkey === post.pubkey);
    }
    if (activeFilter === 'hashtags') {
      if (followedHashtags.length === 0) return false;
      const postTags = post.tags.filter(t => t[0] === 't').map(t => t[1].toLowerCase());
      return postTags.some(t => followedHashtags.includes(t));
    }
    if (activeFilter === 'images') return /\.(jpg|jpeg|png|gif|webp)/i.test(post.content);
    return true; // 'all'
  });

  return (
    <div className="space-y-4">
      {/* Stories */}
      <Stories />

      {/* Filter Tabs */}
      <Tabs value={activeFilter} onValueChange={setActiveFilter} className="w-full">
        <TabsList className="w-full grid grid-cols-4 bg-[#1a1a1a] p-1 rounded-xl">
          <TabsTrigger value="all" className="data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white text-gray-500 rounded-lg gap-2">
            <Sparkles className="h-4 w-4" /><span className="hidden sm:inline">All</span>
          </TabsTrigger>
          <TabsTrigger value="following" className="data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white text-gray-500 rounded-lg gap-2">
            <Users className="h-4 w-4" /><span className="hidden sm:inline">Following</span>
          </TabsTrigger>
          <TabsTrigger value="hashtags" className="data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white text-gray-500 rounded-lg gap-2">
            <Hash className="h-4 w-4" /><span className="hidden sm:inline">Topics</span>
          </TabsTrigger>
          <TabsTrigger value="images" className="data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white text-gray-500 rounded-lg gap-2">
            <ImageIcon className="h-4 w-4" /><span className="hidden sm:inline">Photos</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Posts */}
      <div className="space-y-4">
        {filteredPosts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      {/* Loading State */}
      {isLoading && posts.length === 0 && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && posts.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No posts yet</p>
          <p className="text-sm mt-1">Be the first to post!</p>
        </div>
      )}
    </div>
  );
};
