import { Bell, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNostrStore } from '@/store/nostrStore';

export const Header: React.FC = () => {
  const { isAuthenticated } = useNostrStore();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-lg border-b border-white/5">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-purple-500 fill-purple-500" />
          <span className="text-xl font-bold gradient-text">Nostory</span>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="relative text-gray-400 hover:text-white hover:bg-white/10"
          >
            <Bell className="h-5 w-5" />
            {isAuthenticated && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white text-[10px] font-semibold flex items-center justify-center">
                3
              </span>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
};
