import { useEffect, useState } from 'react';
import { use$ } from 'applesauce-react/hooks';
import { useNostr } from '@/context/NostrContext';
import { eventStore } from '@/context/NostrContext';
import { useNostrStore } from '@/store/nostrStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Grid, Bookmark, Settings, Edit, Copy, ExternalLink, Wifi, WifiOff, Plus, Trash2, Zap } from 'lucide-react';
import { PostCard } from '@/components/PostCard';
import { WalletConnect } from '@/components/WalletConnect';
import { LoginDialog } from '@/components/LoginDialog';
import { KINDS, DEFAULT_RELAYS } from '@/types/nostr';
import type { UserProfile, Post } from '@/types/nostr';
import { toast } from 'sonner';

export const Profile: React.FC = () => {
  const { queryEvents, publishMetadata } = useNostr();
  const { isAuthenticated: storeAuthenticated, pubkey, nwcConnected, defaultZapAmount, setDefaultZapAmount } = useNostrStore();
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<UserProfile>>({});
  const [activeTab, setActiveTab] = useState<'posts' | 'saved' | 'settings'>('posts');
  const [relays, setRelays] = useState<string[]>(DEFAULT_RELAYS);
  const [newRelay, setNewRelay] = useState('');
  const [zapAmount, setZapAmount] = useState(defaultZapAmount);
  const [walletOpen, setWalletOpen] = useState(false);

  // ── applesauce: reactive profile via EventStore + ProfileModel ──
  // Subscribes to the EventStore observable for this pubkey's kind:0 event.
  // Auto-updates whenever a profile event lands in the store (postLogin, feed load, etc.)
  const appleProfile = use$(() => pubkey ? eventStore.profile(pubkey) : undefined, [pubkey]);

  // If store doesn't have it yet, trigger a fetch and add to EventStore
  useEffect(() => {
    if (!pubkey || appleProfile) return;
    queryEvents([{ kinds: [KINDS.METADATA], authors: [pubkey], limit: 1 }]).then((events) => {
      if (events[0]) eventStore.add(events[0]);
    });
  }, [pubkey, appleProfile]);

  // Load user's posts
  useEffect(() => {
    const loadUserPosts = async () => {
      if (!pubkey) return;
      const events = await queryEvents([{ kinds: [KINDS.TEXT_NOTE], authors: [pubkey], limit: 50 }]);
      setUserPosts(events.map(e => ({
        id: e.id, pubkey: e.pubkey, content: e.content,
        created_at: e.created_at, tags: e.tags, sig: e.sig, kind: e.kind,
      })));
    };
    loadUserPosts();
  }, [pubkey, queryEvents]);

  // Seed edit form when applesauce profile arrives
  useEffect(() => {
    if (appleProfile) {
      setEditForm({
        display_name: appleProfile.displayName,
        name: appleProfile.name,
        about: appleProfile.about,
        picture: appleProfile.picture,
        banner: appleProfile.banner,
        website: appleProfile.website,
        nip05: appleProfile?.nip05,
        lud16: (appleProfile as any).lud16 ?? (appleProfile as any).lightningAddress,
      });
    }
  }, [appleProfile]);

  const handleSaveProfile = async () => {
    try {
      await publishMetadata(editForm);
      setIsEditing(false);
      toast.success('Profile updated!');
    } catch {
      toast.error('Failed to update profile');
    }
  };

  const handleCopyPubkey = () => {
    if (pubkey) { navigator.clipboard.writeText(pubkey); toast.success('Public key copied!'); }
  };

  const handleAddRelay = () => {
    const url = newRelay.trim();
    if (!url.startsWith('wss://') && !url.startsWith('ws://')) { toast.error('Relay URL must start with wss://'); return; }
    if (relays.includes(url)) { toast.error('Relay already added'); return; }
    setRelays([...relays, url]);
    setNewRelay('');
    toast.success('Relay added');
  };

  const handleRemoveRelay = (url: string) => {
    setRelays(relays.filter(r => r !== url));
    toast.success('Relay removed');
  };

  if (!storeAuthenticated) return <LoginDialog />;

  const displayName = appleProfile?.displayName || appleProfile?.name || 'Anonymous';
  const username = appleProfile?.name || 'user';
  const npubShort = pubkey ? `${pubkey.slice(0, 20)}…` : '';

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <Card>
        <CardContent className="p-0 overflow-hidden rounded-lg">
          <div className="h-32 bg-gradient-to-r from-purple-900/60 to-blue-900/60">
            {appleProfile?.banner && <img src={appleProfile.banner} alt="Banner" className="w-full h-full object-cover" />}
          </div>

          <div className="px-6 pb-6">
            <div className="flex items-start justify-between -mt-12 mb-4">
              <Avatar className="h-24 w-24 border-4 border-background">
                <AvatarImage src={appleProfile?.picture} />
                <AvatarFallback className="text-2xl bg-muted">{displayName[0]?.toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>

              <Dialog open={isEditing} onOpenChange={setIsEditing}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="mt-14">
                    <Edit className="h-4 w-4 mr-2" /> Edit Profile
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    {[
                      { label: 'Display Name', key: 'display_name' },
                      { label: 'Username', key: 'name' },
                      { label: 'Profile Picture URL', key: 'picture' },
                      { label: 'Banner URL', key: 'banner' },
                      { label: 'Website', key: 'website' },
                      { label: 'NIP-05 Identifier', key: 'nip05', placeholder: 'name@example.com' },
                      { label: 'Lightning Address', key: 'lud16', placeholder: 'user@wallet.com' },
                    ].map(({ label, key, placeholder }) => (
                      <div key={key} className="space-y-2">
                        <label className="text-sm font-medium">{label}</label>
                        <Input value={(editForm as any)[key] || ''} placeholder={placeholder}
                          onChange={e => setEditForm({ ...editForm, [key]: e.target.value })} />
                      </div>
                    ))}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">About</label>
                      <Textarea value={editForm.about || ''} rows={3}
                        onChange={e => setEditForm({ ...editForm, about: e.target.value })} />
                    </div>
                    <Button onClick={handleSaveProfile} className="w-full">Save Changes</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <h1 className="text-2xl font-bold">{displayName}</h1>
            <p className="text-muted-foreground">@{username}</p>
            {appleProfile?.about && <p className="mt-2 text-sm whitespace-pre-wrap">{appleProfile.about}</p>}

            <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
              {appleProfile?.website && (
                <a href={appleProfile.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary">
                  <ExternalLink className="h-4 w-4" />{appleProfile.website.replace(/^https?:\/\//, '')}
                </a>
              )}
              {appleProfile?.nip05 && <span className="text-green-400 text-xs">✓ {appleProfile?.nip05}</span>}
            </div>

            <div className="flex gap-6 mt-4">
              <div><span className="font-semibold">{userPosts.length}</span><span className="text-muted-foreground ml-1">posts</span></div>
              <div><span className="font-semibold">0</span><span className="text-muted-foreground ml-1">followers</span></div>
              <div><span className="font-semibold">0</span><span className="text-muted-foreground ml-1">following</span></div>
            </div>

            <button onClick={handleCopyPubkey}
              className="flex items-center gap-2 mt-4 p-2 bg-muted rounded-lg w-full text-left hover:bg-muted/80 transition-colors">
              <code className="text-xs flex-1 truncate text-muted-foreground">{npubShort}</code>
              <Copy className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['posts', 'saved', 'settings'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            <span className="flex items-center justify-center gap-1">
              {tab === 'posts' && <><Grid className="h-4 w-4" /> Posts</>}
              {tab === 'saved' && <><Bookmark className="h-4 w-4" /> Saved</>}
              {tab === 'settings' && <><Settings className="h-4 w-4" /> Settings</>}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'posts' && (
        <div className="space-y-4">
          {userPosts.length > 0 ? userPosts.map(post => <PostCard key={post.id} post={post} />) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No posts yet</p><p className="text-sm">Create your first post to get started!</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'saved' && (
        <div className="text-center py-12 text-muted-foreground">
          <Bookmark className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No saved posts yet</p>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-4">
          {/* Relay Management */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Wifi className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Relay Management</h3>
              </div>
              <p className="text-xs text-muted-foreground">Relays are servers that store and forward your Nostr events.</p>
              <div className="space-y-2">
                {relays.map(relay => (
                  <div key={relay} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <code className="text-xs truncate max-w-[220px]">{relay}</code>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveRelay(relay)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={newRelay} onChange={e => setNewRelay(e.target.value)}
                  placeholder="wss://relay.example.com" className="text-sm"
                  onKeyDown={e => e.key === 'Enter' && handleAddRelay()} />
                <Button size="sm" onClick={handleAddRelay}><Plus className="h-4 w-4" /></Button>
              </div>
              <Button variant="outline" size="sm" className="w-full text-xs"
                onClick={() => { setRelays(DEFAULT_RELAYS); toast.success('Reset to default relays'); }}>
                <WifiOff className="h-3 w-3 mr-1" /> Reset to Defaults
              </Button>
            </CardContent>
          </Card>

          {/* Wallet / NWC */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  <h3 className="font-semibold">Lightning Wallet</h3>
                </div>
                <Badge variant={nwcConnected ? 'default' : 'secondary'} className="text-xs">
                  {nwcConnected ? 'Connected' : 'Not connected'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Connect a wallet via Nostr Wallet Connect (NIP-47) to send zaps.</p>
              <Button variant="outline" className="w-full" onClick={() => setWalletOpen(true)}>
                <Zap className="h-4 w-4 mr-2" />{nwcConnected ? 'Manage Wallet' : 'Connect Wallet'}
              </Button>
              <WalletConnect open={walletOpen} onOpenChange={setWalletOpen} />
              <div className="space-y-2 pt-2 border-t border-border">
                <label className="text-sm font-medium">Default Zap Amount (sats)</label>
                <div className="flex gap-2">
                  <Input type="number" value={zapAmount} min={1} className="text-sm"
                    onChange={e => setZapAmount(Number(e.target.value))} />
                  <Button size="sm" onClick={() => { setDefaultZapAmount(zapAmount); toast.success(`Default zap: ${zapAmount} sats`); }}>Save</Button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[21, 100, 500, 1000, 5000].map(amt => (
                    <button key={amt} onClick={() => setZapAmount(amt)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${zapAmount === amt ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                      {amt}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logout */}
          <Card>
            <CardContent className="p-4">
              <Button variant="destructive" className="w-full"
                onClick={() => { useNostrStore.getState().logout(); toast.success('Logged out'); }}>
                Log Out
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
