import { useNostrStore } from '@/store/nostrStore';
import { Sidebar } from '@/components/Sidebar';
import { MobileNav } from '@/components/MobileNav';
import { Header } from '@/components/Header';
import { Feed } from '@/components/Feed';
import { Explore } from '@/components/Explore';
import { CreatePost } from '@/components/CreatePost';
import { Messages } from '@/components/Messages';
import { Profile } from '@/components/Profile';
import { VideoFeed } from '@/components/VideoFeed';
import { LoginDialog } from '@/components/LoginDialog';
import { Notifications } from '@/components/Notifications';
import { Bookmarks } from '@/components/Bookmarks';

export const Layout: React.FC = () => {
  const { activeTab, isAuthenticated } = useNostrStore();

  const renderContent = () => {
    switch (activeTab) {
      case 'feed':         return <Feed />;
      case 'explore':      return <Explore />;
      case 'create':       return isAuthenticated ? <CreatePost /> : <LoginDialog />;
      case 'messages':     return isAuthenticated ? <Messages /> : <LoginDialog />;
      case 'profile':      return <Profile />;
      case 'video':        return <VideoFeed />;
      case 'notifications':return <Notifications />;
      case 'bookmarks':    return <Bookmarks />;
      default:             return <Feed />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Header />
      <div className="hidden lg:block"><Sidebar /></div>
      <main className="lg:ml-[72px] xl:ml-[244px] pt-16 pb-24 lg:pb-8 px-4">
        <div className="max-w-2xl mx-auto">{renderContent()}</div>
      </main>
      <MobileNav />
    </div>
  );
};
