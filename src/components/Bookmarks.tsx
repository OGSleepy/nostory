import { useEffect, useState } from 'react';
import { useNostr } from '@/context/NostrContext';
import { useNostrStore } from '@/store/nostrStore';
import { PostCard } from '@/components/PostCard';
import { Bookmark, Loader2 } from 'lucide-react';
import type { Post } from '@/types/nostr';

export const Bookmarks: React.FC = () => {
  const { loadBookmarks, queryEvents } = useNostr();
  const { bookmarkedIds, isAuthenticated } = useNostrStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const load = async () => {
      setIsLoading(true);
      try {
        await loadBookmarks();
        const ids = useNostrStore.getState().bookmarkedIds;
        if (ids.length > 0) {
          const events = await queryEvents([{ ids }]);
          setPosts(events.map(e => ({
            id: e.id, pubkey: e.pubkey, content: e.content,
            created_at: e.created_at, tags: e.tags, sig: e.sig, kind: e.kind,
          })).sort((a, b) => b.created_at - a.created_at));
        }
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="text-center py-20 text-gray-500">
        <Bookmark className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">Sign in to see bookmarks</p>
      </div>
    );
  }

  if (isLoading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-white">Bookmarks</h1>
      {posts.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <Bookmark className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p>No bookmarks yet</p>
          <p className="text-sm mt-1 text-gray-700">Save posts to read later</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(p => <PostCard key={p.id} post={p} />)}
        </div>
      )}
    </div>
  );
};
