import { NostrProvider } from '@/context/NostrContext';
import { Layout } from '@/components/Layout';
import { Toaster } from '@/components/ui/sonner';
import { SpeedInsights } from '@vercel/speed-insights/react';

function App() {
  return (
    <NostrProvider>
      <Layout />
      <Toaster position="bottom-right" />
      <SpeedInsights />
    </NostrProvider>
  );
}

export default App;
