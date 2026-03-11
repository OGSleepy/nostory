import { NostrProvider } from '@/context/NostrContext';
import { Layout } from '@/components/Layout';
import { Toaster } from '@/components/ui/sonner';
import './App.css';

function App() {
  return (
    <NostrProvider>
      <Layout />
      <Toaster position="bottom-right" />
    </NostrProvider>
  );
}

export default App;
