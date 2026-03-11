import { useState, useEffect } from 'react';
import { useNostr } from '@/context/NostrContext';
import { useNostrStore } from '@/store/nostrStore';
import type { Post } from '@/types/nostr';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Heart, MessageCircle, Repeat2, Share, MoreHorizontal,
  Zap, Bookmark, Send, Loader2, BadgeCheck, EyeOff, Eye,
  Quote, VolumeX,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const ZAP_PRESETS = [21, 100, 500, 1000, 5000];

const Nip05Badge: React.FC<{ nip05: string; pubkey: string }> = ({ nip05, pubkey }) => {
  const { verifyNip05 } = useNostr();
  const [verified, setVerified] = useState<boolean | null>(null);
  useEffect(() => { verifyNip05(nip05, pubkey).then(setVerified); }, [nip05, pubkey]);
  if (!verified) return null;
  return <BadgeCheck className="h-4 w-4 text-purple-400 inline-block ml-1 flex-shrink-0" aria-label={`NIP-05: ${nip05}`} />;
};

export const PostCard: React.FC<{ post: Post }> = ({ post }) => {
  const { publishReaction, publishRepost, publishReply, deleteEvent, queryEvents, sendZap, publishQuoteRepost, muteUser, bookmarkEvent, unbookmarkEvent } = useNostr();
  const { profiles, pubkey, isAuthenticated, isBookmarked, isMuted, defaultZapAmount, nwcConnected } = useNostrStore();
  const [isLiked, setIsLiked] = useState(false);
  const [isReposted, setIsReposted] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState('');
  const [isCommenting, setIsCommenting] = useState(false);
  const [reactions, setReactions] = useState(0);
  const [reposts, setReposts] = useState(0);
  const [replyCount, setReplyCount] = useState(0);
  const [replies, setReplies] = useState<Post[]>([]);
  const [showZapDialog, setShowZapDialog] = useState(false);
  const [zapAmount, setZapAmount] = useState(() => defaultZapAmount);
  const [zapComment, setZapComment] = useState('');
  const [isZapping, setIsZapping] = useState(false);
  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [quoteComment, setQuoteComment] = useState('');
  const [isQuoting, setIsQuoting] = useState(false);
  const [cwDismissed, setCwDismissed] = useState(false);

  const profile = profiles.get(post.pubkey);
  const isOwnPost = post.pubkey === pubkey;
  const mediaUrls = extractMediaUrls(post.content);
  const textContent = renderNostrContent(stripMediaUrls(post.content));
  const contentWarning = post.tags.find(t => t[0] === 'content-warning');
  const showCW = !!contentWarning && !cwDismissed;
  const quotedId = post.tags.find(t => t[0] === 'q')?.[1];
  const bookmarked = isBookmarked(post.id);
  const muted = isMuted(post.pubkey);

  useEffect(() => {
    const load = async () => {
      const [reactionEvents, repostEvents, replyEvents] = await Promise.all([
        queryEvents([{ kinds: [7], '#e': [post.id] }]),
        queryEvents([{ kinds: [6], '#e': [post.id] }]),
        queryEvents([{ kinds: [1], '#e': [post.id] }]),
      ]);
      setReactions(reactionEvents.length);
      setIsLiked(reactionEvents.some(e => e.pubkey === pubkey));
      setReposts(repostEvents.length);
      setIsReposted(repostEvents.some(e => e.pubkey === pubkey));
      setReplyCount(replyEvents.length);
    };
    load();
  }, [post.id, pubkey]);

  if (muted) return null;

  const loadReplies = async () => {
    const events = await queryEvents([{ kinds: [1], '#e': [post.id] }]);
    setReplies(events.map(e => ({ id: e.id, pubkey: e.pubkey, content: e.content, created_at: e.created_at, tags: e.tags, sig: e.sig, kind: e.kind })));
  };

  const handleLike = async () => {
    if (!isAuthenticated) { toast.error('Sign in to like posts'); return; }
    try { await publishReaction(post.id, post.pubkey, '+'); setIsLiked(!isLiked); setReactions(p => isLiked ? p - 1 : p + 1); }
    catch { toast.error('Failed to like'); }
  };

  const handleRepost = async () => {
    if (!isAuthenticated) { toast.error('Sign in to repost'); return; }
    try {
      const events = await queryEvents([{ ids: [post.id] }]);
      if (events.length > 0) { await publishRepost(events[0]); setIsReposted(!isReposted); setReposts(p => isReposted ? p - 1 : p + 1); }
    } catch { toast.error('Failed to repost'); }
  };

  const handleQuoteRepost = async () => {
    if (!isAuthenticated || !quoteComment.trim()) return;
    setIsQuoting(true);
    try {
      const events = await queryEvents([{ ids: [post.id] }]);
      if (events.length > 0) { await publishQuoteRepost(events[0], quoteComment.trim()); toast.success('Quote posted!'); setShowQuoteDialog(false); setQuoteComment(''); }
    } catch { toast.error('Failed to quote'); } finally { setIsQuoting(false); }
  };

  const handleBookmark = async () => {
    if (!isAuthenticated) { toast.error('Sign in to bookmark'); return; }
    try {
      if (bookmarked) { await unbookmarkEvent(post.id); toast.success('Removed from bookmarks'); }
      else { await bookmarkEvent(post.id); toast.success('Bookmarked!'); }
    } catch { toast.error('Bookmark failed'); }
  };

  const handleMute = async () => {
    if (!isAuthenticated) return;
    try { await muteUser(post.pubkey); toast.success('Muted ' + (profile?.name || 'user')); }
    catch { toast.error('Mute failed'); }
  };

  const handleDelete = async () => {
    if (!isAuthenticated || !isOwnPost) return;
    try { await deleteEvent(post.id); toast.success('Post deleted'); }
    catch { toast.error('Failed to delete post'); }
  };

  const handleShare = async () => {
    try { await navigator.clipboard.writeText('https://njump.me/' + post.id); toast.success('Link copied!'); }
    catch { toast.error('Failed to copy link'); }
  };

  const handleComment = async () => {
    if (!comment.trim() || !isAuthenticated) return;
    setIsCommenting(true);
    try {
      const events = await queryEvents([{ ids: [post.id] }]);
      if (events.length > 0) { await publishReply(comment.trim(), events[0]); setComment(''); setReplyCount(p => p + 1); toast.success('Reply posted!'); await loadReplies(); }
    } catch { toast.error('Failed to post reply'); } finally { setIsCommenting(false); }
  };

  const handleZap = async () => {
    if (!isAuthenticated) { toast.error('Sign in to zap'); return; }
    setIsZapping(true);
    try {
      await sendZap(post.pubkey, post.id, zapAmount, zapComment);
      toast.success('⚡ Zapped ' + zapAmount + ' sats!');
      setShowZapDialog(false); setZapComment('');
    } catch (err: any) {
      if (err.message === 'INVOICE_COPIED') { toast.info('No WebLN wallet — invoice copied!'); setShowZapDialog(false); }
      else toast.error(err.message || 'Zap failed');
    } finally { setIsZapping(false); }
  };

  const toggleComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next && replies.length === 0) await loadReplies();
  };

  return (
    <>
      <div className="bg-[#1a1a1a] rounded-2xl p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-white/10">
              <AvatarImage src={profile?.picture} />
              <AvatarFallback className="bg-[#2a2a2a] text-gray-300">{profile?.name?.[0] || 'U'}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-1">
                <p className="font-medium text-white leading-none">{profile?.display_name || profile?.name || 'Anonymous'}</p>
                {profile?.nip05 && <Nip05Badge nip05={profile.nip05} pubkey={post.pubkey} />}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">@{profile?.name || post.pubkey.slice(0, 8)} · {formatDistanceToNow(post.created_at * 1000, { addSuffix: true })}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-gray-500 hover:text-white hover:bg-white/10">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#2a2a2a] border-white/10">
              <DropdownMenuItem onClick={handleShare} className="text-white hover:bg-white/10 cursor-pointer">
                <Share className="h-4 w-4 mr-2" /> Copy link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowQuoteDialog(true)} className="text-white hover:bg-white/10 cursor-pointer">
                <Quote className="h-4 w-4 mr-2" /> Quote repost
              </DropdownMenuItem>
              {!isOwnPost && (
                <>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem onClick={handleMute} className="text-orange-400 hover:bg-white/10 cursor-pointer">
                    <VolumeX className="h-4 w-4 mr-2" /> Mute user
                  </DropdownMenuItem>
                </>
              )}
              {isOwnPost && (
                <>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem onClick={handleDelete} className="text-red-400 hover:bg-white/10 cursor-pointer">Delete</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* NIP-36 Content Warning */}
        {showCW ? (
          <div className="border border-orange-500/30 rounded-xl p-4 bg-orange-500/5 text-center space-y-2">
            <EyeOff className="h-8 w-8 text-orange-400 mx-auto" />
            <p className="text-orange-300 font-medium text-sm">Content Warning{contentWarning[1] ? ': ' + contentWarning[1] : ''}</p>
            <Button variant="outline" size="sm" onClick={() => setCwDismissed(true)} className="border-orange-500/30 text-orange-300 hover:bg-orange-500/10 gap-1 text-xs">
              <Eye className="h-3 w-3" /> Show content
            </Button>
          </div>
        ) : (
          <>
            {textContent && <p className="text-white whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: textContent }} />}
            {mediaUrls.length > 0 && (
              <div className={`grid gap-2 ${mediaUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {mediaUrls.map((url, i) => (
                  isVideoUrl(url) ? (
                    <div key={i} className="aspect-video rounded-xl overflow-hidden bg-black">
                      <video src={url} controls className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <img key={i} src={url} alt="Post media" className="w-full rounded-xl object-cover" loading="lazy" />
                  )
                ))}
              </div>
            )}
            {quotedId && <QuotedPostPreview eventId={quotedId} />}
          </>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleLike} className={`gap-1 ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-400 hover:bg-red-500/10'}`}>
              <Heart className={`h-5 w-5 ${isLiked ? 'fill-current' : ''}`} />
              {reactions > 0 && <span className="text-sm">{reactions}</span>}
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleComments} className="gap-1 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10">
              <MessageCircle className="h-5 w-5" />
              {replyCount > 0 && <span className="text-sm">{replyCount}</span>}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={`gap-1 ${isReposted ? 'text-green-500' : 'text-gray-400 hover:text-green-400 hover:bg-green-500/10'}`}>
                  <Repeat2 className="h-5 w-5" />
                  {reposts > 0 && <span className="text-sm">{reposts}</span>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#2a2a2a] border-white/10">
                <DropdownMenuItem onClick={handleRepost} className="text-white hover:bg-white/10 cursor-pointer"><Repeat2 className="h-4 w-4 mr-2" /> Repost</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowQuoteDialog(true)} className="text-white hover:bg-white/10 cursor-pointer"><Quote className="h-4 w-4 mr-2" /> Quote</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={() => setShowZapDialog(true)} className={`${nwcConnected ? 'text-yellow-400' : 'text-gray-400'} hover:text-yellow-400 hover:bg-yellow-500/10`}>
              <Zap className="h-5 w-5" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={handleBookmark} className={bookmarked ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}>
            <Bookmark className={`h-5 w-5 ${bookmarked ? 'fill-current' : ''}`} />
          </Button>
        </div>

        {/* Comments */}
        {showComments && (
          <div className="border-t border-white/10 pt-4 space-y-4">
            {isAuthenticated && (
              <div className="flex gap-2">
                <Textarea placeholder="Write a reply…" value={comment} onChange={e => setComment(e.target.value)}
                  className="flex-1 bg-[#2a2a2a] border-white/10 text-white placeholder:text-gray-500" rows={2} />
                <Button size="icon" onClick={handleComment} disabled={!comment.trim() || isCommenting} className="self-end">
                  {isCommenting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            )}
            {replies.map(reply => {
              const rp = profiles.get(reply.pubkey);
              return (
                <div key={reply.id} className="flex gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={rp?.picture} />
                    <AvatarFallback className="bg-[#2a2a2a] text-gray-300 text-xs">{rp?.name?.[0] || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 bg-[#2a2a2a] rounded-xl p-3">
                    <p className="text-sm font-medium text-white">{rp?.name || reply.pubkey.slice(0, 8)}</p>
                    <p className="text-sm text-gray-300 mt-1">{reply.content}</p>
                    <p className="text-xs text-gray-500 mt-1">{formatDistanceToNow(reply.created_at * 1000, { addSuffix: true })}</p>
                  </div>
                </div>
              );
            })}
            {replies.length === 0 && replyCount === 0 && <p className="text-sm text-gray-500 text-center py-2">No replies yet.</p>}
          </div>
        )}
      </div>

      {/* Zap Dialog */}
      <Dialog open={showZapDialog} onOpenChange={setShowZapDialog}>
        <DialogContent className="max-w-sm bg-[#1a1a1a] border-[#2a2a2a] text-white">
          <DialogHeader><DialogTitle className="text-white flex items-center gap-2"><Zap className="h-5 w-5 text-yellow-400" />Zap {profile?.name || 'user'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {ZAP_PRESETS.map(amt => (
                <button key={amt} onClick={() => setZapAmount(amt)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${zapAmount === amt ? 'bg-yellow-500 text-black' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#3a3a3a]'}`}>⚡ {amt}</button>
              ))}
            </div>
            <Input type="number" value={zapAmount} onChange={e => setZapAmount(parseInt(e.target.value) || 0)} className="bg-[#2a2a2a] border-[#3a3a3a] text-white" placeholder="Custom amount (sats)" min={1} />
            <Input value={zapComment} onChange={e => setZapComment(e.target.value)} className="bg-[#2a2a2a] border-[#3a3a3a] text-white placeholder:text-gray-600" placeholder="Add a comment (optional)" />
            <Button onClick={handleZap} disabled={isZapping || zapAmount < 1} className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-semibold">
              {isZapping ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zapping…</> : '⚡ Zap ' + zapAmount + ' sats'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quote Dialog */}
      <Dialog open={showQuoteDialog} onOpenChange={setShowQuoteDialog}>
        <DialogContent className="max-w-md bg-[#1a1a1a] border-[#2a2a2a] text-white">
          <DialogHeader><DialogTitle className="text-white flex items-center gap-2"><Quote className="h-5 w-5 text-green-400" />Quote Repost</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Textarea value={quoteComment} onChange={e => setQuoteComment(e.target.value)} placeholder="Add your thoughts…" className="bg-[#2a2a2a] border-white/10 text-white placeholder:text-gray-500" rows={3} autoFocus />
            <div className="border border-white/10 rounded-xl p-3 bg-[#0f0f0f]">
              <p className="text-xs text-gray-600 mb-1">@{profile?.name || post.pubkey.slice(0, 8)} · {formatDistanceToNow(post.created_at * 1000, { addSuffix: true })}</p>
              <p className="text-sm text-gray-400 line-clamp-3">{post.content.slice(0, 200)}</p>
            </div>
            <Button onClick={handleQuoteRepost} disabled={isQuoting || !quoteComment.trim()} className="w-full gradient-bg text-white">
              {isQuoting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post Quote'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const QuotedPostPreview: React.FC<{ eventId: string }> = ({ eventId }) => {
  const { queryEvents } = useNostr();
  const { profiles } = useNostrStore();
  const [post, setPost] = useState<Post | null>(null);
  useEffect(() => {
    queryEvents([{ ids: [eventId], limit: 1 }]).then(events => {
      if (events[0]) setPost({ id: events[0].id, pubkey: events[0].pubkey, content: events[0].content, created_at: events[0].created_at, tags: events[0].tags, sig: events[0].sig, kind: events[0].kind });
    });
  }, [eventId]);
  if (!post) return null;
  const p = profiles.get(post.pubkey);
  return (
    <div className="border border-white/10 rounded-xl p-3 bg-[#0f0f0f]">
      <p className="text-xs text-gray-500 mb-1">@{p?.name || post.pubkey.slice(0, 8)} · {formatDistanceToNow(post.created_at * 1000, { addSuffix: true })}</p>
      <p className="text-sm text-gray-300 line-clamp-3">{post.content}</p>
    </div>
  );
};

function extractMediaUrls(content: string): string[] {
  return (content.match(/(https?:\/\/[^\s]+)/g) || []).filter(u => isImageUrl(u) || isVideoUrl(u));
}
function stripMediaUrls(content: string): string {
  return content.replace(/(https?:\/\/[^\s]+)/g, url => isImageUrl(url) || isVideoUrl(url) ? '' : url).trim();
}
function renderNostrContent(text: string): string {
  return text
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-purple-400 underline break-all">$1</a>')
    .replace(/nostr:(npub|note|naddr|nevent)1[a-z0-9]+/g, '<span class="text-purple-400">$&</span>')
    .replace(/#(\w+)/g, '<span class="text-purple-400 cursor-pointer">#$1</span>');
}
function isImageUrl(url: string): boolean { return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url); }
function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url) || url.includes('youtube.com') || url.includes('youtu.be');
}
