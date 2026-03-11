import React, { useState } from 'react';
import { Zap, Wallet, Link, Unlink, RefreshCw, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNostr } from '@/context/NostrContext';
import { useNostrStore } from '@/store/nostrStore';
import { toast } from 'sonner';

interface WalletConnectProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRESET_AMOUNTS = [21, 100, 500, 1000, 5000];

export const WalletConnect: React.FC<WalletConnectProps> = ({ open, onOpenChange }) => {
  const { connectNWC, disconnectNWC, getWalletBalance } = useNostr();
  const { nwcConnected, walletBalance, defaultZapAmount, setDefaultZapAmount } = useNostrStore();

  const [nwcInput, setNwcInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleConnect = async () => {
    if (!nwcInput.trim()) return;
    if (!nwcInput.startsWith('nostr+walletconnect://')) {
      toast.error('Invalid NWC URI — must start with nostr+walletconnect://');
      return;
    }
    setIsConnecting(true);
    try {
      await connectNWC(nwcInput.trim());
      toast.success('⚡ Wallet connected!');
      setNwcInput('');
    } catch (e: any) {
      toast.error('Failed to connect: ' + e.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnectNWC();
    toast.success('Wallet disconnected');
  };

  const handleRefreshBalance = async () => {
    setIsRefreshing(true);
    try {
      const bal = await getWalletBalance();
      if (bal !== null) toast.success(`Balance: ${bal.toLocaleString()} sats`);
    } catch {
      toast.error('Could not fetch balance');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-[#2a2a2a] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Wallet className="h-5 w-5 text-yellow-400" />
            Nostr Wallet Connect
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Connection status */}
          {nwcConnected ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span className="text-green-400 font-medium text-sm">Wallet Connected</span>
              </div>

              {/* Balance */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Balance</p>
                  <p className="text-xl font-bold text-white">
                    {walletBalance !== null
                      ? `${walletBalance.toLocaleString()} sats`
                      : '—'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshBalance}
                  disabled={isRefreshing}
                  className="text-gray-400 hover:text-white"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                <Unlink className="h-4 w-4 mr-2" />
                Disconnect Wallet
              </Button>
            </div>
          ) : (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-400" />
                <span className="text-yellow-400 font-medium text-sm">No wallet connected</span>
              </div>
              <p className="text-xs text-gray-400">
                Connect a NWC-compatible wallet to zap instantly without leaving the app.
              </p>
            </div>
          )}

          {/* Connect new wallet */}
          {!nwcConnected && (
            <div className="space-y-3">
              <Label className="text-gray-300 text-sm">NWC Connection URI</Label>
              <Input
                value={nwcInput}
                onChange={e => setNwcInput(e.target.value)}
                placeholder="nostr+walletconnect://..."
                className="bg-[#2a2a2a] border-[#3a3a3a] text-white placeholder:text-gray-600 text-xs font-mono"
              />
              <Button
                onClick={handleConnect}
                disabled={isConnecting || !nwcInput.trim()}
                className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-semibold"
              >
                {isConnecting ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Connecting…</>
                ) : (
                  <><Link className="h-4 w-4 mr-2" />Connect Wallet</>
                )}
              </Button>

              {/* Compatible wallets */}
              <div className="space-y-2 pt-1">
                <p className="text-xs text-gray-500">Compatible wallets:</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: 'Alby', url: 'https://getalby.com' },
                    { name: 'Mutiny', url: 'https://mutinywallet.com' },
                    { name: 'Wallet of Satoshi', url: 'https://walletofsatoshi.com' },
                  ].map(w => (
                    <a
                      key={w.name}
                      href={w.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 bg-[#2a2a2a] rounded-lg px-2 py-1.5"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {w.name}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Default zap amount */}
          <div className="space-y-3">
            <Label className="text-gray-300 text-sm">Default Zap Amount</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_AMOUNTS.map(amt => (
                <button
                  key={amt}
                  onClick={() => setDefaultZapAmount(amt)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    defaultZapAmount === amt
                      ? 'bg-yellow-500 text-black'
                      : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#3a3a3a]'
                  }`}
                >
                  ⚡ {amt}
                </button>
              ))}
            </div>
            <Input
              type="number"
              value={defaultZapAmount}
              onChange={e => setDefaultZapAmount(parseInt(e.target.value) || 21)}
              className="bg-[#2a2a2a] border-[#3a3a3a] text-white"
              placeholder="Custom default amount"
              min={1}
            />
          </div>

          {/* NWC active indicator */}
          {nwcConnected && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Zap className="h-3 w-3 text-yellow-400" />
              Zaps will be sent automatically via your connected wallet
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
