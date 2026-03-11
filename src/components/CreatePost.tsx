import React, { useState, useRef } from 'react';
import { useNostr } from '@/context/NostrContext';
import { useNostrStore } from '@/store/nostrStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Image, Video, X, Sparkles, Loader2, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { LongFormEditor } from '@/components/LongFormEditor';

export const CreatePost: React.FC = () => {
  const { publishTextNote, uploadFile } = useNostr();
  const { profile } = useNostrStore();
  const [content, setContent] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!content.trim() && mediaUrls.length === 0) return;
    setIsPosting(true);
    try {
      let fullContent = content.trim();
      if (mediaUrls.length > 0) fullContent += '\n\n' + mediaUrls.join('\n');
      await publishTextNote(fullContent);
      toast.success('Post published!');
      setContent('');
      setMediaUrls([]);
    } catch {
      toast.error('Failed to publish post');
    } finally {
      setIsPosting(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadProgress(0);
    // Simulate progress while uploading (Blossom doesn't stream progress)
    const interval = setInterval(() => setUploadProgress(p => Math.min((p ?? 0) + 10, 85)), 200);
    try {
      const url = await uploadFile(file);
      clearInterval(interval);
      setUploadProgress(100);
      setMediaUrls(prev => [...prev, url]);
      setTimeout(() => setUploadProgress(null), 600);
      toast.success('Media uploaded via Blossom!');
    } catch (err: any) {
      clearInterval(interval);
      setUploadProgress(null);
      toast.error(err.message || 'Upload failed');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await handleFileUpload(file);
  };

  const handleRemoveMedia = (index: number) => setMediaUrls(prev => prev.filter((_, i) => i !== index));

  const isVideoUrl = (url: string) => /\.(mp4|webm|ogg|mov)$/i.test(url);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="note">
        <TabsList className="w-full grid grid-cols-2 bg-[#1a1a1a]">
          <TabsTrigger value="note" className="data-[state=active]:bg-[#2a2a2a] text-gray-400 data-[state=active]:text-white gap-2">
            <Sparkles className="h-4 w-4" /> Note
          </TabsTrigger>
          <TabsTrigger value="article" className="data-[state=active]:bg-[#2a2a2a] text-gray-400 data-[state=active]:text-white gap-2">
            <PenLine className="h-4 w-4" /> Article
          </TabsTrigger>
        </TabsList>
        <TabsContent value="note">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Create Post
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={profile?.picture} />
            <AvatarFallback>{profile?.name?.[0] || 'U'}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{profile?.display_name || profile?.name || 'Anonymous'}</p>
            <p className="text-sm text-muted-foreground">@{profile?.name || 'user'}</p>
          </div>
        </div>

        <Textarea
          placeholder="What's on your mind?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
          className="min-h-[120px] resize-none"
        />

        {uploadProgress !== null && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Uploading to Blossom (primal.net)…</p>
            <Progress value={uploadProgress} className="h-1.5" />
          </div>
        )}

        {mediaUrls.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {mediaUrls.map((url, index) => (
              <div key={index} className="relative group">
                {isVideoUrl(url) ? (
                  <video src={url} className="w-full h-32 object-cover rounded-lg" muted />
                ) : (
                  <img src={url} alt="Media preview" className="w-full h-32 object-cover rounded-lg" />
                )}
                <button
                  onClick={() => handleRemoveMedia(index)}
                  className="absolute top-2 right-2 bg-background/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Hidden file inputs */}
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadProgress !== null}
            >
              {uploadProgress !== null ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Image className="h-5 w-5 mr-2" />}
              Photo
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => videoInputRef.current?.click()}
              disabled={uploadProgress !== null}
            >
              <Video className="h-5 w-5 mr-2" />
              Video
            </Button>
          </div>
          <Button onClick={handleSubmit} disabled={(!content.trim() && mediaUrls.length === 0) || isPosting}>
            {isPosting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Posting…</> : 'Post'}
          </Button>
        </div>
      </CardContent>
    </Card>
        </TabsContent>
        <TabsContent value="article">
          <LongFormEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
};
