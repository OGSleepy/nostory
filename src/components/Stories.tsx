import { useEffect, useState, useCallback, useRef } from 'react';
import { useNostr } from '@/context/NostrContext';
import { useNostrStore } from '@/store/nostrStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, X, ChevronRight, ImageIcon, Video, Loader2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import type { Story, UserProfile } from '@/types/nostr';
import { toast } from 'sonner';

interface StoryGroup {
  pubkey: string;
  profile?: UserProfile;
  stories: Story[];
  hasUnviewed: boolean;
}

export const Stories: React.FC = () => {
  const { loadStories, subscribeEvents, queryEvents, publishStory, uploadFile, publishReply, publishReaction } = useNostr();
  const { stories, profiles, addProfile, addStories, markStoryViewed, isAuthenticated } = useNostrStore();
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<StoryGroup | null>(null);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const STORY_DURATION = 5000; // 5 seconds per story

  // Story creation state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createMediaUrl, setCreateMediaUrl] = useState('');
  const [createMediaType, setCreateMediaType] = useState<'image' | 'video'>('image');
  const [createCaption, setCreateCaption] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [storyReply, setStoryReply] = useState('');
  const [showStoryReply, setShowStoryReply] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const imageStoryRef = useRef<HTMLInputElement>(null);
  const videoStoryRef = useRef<HTMLInputElement>(null);

  // Load stories on mount
  useEffect(() => {
    loadStories();
  }, [loadStories]);

  // Subscribe to new stories
  useEffect(() => {
    const setupSubscription = async () => {
      const unsubscribe = await subscribeEvents(
        [{ kinds: [30315], since: Math.floor(Date.now() / 1000) }],
        (event) => {
          const urlTag = event.tags.find(t => t[0] === 'url');
          const mediaTypeTag = event.tags.find(t => t[0] === 'm');
          const expirationTag = event.tags.find(t => t[0] === 'expiration');

          // Only show media stories — skip plain text status updates
          const mediaUrl = urlTag?.[1];
          if (!mediaUrl) return;
          const mimeType = mediaTypeTag?.[1] ?? '';
          const isMedia = mimeType.startsWith('image/') || mimeType.startsWith('video/')
            || /\.(jpe?g|png|gif|webp|avif|mp4|mov|webm)(\?|$)/i.test(mediaUrl);
          if (!isMedia) return;

          const newStory: Story = {
            id: event.id,
            pubkey: event.pubkey,
            content: event.content,
            created_at: event.created_at,
            expires_at: expirationTag ? parseInt(expirationTag[1]) : event.created_at + 24 * 60 * 60,
            tags: event.tags,
            sig: event.sig,
            kind: event.kind,
            mediaUrl,
            mediaType: mimeType.startsWith('video/') ? 'video' : 'image',
          };

          addStories([newStory]);
        }
      );
      return unsubscribe;
    };

    let unsubscribe: (() => void) | undefined;
    setupSubscription().then(unsub => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [subscribeEvents, addStories]);

  // Load profiles for story authors
  useEffect(() => {
    const loadStoryProfiles = async () => {
      const authorPubkeys = [...new Set(stories.map(s => s.pubkey))];
      const profilesToLoad = authorPubkeys.filter(p => !profiles.has(p));

      if (profilesToLoad.length > 0) {
        const events = await queryEvents([{
          kinds: [0],
          authors: profilesToLoad,
        }]);

        events.forEach(event => {
          try {
            const data = JSON.parse(event.content);
            addProfile({ pubkey: event.pubkey, npub: event.pubkey, ...data });
          } catch {
            // Ignore invalid profiles
          }
        });
      }
    };

    loadStoryProfiles();
  }, [stories, profiles, addProfile, queryEvents]);

  // Group stories by author
  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const activeStories = stories.filter(s => s.expires_at > now);

    const groups = new Map<string, Story[]>();
    activeStories.forEach(story => {
      const existing = groups.get(story.pubkey) || [];
      groups.set(story.pubkey, [...existing, story]);
    });

    const grouped: StoryGroup[] = Array.from(groups.entries()).map(([pubkey, userStories]) => ({
      pubkey,
      profile: profiles.get(pubkey),
      stories: userStories.sort((a, b) => a.created_at - b.created_at),
      hasUnviewed: userStories.some(s => !s.viewed),
    }));

    setStoryGroups(grouped);
  }, [stories, profiles]);

  // Story viewer progress
  useEffect(() => {
    if (isViewerOpen && selectedGroup) {
      setProgress(0);

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      const startTime = Date.now();
      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const newProgress = (elapsed / STORY_DURATION) * 100;

        if (newProgress >= 100) {
          handleNextStory();
        } else {
          setProgress(newProgress);
        }
      }, 50);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isViewerOpen, selectedGroup, currentStoryIndex]);

  const handleOpenStory = (group: StoryGroup, index: number = 0) => {
    setSelectedGroup(group);
    setCurrentStoryIndex(index);
    setIsViewerOpen(true);

    // Mark current story as viewed
    const story = group.stories[index];
    if (story && !story.viewed) {
      markStoryViewed(story.id);
    }
  };

  const handleNextStory = useCallback(() => {
    if (!selectedGroup) return;

    if (currentStoryIndex < selectedGroup.stories.length - 1) {
      const nextIndex = currentStoryIndex + 1;
      setCurrentStoryIndex(nextIndex);
      const nextStory = selectedGroup.stories[nextIndex];
      if (nextStory && !nextStory.viewed) {
        markStoryViewed(nextStory.id);
      }
    } else {
      // Move to next user's stories or close
      const currentGroupIndex = storyGroups.findIndex(g => g.pubkey === selectedGroup.pubkey);
      if (currentGroupIndex < storyGroups.length - 1) {
        const nextGroup = storyGroups[currentGroupIndex + 1];
        setSelectedGroup(nextGroup);
        setCurrentStoryIndex(0);
        if (nextGroup.stories[0] && !nextGroup.stories[0].viewed) {
          markStoryViewed(nextGroup.stories[0].id);
        }
      } else {
        setIsViewerOpen(false);
        setSelectedGroup(null);
        setCurrentStoryIndex(0);
      }
    }
  }, [selectedGroup, currentStoryIndex, storyGroups, markStoryViewed]);

  const handlePrevStory = () => {
    if (!selectedGroup) return;

    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1);
    } else {
      // Move to previous user's stories
      const currentGroupIndex = storyGroups.findIndex(g => g.pubkey === selectedGroup.pubkey);
      if (currentGroupIndex > 0) {
        const prevGroup = storyGroups[currentGroupIndex - 1];
        setSelectedGroup(prevGroup);
        setCurrentStoryIndex(prevGroup.stories.length - 1);
      }
    }
  };

  const handleCreateStory = () => {
    setCreateMediaUrl('');
    setCreateCaption('');
    setCreateMediaType('image');
    setUploadProgress(null);
    setIsCreateOpen(true);
  };

  const handleFileUpload = async (file: File, type: 'image' | 'video') => {
    setCreateMediaType(type);
    setUploadProgress(0);
    const interval = setInterval(() => setUploadProgress(p => Math.min((p ?? 0) + 12, 85)), 200);
    try {
      const url = await uploadFile(file);
      clearInterval(interval);
      setUploadProgress(100);
      setCreateMediaUrl(url);
      setTimeout(() => setUploadProgress(null), 600);
      toast.success('Uploaded to Blossom!');
    } catch (err: any) {
      clearInterval(interval);
      setUploadProgress(null);
      toast.error(err.message || 'Upload failed');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await handleFileUpload(file, type);
  };

  const handlePublishStory = async () => {
    if (!createMediaUrl) {
      toast.error('Please upload a photo or video first');
      return;
    }
    setIsPublishing(true);
    try {
      const event = await publishStory(createMediaUrl, createMediaType, createCaption.trim() || undefined);
      if (event) {
        toast.success('Story published! It will expire in 24 hours.');
        setIsCreateOpen(false);
        setCreateMediaUrl('');
        setCreateCaption('');
      } else {
        toast.error('Failed to publish story — make sure you are logged in.');
      }
    } catch (err) {
      toast.error('Failed to publish story.');
      console.error(err);
    } finally {
      setIsPublishing(false);
    }
  };

  const currentStory = selectedGroup?.stories[currentStoryIndex];

  return (
    <>
      {/* Stories Bar */}
      <div className="bg-[#1a1a1a] rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide">
          {/* Your Story */}
          {isAuthenticated && (
            <button
              onClick={handleCreateStory}
              className="flex flex-col items-center gap-2 flex-shrink-0"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-purple-500 flex items-center justify-center bg-[#2a2a2a]">
                  <Plus className="w-6 h-6 text-purple-400" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center">
                  <Plus className="w-3 h-3 text-white" />
                </div>
              </div>
              <span className="text-xs text-gray-400">Your Story</span>
            </button>
          )}

          {/* Contact Stories */}
          {storyGroups.map((group) => (
            <button
              key={group.pubkey}
              onClick={() => handleOpenStory(group)}
              className="flex flex-col items-center gap-2 flex-shrink-0"
            >
              <div className={`relative p-[2px] rounded-full ${
                group.hasUnviewed
                  ? 'bg-gradient-to-tr from-purple-500 via-pink-500 to-yellow-500'
                  : 'bg-gray-700'
              }`}>
                <Avatar className="w-16 h-16 border-2 border-[#1a1a1a]">
                  <AvatarImage src={group.profile?.picture} />
                  <AvatarFallback className="bg-[#2a2a2a] text-gray-300">
                    {group.profile?.name?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
              <span className="text-xs text-gray-400 truncate max-w-[64px]">
                {group.profile?.name || 'User'}
              </span>
            </button>
          ))}

          {/* Scroll indicator */}
          {storyGroups.length > 4 && (
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center">
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          )}
        </div>
      </div>

      {/* Story Viewer */}
      <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
        <DialogContent className="max-w-md p-0 bg-black border-0 overflow-hidden">
          {currentStory && selectedGroup && (
            <div className="relative aspect-[9/16] bg-black">
              {/* Progress Bars */}
              <div className="absolute top-4 left-4 right-4 z-20 flex gap-1">
                {selectedGroup.stories.map((_, idx) => (
                  <div
                    key={idx}
                    className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden"
                  >
                    <div
                      className="h-full bg-white transition-all duration-100"
                      style={{
                        width: idx < currentStoryIndex ? '100%' :
                               idx === currentStoryIndex ? `${progress}%` : '0%'
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Header */}
              <div className="absolute top-8 left-4 right-4 z-20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8 border border-white/30">
                    <AvatarImage src={selectedGroup.profile?.picture} />
                    <AvatarFallback>{selectedGroup.profile?.name?.[0] || 'U'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-white text-sm font-medium">
                      {selectedGroup.profile?.name || 'Anonymous'}
                    </p>
                    <p className="text-white/60 text-xs">
                      {new Date(currentStory.created_at * 1000).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsViewerOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>

              {/* Media */}
              <div className="w-full h-full flex items-center justify-center">
                {currentStory.mediaType === 'video' ? (
                  <video
                    src={currentStory.mediaUrl}
                    autoPlay
                    muted
                    loop
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src={currentStory.mediaUrl}
                    alt="Story"
                    className="w-full h-full object-contain"
                  />
                )}
              </div>

              {/* Caption */}
              {currentStory.content && (
                <div className="absolute bottom-20 left-4 right-4 z-20">
                  <p className="text-white text-sm bg-black/50 backdrop-blur-sm rounded-lg p-3">
                    {currentStory.content}
                  </p>
                </div>
              )}

              {/* Navigation Areas */}
              <div className="absolute inset-0 flex">
                <button
                  onClick={handlePrevStory}
                  className="w-1/3 h-full"
                  aria-label="Previous story"
                />
                <button
                  onClick={handleNextStory}
                  className="w-2/3 h-full"
                  aria-label="Next story"
                />
              </div>

              {/* Story Reply Input */}
              {showStoryReply && (
                <div className="absolute bottom-20 left-4 right-4 z-30 flex gap-2">
                  <Input
                    placeholder="Reply to story…"
                    value={storyReply}
                    onChange={(e) => setStoryReply(e.target.value)}
                    className="flex-1 bg-black/70 border-white/20 text-white placeholder:text-white/50 backdrop-blur-sm"
                    autoFocus
                  />
                  <Button
                    size="icon"
                    disabled={!storyReply.trim() || isSendingReply}
                    className="bg-purple-600 hover:bg-purple-700"
                    onClick={async () => {
                      if (!currentStory || !storyReply.trim()) return;
                      setIsSendingReply(true);
                      try {
                        const events = await queryEvents([{ ids: [currentStory.id] }]);
                        if (events.length > 0) {
                          await publishReply(storyReply.trim(), events[0]);
                          setStoryReply('');
                          setShowStoryReply(false);
                          toast.success('Reply sent!');
                        }
                      } catch { toast.error('Failed to send reply'); }
                      finally { setIsSendingReply(false); }
                    }}
                  >
                    {isSendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="absolute bottom-4 left-4 right-4 z-20 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
                  onClick={() => setShowStoryReply(prev => !prev)}
                >
                  Reply
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
                  onClick={async () => {
                    if (!currentStory) return;
                    try {
                      await publishReaction(currentStory.id, currentStory.pubkey, '🔥');
                      toast.success('Reacted with 🔥');
                    } catch { toast.error('Failed to react'); }
                  }}
                >
                  🔥 React
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Story Dialog — Kind 30315 (Ephemeral Story) */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-sm bg-[#1a1a1a] border-[#2a2a2a] text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 flex-wrap">
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-500 via-pink-500 to-yellow-500 flex items-center justify-center">
                <Plus className="w-3 h-3 text-white" />
              </div>
              New Story
              <span className="ml-auto text-xs font-normal text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
                Kind 30315 · Expires in 24h
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Hidden file inputs */}
            <input ref={imageStoryRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => handleFileChange(e, 'image')} />
            <input ref={videoStoryRef} type="file" accept="video/*" className="hidden"
              onChange={(e) => handleFileChange(e, 'video')} />

            {/* Upload buttons */}
            {!createMediaUrl && uploadProgress === null && (
              <div className="flex rounded-lg overflow-hidden border border-[#2a2a2a]">
                <button
                  onClick={() => imageStoryRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-4 text-sm bg-[#2a2a2a] text-gray-400 hover:text-white hover:bg-[#3a3a3a] transition-colors"
                >
                  <ImageIcon className="w-5 h-5" /> Photo
                </button>
                <button
                  onClick={() => videoStoryRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-4 text-sm bg-[#2a2a2a] text-gray-400 hover:text-white hover:bg-[#3a3a3a] transition-colors border-l border-[#3a3a3a]"
                >
                  <Video className="w-5 h-5" /> Video
                </button>
              </div>
            )}

            {/* Upload progress */}
            {uploadProgress !== null && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 text-center">Uploading to Blossom (primal.net)…</p>
                <Progress value={uploadProgress} className="h-1.5" />
              </div>
            )}

            {/* Preview */}
            {createMediaUrl && (
              <div className="relative rounded-lg overflow-hidden bg-black aspect-[9/16] max-h-64 flex items-center justify-center">
                {createMediaType === 'video' ? (
                  <video src={createMediaUrl} className="w-full h-full object-contain" muted controls />
                ) : (
                  <img src={createMediaUrl} alt="Preview" className="w-full h-full object-contain" />
                )}
                <button
                  onClick={() => setCreateMediaUrl('')}
                  className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white hover:bg-black"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Caption */}
            {createMediaUrl && (
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400">Caption (optional)</label>
                <Textarea
                  placeholder="Add a caption..."
                  value={createCaption}
                  onChange={(e) => setCreateCaption(e.target.value)}
                  rows={2}
                  className="bg-[#2a2a2a] border-[#3a3a3a] text-white placeholder:text-gray-600 text-sm resize-none"
                />
              </div>
            )}

            <Button
              onClick={handlePublishStory}
              disabled={isPublishing || !createMediaUrl || uploadProgress !== null}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border-0"
            >
              {isPublishing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Publishing...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> Share Story</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
