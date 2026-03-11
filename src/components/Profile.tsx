import { useEffect, useState } from 'react';
import { useNostr } from '@/context/NostrContext';
import { useNostrStore } from '@/store/nostrStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Grid, Bookmark, User, Settings, Edit, Copy, ExternalLink } from 'lucide-react';
import { PostCard } from '@/components/PostCard';
import { LoginDialog } from '@/components/LoginDialog';
import { KINDS } from '@/types/nostr';
import type { UserProfile, Post } from '@/types/nostr';
import { toast } from 'sonner';

export const Profile: React.FC = () => {
  const { queryEvents, publishMetadata } = useNostr();
  const { profile, setProfile, isAuthenticated: storeAuthenticated, pubkey } = useNostrStore();
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<UserProfile>>({});

  // Load user's posts
  useEffect(() => {
    const loadUserPosts = async () => {
      if (!pubkey) return;

      const events = await queryEvents([{
        kinds: [KINDS.TEXT_NOTE],
        authors: [pubkey],
        limit: 50,
      }]);

      const parsedPosts = events.map(event => ({
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        created_at: event.created_at,
        tags: event.tags,
        sig: event.sig,
        kind: event.kind,
      }));

      setUserPosts(parsedPosts);
    };

    loadUserPosts();
  }, [pubkey, queryEvents]);

  // Initialize edit form when profile loads
  useEffect(() => {
    if (profile) {
      setEditForm(profile);
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    try {
      await publishMetadata(editForm);
      setProfile({ ...profile, ...editForm } as UserProfile);
      setIsEditing(false);
      toast.success('Profile updated!');
    } catch (error) {
      toast.error('Failed to update profile');
    }
  };

  const handleCopyNpub = () => {
    if (profile?.npub) {
      navigator.clipboard.writeText(profile.npub);
      toast.success('npub copied to clipboard');
    }
  };

  // Not authenticated view
  if (!storeAuthenticated) {
    return <LoginDialog />;
  }

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          {/* Banner */}
          <div className="h-32 -mx-6 -mt-6 mb-4 bg-gradient-to-r from-primary/20 to-primary/40">
            {profile?.banner && (
              <img
                src={profile.banner}
                alt="Banner"
                className="w-full h-full object-cover"
              />
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            {/* Avatar */}
            <Avatar className="h-24 w-24 -mt-16 border-4 border-background">
              <AvatarImage src={profile?.picture} />
              <AvatarFallback className="text-2xl">
                {profile?.name?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold">
                    {profile?.display_name || profile?.name || 'Anonymous'}
                  </h1>
                  <p className="text-muted-foreground">@{profile?.name || 'user'}</p>
                </div>

                <Dialog open={isEditing} onOpenChange={setIsEditing}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Profile
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Edit Profile</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Display Name</label>
                        <Input
                          value={editForm.display_name || ''}
                          onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Username</label>
                        <Input
                          value={editForm.name || ''}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">About</label>
                        <Textarea
                          value={editForm.about || ''}
                          onChange={(e) => setEditForm({ ...editForm, about: e.target.value })}
                          rows={3}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Profile Picture URL</label>
                        <Input
                          value={editForm.picture || ''}
                          onChange={(e) => setEditForm({ ...editForm, picture: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Banner URL</label>
                        <Input
                          value={editForm.banner || ''}
                          onChange={(e) => setEditForm({ ...editForm, banner: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Website</label>
                        <Input
                          value={editForm.website || ''}
                          onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">NIP-05 Identifier</label>
                        <Input
                          value={editForm.nip05 || ''}
                          onChange={(e) => setEditForm({ ...editForm, nip05: e.target.value })}
                          placeholder="name@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Lightning Address</label>
                        <Input
                          value={editForm.lud16 || ''}
                          onChange={(e) => setEditForm({ ...editForm, lud16: e.target.value })}
                          placeholder="user@wallet.com"
                        />
                      </div>
                      <Button onClick={handleSaveProfile} className="w-full">
                        Save Changes
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Bio */}
              {profile?.about && (
                <p className="mt-2 whitespace-pre-wrap">{profile.about}</p>
              )}

              {/* Links */}
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                {profile?.website && (
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {profile.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {profile?.nip05 && (
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {profile.nip05}
                  </span>
                )}
              </div>

              {/* Stats */}
              <div className="flex gap-6 mt-4">
                <div>
                  <span className="font-semibold">{userPosts.length}</span>
                  <span className="text-muted-foreground ml-1">posts</span>
                </div>
                <div>
                  <span className="font-semibold">0</span>
                  <span className="text-muted-foreground ml-1">followers</span>
                </div>
                <div>
                  <span className="font-semibold">0</span>
                  <span className="text-muted-foreground ml-1">following</span>
                </div>
              </div>

              {/* Npub */}
              <div className="flex items-center gap-2 mt-4 p-2 bg-muted rounded-lg">
                <code className="text-xs flex-1 truncate">
                  {profile?.npub || pubkey}
                </code>
                <Button variant="ghost" size="sm" onClick={handleCopyNpub}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Tabs */}
      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="posts">
            <Grid className="h-4 w-4 mr-2" />
            Posts
          </TabsTrigger>
          <TabsTrigger value="saved">
            <Bookmark className="h-4 w-4 mr-2" />
            Saved
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4">
          {userPosts.length > 0 ? (
            userPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No posts yet</p>
              <p className="text-sm">Create your first post to get started!</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="saved" className="space-y-4">
          <div className="text-center py-12 text-muted-foreground">
            <Bookmark className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No saved posts yet</p>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="font-semibold">Account Settings</h3>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <Settings className="h-4 w-4 mr-2" />
                  Preferences
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <User className="h-4 w-4 mr-2" />
                  Privacy
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
