import { useState, useRef } from 'react';
import { useNostr } from '@/context/NostrContext';
import { useNostrStore } from '@/store/nostrStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  PenLine, Eye, Image as ImageIcon, Loader2,
  Bold, Italic, Link, Code, List, Quote,
} from 'lucide-react';

// Very light Markdown → HTML renderer for preview
function renderMd(md: string): string {
  return md
    .replace(/^#{3}\s(.+)$/gm, '<h3 class="text-lg font-bold mt-4 mb-2 text-white">$1</h3>')
    .replace(/^#{2}\s(.+)$/gm, '<h2 class="text-xl font-bold mt-6 mb-2 text-white">$1</h2>')
    .replace(/^#{1}\s(.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-3 text-white">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-[#1a1a1a] px-1.5 py-0.5 rounded text-purple-300 text-sm font-mono">$1</code>')
    .replace(/^>\s(.+)$/gm, '<blockquote class="border-l-4 border-purple-500/50 pl-4 italic text-gray-400 my-2">$1</blockquote>')
    .replace(/^-\s(.+)$/gm, '<li class="ml-4 list-disc text-gray-300">$1</li>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-purple-400 underline" target="_blank">$1</a>')
    .replace(/!\[(.+?)\]\((.+?)\)/g, '<img src="$2" alt="$1" class="rounded-xl max-w-full my-3" />')
    .replace(/\n\n/g, '</p><p class="mb-3 text-gray-300">')
    .replace(/^(?!<[hblipcaqi])(.+)$/gm, '<p class="mb-3 text-gray-300">$1</p>');
}

export const LongFormEditor: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { publishLongForm, uploadFile } = useNostr();
  const { isAuthenticated } = useNostrStore();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [content, setContent] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const insertMarkdown = (before: string, after: string = '', placeholder = 'text') => {
    const el = contentRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const selected = value.slice(s, e) || placeholder;
    const newText = value.slice(0, s) + before + selected + after + value.slice(e);
    setContent(newText);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    }, 0);
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingCover(true);
    try {
      const url = await uploadFile(file);
      setCoverImage(url);
    } catch {
      toast.error('Cover upload failed');
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Title and content are required');
      return;
    }
    setIsPublishing(true);
    try {
      const event = await publishLongForm(title, content, summary || undefined, coverImage || undefined);
      if (event) {
        toast.success('Article published!');
        onClose?.();
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to publish');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PenLine className="h-5 w-5 text-purple-400" />
          <h1 className="text-xl font-bold text-white">Write Article</h1>
          <Badge variant="outline" className="border-purple-500/30 text-purple-400 text-xs">NIP-23</Badge>
        </div>
        <Button onClick={handlePublish} disabled={isPublishing || !title || !content || !isAuthenticated}
          className="gradient-bg text-white gap-2">
          {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
          Publish
        </Button>
      </div>

      {/* Cover image */}
      <div className="relative">
        {coverImage ? (
          <div className="relative group rounded-xl overflow-hidden h-48">
            <img src={coverImage} alt="Cover" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="text-white border-white/30">
                Change
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCoverImage('')} className="text-white border-white/30">
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full h-24 rounded-xl border-2 border-dashed border-white/10 hover:border-purple-500/50 transition-colors flex items-center justify-center gap-2 text-gray-500 hover:text-gray-300"
          >
            {isUploadingCover ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <><ImageIcon className="h-5 w-5" /><span className="text-sm">Add cover image</span></>
            )}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
      </div>

      {/* Title */}
      <Input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Article title…"
        className="bg-[#1a1a1a] border-white/10 text-white text-xl font-bold placeholder:text-gray-600 h-14"
      />

      {/* Summary */}
      <Input
        value={summary}
        onChange={e => setSummary(e.target.value)}
        placeholder="Short summary (optional)…"
        className="bg-[#1a1a1a] border-white/10 text-gray-300 placeholder:text-gray-600"
      />

      {/* Editor / Preview tabs */}
      <Tabs defaultValue="write" className="w-full">
        <div className="flex items-center justify-between mb-2">
          <TabsList className="bg-[#1a1a1a]">
            <TabsTrigger value="write" className="data-[state=active]:bg-[#2a2a2a] text-gray-400 data-[state=active]:text-white gap-1 text-sm">
              <PenLine className="h-3 w-3" /> Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="data-[state=active]:bg-[#2a2a2a] text-gray-400 data-[state=active]:text-white gap-1 text-sm">
              <Eye className="h-3 w-3" /> Preview
            </TabsTrigger>
          </TabsList>

          {/* Toolbar */}
          <div className="flex gap-1">
            {[
              { icon: <Bold className="h-3 w-3" />, action: () => insertMarkdown('**', '**', 'bold') },
              { icon: <Italic className="h-3 w-3" />, action: () => insertMarkdown('*', '*', 'italic') },
              { icon: <Code className="h-3 w-3" />, action: () => insertMarkdown('`', '`', 'code') },
              { icon: <Link className="h-3 w-3" />, action: () => insertMarkdown('[', '](url)', 'link text') },
              { icon: <Quote className="h-3 w-3" />, action: () => insertMarkdown('\n> ', '', 'quote') },
              { icon: <List className="h-3 w-3" />, action: () => insertMarkdown('\n- ', '', 'item') },
            ].map((btn, i) => (
              <Button key={i} variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-white" onClick={btn.action}>
                {btn.icon}
              </Button>
            ))}
          </div>
        </div>

        <TabsContent value="write">
          <Textarea
            ref={contentRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your article in Markdown…&#10;&#10;# Heading&#10;**bold**, *italic*, `code`&#10;> blockquote&#10;- list item"
            className="bg-[#1a1a1a] border-white/10 text-gray-200 placeholder:text-gray-600 font-mono text-sm min-h-[400px] resize-none"
          />
          <p className="text-xs text-gray-600 mt-1 text-right">{content.length} chars</p>
        </TabsContent>

        <TabsContent value="preview">
          <div className="bg-[#1a1a1a] rounded-xl p-6 min-h-[400px] border border-white/10">
            {content ? (
              <div
                className="prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMd(content) }}
              />
            ) : (
              <p className="text-gray-600 italic text-sm">Nothing to preview yet…</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
