import { useEffect, useState, useCallback } from 'react';
import { useNostr } from '@/context/NostrContext';
import { useNostrStore } from '@/store/nostrStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, TrendingUp, Users, Hash, Image as ImageIcon, Play, Loader2 } from 'lucide-react';
import { KINDS } from '@/types/nostr';
import type { UserProfile, Post } from '@/types/nostr';
import { toast } from 'sonner';

export const Explore: React.FC = () => {
  const { queryEvents, publishContactList } = useNostr();
  const { addProfile, isAuthenticated, contacts, setContacts } = useNostrStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<UserProfile[]>([]);
  const [mediaPosts, setMediaPosts] = useState<Post[]>([]);
  const [videoPosts, setVideoPosts] = useState<Post[]>([]);
  const [searchResults, setSearchResults] = useState<{ posts: Post[]; users: UserProfile[] } | null>(null);
  const { profiles } = useNostrStore();

  useEffect(() => {
    const loadExploreData = async () => {
      const posts = await queryEvents([{ kinds: [KINDS.TEXT_NOTE], limit: 50 }]);
      const parsed = posts.map(e => ({ id: e.id, pubkey: e.pubkey, content: e.content, created_at: e.created_at, tags: e.tags, sig: e.sig, kind: e.kind }));
      setTrendingPosts(parsed);
      setMediaPosts(parsed.filter(p => extractMediaUrls(p.content).some(isImageUrl)));
      setVideoPosts(parsed.filter(p => extractMediaUrls(p.content).some(isVideoUrl)));
      const pkeys = [...new Set(parsed.map(p => p.pubkey))].slice(0, 20);
      if (pkeys.length > 0) {
        const profs = await queryEvents([{ kinds: [KINDS.METADATA], authors: pkeys }]);
        const parsed2 = profs.map(e => { try { return { pubkey: e.pubkey, npub: e.pubkey, ...JSON.parse(e.content) }; } catch { return null; } }).filter(Boolean) as UserProfile[];
        setSuggestedUsers(parsed2);
        parsed2.forEach(addProfile);
      }
    };
    loadExploreData();
  }, [queryEvents, addProfile]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults(null);
    try {
      const query = searchQuery.trim().toLowerCase();
      // NIP-50 search filter (supported by relays like nos.lol, relay.snort.social)
      const [postEvents, profileEvents] = await Promise.all([
        queryEvents([{ kinds: [KINDS.TEXT_NOTE], search: query, limit: 30 }]),
        queryEvents([{ kinds: [KINDS.METADATA], search: query, limit: 20 }]),
      ]);

      // Client-side fallback for relays that don't support NIP-50
      const allPosts = trendingPosts.filter(p => p.content.toLowerCase().includes(query));
      const foundPosts = postEvents.length > 0
        ? postEvents.map(e => ({ id: e.id, pubkey: e.pubkey, content: e.content, created_at: e.created_at, tags: e.tags, sig: e.sig, kind: e.kind }))
        : allPosts;

      const foundUsers: UserProfile[] = profileEvents.map(e => {
        try { const d = JSON.parse(e.content); addProfile({ pubkey: e.pubkey, npub: e.pubkey, ...d }); return { pubkey: e.pubkey, npub: e.pubkey, ...d }; }
        catch { return null; }
      }).filter(Boolean) as UserProfile[];

      // Also search cached profiles client-side
      const cachedMatches = suggestedUsers.filter(u =>
        u.name?.toLowerCase().includes(query) ||
        u.display_name?.toLowerCase().includes(query) ||
        u.about?.toLowerCase().includes(query)
      );
      const mergedUsers = [...foundUsers, ...cachedMatches].filter((u, i, a) => a.findIndex(x => x.pubkey === u.pubkey) === i);

      setSearchResults({ posts: foundPosts, users: mergedUsers });
    } catch (err) {
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, queryEvents, trendingPosts, suggestedUsers, addProfile]);

  const handleFollow = async (user: UserProfile) => {
    if (!isAuthenticated) { toast.error('Sign in to follow users'); return; }
    const isFollowing = contacts.some(c => c.pubkey === user.pubkey);
    const newContacts = isFollowing
      ? contacts.filter(c => c.pubkey !== user.pubkey)
      : [...contacts, { pubkey: user.pubkey }];
    try {
      await publishContactList(newContacts);
      setContacts(newContacts);
      toast.success(isFollowing ? 'Unfollowed' : 'Followed');
    } catch { toast.error('Failed to update follows'); }
  };

  const displayPosts = searchResults ? searchResults.posts : trendingPosts;
  const displayUsers = searchResults ? searchResults.users : suggestedUsers;

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Input
          placeholder="Search users, posts, or hashtags…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1"
        />
        <Button onClick={handleSearch} disabled={isSearching}>
          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {/* Trending hashtags */}
      <div className="flex flex-wrap gap-2">
        {['#bitcoin', '#nostr', '#lightning', '#crypto', '#web3'].map(tag => (
          <Button key={tag} variant="secondary" size="sm"
            onClick={() => { setSearchQuery(tag); }}>
            <Hash className="h-3 w-3 mr-1" />{tag}
          </Button>
        ))}
      </div>

      {searchResults && (
        <p className="text-sm text-muted-foreground">
          Found {searchResults.posts.length} posts and {searchResults.users.length} users for "{searchQuery}"
        </p>
      )}

      <Tabs defaultValue="trending" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="trending"><TrendingUp className="h-4 w-4 mr-2" />Trending</TabsTrigger>
          <TabsTrigger value="people"><Users className="h-4 w-4 mr-2" />People</TabsTrigger>
          <TabsTrigger value="photos"><ImageIcon className="h-4 w-4 mr-2" />Photos</TabsTrigger>
          <TabsTrigger value="videos"><Play className="h-4 w-4 mr-2" />Videos</TabsTrigger>
        </TabsList>

        <TabsContent value="trending" className="space-y-4">
          {displayPosts.map(post => <TrendingPostCard key={post.id} post={post} />)}
          {displayPosts.length === 0 && <p className="text-center text-muted-foreground py-8">No posts found</p>}
        </TabsContent>

        <TabsContent value="people" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {displayUsers.map(user => (
              <UserCard
                key={user.pubkey}
                user={user}
                isFollowing={contacts.some(c => c.pubkey === user.pubkey)}
                onFollow={() => handleFollow(user)}
              />
            ))}
          </div>
          {displayUsers.length === 0 && <p className="text-center text-muted-foreground py-8">No users found</p>}
        </TabsContent>

        <TabsContent value="photos" className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {mediaPosts.flatMap((post, pi) =>
              extractMediaUrls(post.content).filter(isImageUrl).map((url, idx) => (
                <img key={`${post.id}-${pi}-${idx}`} src={url} alt="" className="w-full aspect-square object-cover rounded-lg" loading="lazy" />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="videos" className="space-y-4">
          {videoPosts.flatMap((post, pi) =>
            extractMediaUrls(post.content).filter(isVideoUrl).map((url, idx) => (
              <div key={`${post.id}-${pi}-${idx}`} className="aspect-video rounded-lg overflow-hidden">
                <video src={url} controls className="w-full h-full object-cover" />
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const TrendingPostCard: React.FC<{ post: Post }> = ({ post }) => {
  const { profiles } = useNostrStore();
  const profile = profiles.get(post.pubkey);
  const mediaUrls = extractMediaUrls(post.content).filter(isImageUrl);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={profile?.picture} />
            <AvatarFallback>{profile?.name?.[0] || 'U'}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{profile?.display_name || profile?.name || 'Anonymous'}</p>
            <p className="text-sm text-muted-foreground line-clamp-2">{post.content.replace(/(https?:\/\/[^\s]+)/g, '').trim().slice(0, 200)}</p>
            {mediaUrls.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-1">
                {mediaUrls.slice(0, 3).map((url, idx) => (
                  <img key={idx} src={url} alt="" className="w-full aspect-square object-cover rounded" />
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const UserCard: React.FC<{ user: UserProfile; isFollowing: boolean; onFollow: () => void }> = ({ user, isFollowing, onFollow }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarImage src={user.picture} />
          <AvatarFallback>{user.name?.[0] || 'U'}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{user.display_name || user.name}</p>
          <p className="text-sm text-muted-foreground truncate">@{user.name || user.npub?.slice(0, 8)}</p>
        </div>
        <Button variant={isFollowing ? 'outline' : 'default'} size="sm" onClick={onFollow}>
          {isFollowing ? 'Following' : 'Follow'}
        </Button>
      </div>
      {user.about && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{user.about}</p>}
    </CardContent>
  </Card>
);

function extractMediaUrls(content: string): string[] {
  return (content.match(/(https?:\/\/[^\s]+)/g) || []).filter(u => isImageUrl(u) || isVideoUrl(u));
}
function isImageUrl(url: string): boolean { return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url); }
function isVideoUrl(url: string): boolean { return /\.(mp4|webm|ogg|mov)$/i.test(url) || url.includes('youtube.com') || url.includes('youtu.be'); }
