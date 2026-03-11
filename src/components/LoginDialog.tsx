import React, { useState } from 'react';
import { useNostr } from '@/context/NostrContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Chrome, Key, Info, Wifi } from 'lucide-react';

export const LoginDialog: React.FC = () => {
  const { loginWithExtension, loginWith_nsec, loginWithBunker } = useNostr();
  const [nsec, setNsec] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const withLoading = async (fn: () => Promise<boolean>) => {
    setIsLoading(true);
    setError('');
    try {
      const success = await fn();
      if (!success) setError('Login failed. Please check your credentials and try again.');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to NostrSocial</CardTitle>
          <CardDescription>Sign in with your Nostr identity to start sharing</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="extension" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="extension">Extension</TabsTrigger>
              <TabsTrigger value="nsec">Private Key</TabsTrigger>
              <TabsTrigger value="bunker">Bunker</TabsTrigger>
            </TabsList>

            {/* NIP-07 Extension */}
            <TabsContent value="extension" className="space-y-4">
              <div className="text-center py-4">
                <Chrome className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-4">
                  Use a NIP-07 browser extension like Alby or nos2x to sign in securely.
                </p>
                <Button onClick={() => withLoading(loginWithExtension)} disabled={isLoading} className="w-full">
                  {isLoading ? 'Connecting…' : 'Sign in with Extension'}
                </Button>
              </div>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Browser extensions keep your private key secure and never expose it to websites.
                </AlertDescription>
              </Alert>
            </TabsContent>

            {/* nsec */}
            <TabsContent value="nsec" className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Key className="h-5 w-5" />
                  <span className="text-sm">Enter your nsec private key</span>
                </div>
                <Input
                  type="password"
                  placeholder="nsec1…"
                  value={nsec}
                  onChange={(e) => setNsec(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && nsec.trim() && withLoading(() => loginWith_nsec(nsec.trim()))}
                />
                <Button onClick={() => withLoading(() => loginWith_nsec(nsec.trim()))} disabled={isLoading || !nsec.trim()} className="w-full">
                  {isLoading ? 'Connecting…' : 'Sign in with nsec'}
                </Button>
              </div>
              <Alert variant="destructive">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Only enter your nsec on trusted devices. Consider using a browser extension instead.
                </AlertDescription>
              </Alert>
            </TabsContent>

            {/* NIP-46 Bunker */}
            <TabsContent value="bunker" className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Wifi className="h-5 w-5" />
                  <span className="text-sm">Connect with a remote signer</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste a <code className="bg-muted px-1 rounded">bunker://</code> URI from Amber, nsecbunker, or nsec.app. Your key never leaves your signer device.
                </p>
                <Input
                  placeholder="bunker://pubkey?relay=wss://…&secret=…"
                  value={bunkerUri}
                  onChange={(e) => setBunkerUri(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && bunkerUri.trim() && withLoading(() => loginWithBunker(bunkerUri.trim()))}
                />
                <Button onClick={() => withLoading(() => loginWithBunker(bunkerUri.trim()))} disabled={isLoading || !bunkerUri.trim()} className="w-full">
                  {isLoading ? 'Connecting to signer…' : 'Connect Bunker'}
                </Button>
              </div>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Compatible with Amber (Android), nsecbunker, and nsec.app. Uses NIP-46 — your private key stays on your device.
                </AlertDescription>
              </Alert>
            </TabsContent>
          </Tabs>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
