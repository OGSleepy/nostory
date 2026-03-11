import { useNostrStore } from '@/store/nostrStore';
import { Home, Compass, Plus, User, Bell } from 'lucide-react';

export const MobileNav: React.FC = () => {
  const { activeTab, setActiveTab, notifications } = useNostrStore();
  const unread = notifications.filter(n => !n.read).length;

  const navItems = [
    { id: 'feed', icon: Home },
    { id: 'explore', icon: Compass },
    { id: 'create', icon: Plus, isCenter: true },
    { id: 'notifications', icon: Bell, badge: unread },
    { id: 'profile', icon: User },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-lg border-t border-white/5 z-50 safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          if (item.isCenter) {
            return (
              <button key={item.id} onClick={() => setActiveTab(item.id as any)} className="relative -top-4">
                <div className="w-14 h-14 rounded-full gradient-bg flex items-center justify-center shadow-lg shadow-purple-500/30">
                  <Icon className="h-6 w-6 text-white" />
                </div>
              </button>
            );
          }
          return (
            <button key={item.id} onClick={() => setActiveTab(item.id as any)}
              className={`p-2 relative transition-colors ${isActive ? 'text-purple-500' : 'text-gray-500'}`}>
              <Icon className="h-6 w-6" fill={isActive ? 'currentColor' : 'none'} />
              {item.badge > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-purple-600 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
