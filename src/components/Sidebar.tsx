import React, { useState } from 'react';
import { useNostrStore } from '@/store/nostrStore';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Home, Compass, PlusSquare, MessageCircle, User, Play, Bell, Bookmark, LogOut, Wallet } from 'lucide-react';
import { WalletConnect } from '@/components/WalletConnect';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, profile, isAuthenticated, logout, notifications, nwcConnected } = useNostrStore();
  const [showWallet, setShowWallet] = useState(false);
  const unread = notifications.filter(n => !n.read).length;

  const navItems: Array<{ id: string; icon: React.ElementType; label: string; badge?: number }> = [
    { id: 'feed', icon: Home, label: 'Home' },
    { id: 'explore', icon: Compass, label: 'Explore' },
    { id: 'video', icon: Play, label: 'Reels' },
    { id: 'notifications', icon: Bell, label: 'Notifications', badge: unread },
    { id: 'messages', icon: MessageCircle, label: 'Messages' },
    { id: 'bookmarks', icon: Bookmark, label: 'Bookmarks' },
    { id: 'create', icon: PlusSquare, label: 'Create' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  return (
    <aside className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] bg-[#0a0a0a] border-r border-white/5 z-40 w-[72px] xl:w-[244px] flex flex-col">
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <Button key={item.id} variant="ghost"
              className={`w-full justify-start gap-4 h-12 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl relative ${isActive ? 'bg-white/10 text-white' : ''}`}
              onClick={() => setActiveTab(item.id as Parameters<typeof setActiveTab>[0])}>
              <div className="relative">
                <Icon className="h-6 w-6" />
                {(item.badge ?? 0) > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-4 min-w-4 p-0 text-[10px] bg-purple-600 text-white border-0 flex items-center justify-center">
                    {(item.badge ?? 0) > 99 ? '99+' : item.badge}
                  </Badge>
                )}
              </div>
              <span className="hidden xl:block">{item.label}</span>
            </Button>
          );
        })}
      </nav>
      <div className="p-4 border-t border-white/5">
        {isAuthenticated && profile ? (
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-white/10">
              <AvatarImage src={profile.picture} />
              <AvatarFallback className="bg-[#2a2a2a] text-gray-300">{profile.name?.[0] || 'U'}</AvatarFallback>
            </Avatar>
            <div className="hidden xl:block flex-1 min-w-0">
              <p className="font-medium text-white truncate">{profile.display_name || profile.name}</p>
              <p className="text-sm text-gray-500 truncate">@{profile.name}</p>
            </div>
            <Button variant="ghost" size="icon" className="hidden xl:flex text-gray-400 hover:text-white hover:bg-white/10" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full border-white/10 text-white hover:bg-white/10" onClick={() => setActiveTab('profile')}>
            <User className="h-4 w-4 mr-2" /><span className="hidden xl:block">Sign In</span>
          </Button>
        )}
        {isAuthenticated && (
          <Button
            variant="ghost"
            onClick={() => setShowWallet(true)}
            className={`w-full justify-start gap-3 mt-1 ${nwcConnected ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-400 hover:text-white'} hover:bg-white/10`}
          >
            <Wallet className="h-5 w-5 shrink-0" />
            <span className="hidden xl:block text-sm">{nwcConnected ? '⚡ Wallet Connected' : 'Connect Wallet'}</span>
          </Button>
        )}
      </div>
      <WalletConnect open={showWallet} onOpenChange={setShowWallet} />
    </aside>
  );
};
