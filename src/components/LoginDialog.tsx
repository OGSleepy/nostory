import React, { useState } from 'react';
import { useNostr } from '@/context/NostrContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Chrome, Key, Info, Wifi, Sparkles, Copy, Check, ShieldAlert } from 'lucide-react';

export const LoginDialog: React.FC = () => {
  const { loginWithExtension, loginWith_nsec, loginWithBunker, createAccount } = useNostr();
  const [nsec, setNsec] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Create account flow
  const [createdNsec, setCreatedNsec] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

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

  const handleCreateAccount = async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await createAccount();
      if (result) {
        setCreatedNsec(result.nsec);
      } else {
        setError('Failed to create account. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (createdNsec) {
      navigator.clipboard.writeText(createdNsec);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to Nostory</CardTitle>
          <CardDescription>Sign in with your Nostr identity to start sharing</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="create">New</TabsTrigger>
              <TabsTrigger value="extension">Extension</TabsTrigger>
              <TabsTrigger value="nsec">nsec</TabsTrigger>
              <TabsTrigger value="bunker">Bunker</TabsTrigger>
            </TabsList>

            {/* Create Account */}
            <TabsContent value="create" className="space-y-4">
              {!createdNsec ? (
                <div className="text-center py-4 space-y-4">
                  <Sparkles className="h-12 w-12 mx-auto text-purple-400" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-white">New to Nostr?</p>
                    <p className="text-xs text-muted-foreground">
                      Generate a fresh keypair instantly. You own your identity — no email, no phone, no password.
                    </p>
                  </div>
                  <Button
                    onClick={handleCreateAccount}
                    disabled={isLoading}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {isLoading ? 'Generating…' : 'Create My Account'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-2 text-yellow-400">
                    <ShieldAlert className="h-5 w-5 flex-shrink-0" />
                    <p className="text-sm font-semibold">Save your private key now</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This is your <strong>nsec</strong> — your Nostr private key. It is the only way to recover your account.
                    There is no password reset. Store it somewhere safe.
                  </p>
                  <div className="relative">
                    <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-3 pr-10 font-mono text-xs text-gray-300 break-all select-all">
                      {createdNsec}
                    </div>
                    <button
                      onClick={handleCopy}
                      className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer group" onClick={() => setConfirmed(c => !c)}>
                    <div className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border transition-colors flex items-center justify-center ${confirmed ? 'bg-purple-600 border-purple-600' : 'border-white/30'}`}>
                      {confirmed && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-xs text-gray-400 group-hover:text-gray-300">
                      I've saved my nsec somewhere safe. I understand there is no way to recover my account without it.
                    </span>
                  </label>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      You're already logged in. Tap below once you've backed up your key.
                    </AlertDescription>
                  </Alert>
                  <Button
                    disabled={!confirmed}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40"
                  >
                    I've saved it — let's go
                  </Button>
                </div>
              )}
            </TabsContent>

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
                  Paste a <code className="bg-muted px-1 rounded">bunker://</code> URI from Amber, nsecbunker, or nsec.app.
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
                  Compatible with Amber (Android), nsecbunker, and nsec.app. Your private key stays on your device.
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
