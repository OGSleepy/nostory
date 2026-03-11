import { useEffect, useState } from 'react';
import { useNostr } from '@/context/NostrContext';
import { useNostrStore } from '@/store/nostrStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDistanceToNow } from 'date-fns';
import {
  Heart, MessageCircle, Repeat2, Zap, UserPlus,
  AtSign, CheckCheck, Bell, Loader2,
} from 'lucide-react';
import type { AppNotification } from '@/types/nostr';

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  reaction:  <Heart className="h-4 w-4 text-pink-500" />,
  reply:     <MessageCircle className="h-4 w-4 text-blue-400" />,
  repost:    <Repeat2 className="h-4 w-4 text-green-400" />,
  zap:       <Zap className="h-4 w-4 text-yellow-400" />,
  follow:    <UserPlus className="h-4 w-4 text-purple-400" />,
  mention:   <AtSign className="h-4 w-4 text-blue-300" />,
  quote:     <MessageCircle className="h-4 w-4 text-indigo-400" />,
};

const NOTIF_LABELS: Record<string, string> = {
  reaction: 'liked your note',
  reply: 'replied to you',
  repost: 'reposted your note',
  zap: 'zapped you',
  follow: 'followed you',
  mention: 'mentioned you',
  quote: 'quoted your note',
};

export const Notifications: React.FC = () => {
  const { loadNotifications } = useNostr();
  const { notifications, profiles, markAllNotificationsRead, isAuthenticated } = useNostrStore();
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    loadNotifications().finally(() => setIsLoading(false));
  }, [isAuthenticated]);

  useEffect(() => {
    markAllNotificationsRead();
  }, []);

  const filtered = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'zaps') return n.type === 'zap';
    if (filter === 'reactions') return n.type === 'reaction';
    if (filter === 'mentions') return n.type === 'reply' || n.type === 'mention' || n.type === 'quote';
    if (filter === 'follows') return n.type === 'follow';
    return true;
  });

  if (!isAuthenticated) {
    return (
      <div className="text-center py-20 text-gray-500">
        <Bell className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">Sign in to see notifications</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Notifications</h1>
        {notifications.some(n => !n.read) && (
          <Button variant="ghost" size="sm" onClick={markAllNotificationsRead}
            className="text-purple-400 hover:text-purple-300 text-xs gap-1">
            <CheckCheck className="h-3 w-3" /> Mark all read
          </Button>
        )}
      </div>

      <Tabs value={filter} onValueChange={setFilter} className="w-full">
        <TabsList className="w-full grid grid-cols-5 bg-[#1a1a1a] p-1 rounded-xl">
          {['all', 'mentions', 'reactions', 'zaps', 'follows'].map(f => (
            <TabsTrigger key={f} value={f}
              className="data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white text-gray-500 rounded-lg text-xs capitalize">
              {f}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading && notifications.length === 0 && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-gray-600">
          <Bell className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p>No notifications yet</p>
        </div>
      )}

      <div className="space-y-1">
        {filtered.map(notif => (
          <NotifRow key={notif.id} notif={notif} profiles={profiles} />
        ))}
      </div>
    </div>
  );
};

const NotifRow: React.FC<{
  notif: AppNotification;
  profiles: Map<string, any>;
}> = ({ notif, profiles }) => {
  const profile = profiles.get(notif.pubkey);
  const name = profile?.display_name || profile?.name || notif.pubkey.slice(0, 8) + '…';
  const timeAgo = formatDistanceToNow(new Date(notif.created_at * 1000), { addSuffix: true });

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl transition-colors hover:bg-white/5 ${!notif.read ? 'bg-purple-500/5' : ''}`}>
      <div className="relative flex-shrink-0">
        <Avatar className="h-10 w-10 border border-white/10">
          <AvatarImage src={profile?.picture} />
          <AvatarFallback className="bg-[#2a2a2a] text-gray-300 text-sm">
            {name[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#1a1a1a] rounded-full flex items-center justify-center">
          {NOTIF_ICONS[notif.type]}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-white text-sm">{name}</span>
          <span className="text-gray-400 text-sm">{NOTIF_LABELS[notif.type]}</span>
          {notif.type === 'zap' && notif.amount && (
            <Badge variant="outline" className="border-yellow-500/30 text-yellow-400 text-xs">
              ⚡ {Math.round(notif.amount / 1000).toLocaleString()} sats
            </Badge>
          )}
        </div>
        {notif.content && notif.type !== 'zap' && (
          <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{notif.content}</p>
        )}
        <p className="text-gray-600 text-xs mt-1">{timeAgo}</p>
      </div>

      {!notif.read && (
        <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0 mt-1.5" />
      )}
    </div>
  );
};
