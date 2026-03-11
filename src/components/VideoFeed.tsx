import { useEffect, useState, useRef } from 'react';
import { useNostr } from '@/context/NostrContext';
import { useNostrStore } from '@/store/nostrStore';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Heart, MessageCircle, Share, Zap, Search, Play, Send, Loader2, X } from 'lucide-react';
import { KINDS } from '@/types/nostr';
import type { Post } from '@/types/nostr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface VideoPost extends Post { videoUrl: string; thumbnail?: string; title?: string; }

const ZAP_PRESETS = [21, 100, 500, 1000];

export const VideoFeed: React.FC = () => {
  const { queryEvents, publishReaction, publishReply, sendZap } = useNostr();
  const { profiles, addProfile, addPosts, pubkey, isAuthenticated } = useNostrStore();
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const videoRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Comments state
  const [commentTarget, setCommentTarget] = useState<VideoPost | null>(null);
  const [comment, setComment] = useState('');
  const [isCommenting, setIsCommenting] = useState(false);
  const [videoReplies, setVideoReplies] = useState<Map<string, Post[]>>(new Map());

  // Zap state
  const [zapTarget, setZapTarget] = useState<VideoPost | null>(null);
  const [zapAmount, setZapAmount] = useState(21);
  const [zapComment, setZapComment] = useState('');
  const [isZapping, setIsZapping] = useState(false);

  // Reactions state
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadVideos = async () => {
      const events = await queryEvents([{ kinds: [KINDS.TEXT_NOTE], limit: 100 }]);
      const videoPosts: VideoPost[] = [];
      events.forEach(event => {
        extractVideoUrls(event.content).forEach(url => {
          videoPosts.push({
            id: event.id, pubkey: event.pubkey, content: event.content,
            created_at: event.created_at, tags: event.tags, sig: event.sig, kind: event.kind,
            videoUrl: url, title: extractTitle(event.content),
          });
        });
      });
      setVideos(videoPosts);
      addPosts(videoPosts);
      const pkeys = [...new Set(videoPosts.map(v => v.pubkey))];
      if (pkeys.length > 0) {
        const profs = await queryEvents([{ kinds: [KINDS.METADATA], authors: pkeys }]);
        profs.forEach(event => {
          try { addProfile({ pubkey: event.pubkey, npub: event.pubkey, ...JSON.parse(event.content) }); } catch {}
        });
      }
    };
    loadVideos();
  }, [queryEvents, addProfile, addPosts]);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const videoId = entry.target.getAttribute('data-video-id');
          if (videoId) setPlayingVideo(videoId);
        }
      });
    }, { threshold: 0.6 });
    videoRefs.current.forEach(ref => { if (ref) observer.observe(ref); });
    return () => observer.disconnect();
  }, [videos]);

  const handleLike = async (video: VideoPost) => {
    if (!isAuthenticated) { toast.error('Sign in to like videos'); return; }
    try {
      await publishReaction(video.id, video.pubkey, '+');
      setLikedVideos(prev => { const s = new Set(prev); s.has(video.id) ? s.delete(video.id) : s.add(video.id); return s; });
    } catch { toast.error('Failed to like'); }
  };

  const handleShare = async (video: VideoPost) => {
    try { await navigator.clipboard.writeText(video.videoUrl); toast.success('Video link copied!'); }
    catch { toast.error('Failed to copy'); }
  };

  const openComments = async (video: VideoPost) => {
    setCommentTarget(video);
    if (!videoReplies.has(video.id)) {
      const events = await queryEvents([{ kinds: [1], '#e': [video.id] }]);
      const replies = events.map(e => ({ id: e.id, pubkey: e.pubkey, content: e.content, created_at: e.created_at, tags: e.tags, sig: e.sig, kind: e.kind }));
      setVideoReplies(prev => new Map(prev).set(video.id, replies));
    }
  };

  const handleComment = async () => {
    if (!comment.trim() || !commentTarget || !isAuthenticated) return;
    setIsCommenting(true);
    try {
      const events = await queryEvents([{ ids: [commentTarget.id] }]);
      if (events.length > 0) {
        await publishReply(comment.trim(), events[0]);
        setComment('');
        toast.success('Reply posted!');
        const updated = await queryEvents([{ kinds: [1], '#e': [commentTarget.id] }]);
        setVideoReplies(prev => new Map(prev).set(commentTarget.id, updated.map(e => ({
          id: e.id, pubkey: e.pubkey, content: e.content, created_at: e.created_at, tags: e.tags, sig: e.sig, kind: e.kind,
        }))));
      }
    } catch { toast.error('Failed to post reply'); }
    finally { setIsCommenting(false); }
  };

  const handleZap = async () => {
    if (!zapTarget || !isAuthenticated) return;
    setIsZapping(true);
    try {
      await sendZap(zapTarget.pubkey, zapTarget.id, zapAmount, zapComment);
      toast.success(`⚡ Zapped ${zapAmount} sats!`);
      setZapTarget(null);
      setZapComment('');
    } catch (err: any) {
      if (err.message === 'INVOICE_COPIED') toast.info('No WebLN wallet — Lightning invoice copied to clipboard!');
      else toast.error(err.message || 'Zap failed');
      setZapTarget(null);
    } finally { setIsZapping(false); }
  };

  const filteredVideos = searchQuery
    ? videos.filter(v => v.content.toLowerCase().includes(searchQuery.toLowerCase()) || v.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : videos;

  const replies = commentTarget ? videoReplies.get(commentTarget.id) || [] : [];

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search videos…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filteredVideos.map((video) => {
          const profile = profiles.get(video.pubkey);
          const isPlaying = playingVideo === video.id;
          const isLiked = likedVideos.has(video.id);

          return (
            <div
              key={video.id}
              ref={el => { if (el) videoRefs.current.set(video.id, el); }}
              data-video-id={video.id}
              className="bg-[#1a1a1a] rounded-2xl overflow-hidden"
            >
              <div className="aspect-video bg-black relative">
                {isPlaying ? (
                  <video src={video.videoUrl} autoPlay muted loop controls className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center cursor-pointer" onClick={() => setPlayingVideo(video.id)}>
                    <img
                      src={`https://img.youtube.com/vi/${extractVideoId(video.videoUrl)}/0.jpg`}
                      alt="Thumbnail"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play className="h-16 w-16 text-white opacity-80" />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.picture} />
                    <AvatarFallback>{profile?.name?.[0] || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{video.title || 'Untitled Video'}</p>
                    <p className="text-sm text-gray-400">{profile?.name || 'Anonymous'} · {formatDistanceToNow(video.created_at * 1000, { addSuffix: true })}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleLike(video)}
                    className={`text-gray-400 hover:text-red-400 ${isLiked ? 'text-red-500' : ''}`}>
                    <Heart className={`h-4 w-4 mr-1 ${isLiked ? 'fill-current' : ''}`} /> Like
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openComments(video)}
                    className="text-gray-400 hover:text-blue-400">
                    <MessageCircle className="h-4 w-4 mr-1" /> Comment
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleShare(video)}
                    className="text-gray-400 hover:text-white">
                    <Share className="h-4 w-4 mr-1" /> Share
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setZapTarget(video); setZapAmount(21); }}
                    className="text-gray-400 hover:text-yellow-400">
                    <Zap className="h-4 w-4 mr-1" /> Zap
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredVideos.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No videos found</p>
        </div>
      )}

      {/* Comments Dialog */}
      <Dialog open={!!commentTarget} onOpenChange={(open) => { if (!open) setCommentTarget(null); }}>
        <DialogContent className="max-w-md bg-[#1a1a1a] border-[#2a2a2a] text-white max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center justify-between">
              <span>Comments</span>
              <button onClick={() => setCommentTarget(null)} className="text-gray-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {replies.map(reply => {
              const rp = profiles.get(reply.pubkey);
              return (
                <div key={reply.id} className="flex gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={rp?.picture} />
                    <AvatarFallback className="bg-[#2a2a2a] text-xs">{rp?.name?.[0] || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 bg-[#2a2a2a] rounded-xl p-3">
                    <p className="text-sm font-medium text-white">{rp?.name || reply.pubkey.slice(0, 8)}</p>
                    <p className="text-sm text-gray-300 mt-0.5">{reply.content}</p>
                    <p className="text-xs text-gray-500 mt-1">{formatDistanceToNow(reply.created_at * 1000, { addSuffix: true })}</p>
                  </div>
                </div>
              );
            })}
            {replies.length === 0 && <p className="text-center text-gray-500 text-sm py-4">No comments yet.</p>}
          </div>
          {isAuthenticated && (
            <div className="flex gap-2 pt-3 border-t border-white/10">
              <Textarea
                placeholder="Add a comment…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="flex-1 bg-[#2a2a2a] border-white/10 text-white placeholder:text-gray-500 resize-none"
                rows={2}
              />
              <Button size="icon" onClick={handleComment} disabled={!comment.trim() || isCommenting} className="self-end">
                {isCommenting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Zap Dialog */}
      <Dialog open={!!zapTarget} onOpenChange={(open) => { if (!open) setZapTarget(null); }}>
        <DialogContent className="max-w-sm bg-[#1a1a1a] border-[#2a2a2a] text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-400" />
              Zap {zapTarget ? profiles.get(zapTarget.pubkey)?.name || 'user' : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {ZAP_PRESETS.map(amt => (
                <button key={amt} onClick={() => setZapAmount(amt)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${zapAmount === amt ? 'bg-yellow-500 text-black' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#3a3a3a]'}`}>
                  ⚡ {amt}
                </button>
              ))}
            </div>
            <Input type="number" value={zapAmount} onChange={(e) => setZapAmount(parseInt(e.target.value) || 0)}
              className="bg-[#2a2a2a] border-[#3a3a3a] text-white" placeholder="Custom amount (sats)" min={1} />
            <Input value={zapComment} onChange={(e) => setZapComment(e.target.value)}
              className="bg-[#2a2a2a] border-[#3a3a3a] text-white placeholder:text-gray-600" placeholder="Add a comment (optional)" />
            <Button onClick={handleZap} disabled={isZapping || zapAmount < 1}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-semibold">
              {isZapping ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zapping…</> : `⚡ Zap ${zapAmount} sats`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function extractVideoUrls(content: string): string[] {
  return (content.match(/(https?:\/\/[^\s]+)/g) || []).filter(url =>
    /\.(mp4|webm|ogg|mov)$/i.test(url) || url.includes('youtube.com') || url.includes('youtu.be')
  );
}
function extractTitle(content: string): string | undefined {
  const first = content.split('\n')[0].trim();
  return (first && first.length < 100 && !first.startsWith('http')) ? first : undefined;
}
function extractVideoId(url: string): string {
  return url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)?.[1] || '';
}
