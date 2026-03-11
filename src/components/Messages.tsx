import { useEffect, useState, useRef } from 'react';
import { useNostr } from '@/context/NostrContext';
import { useNostrStore } from '@/store/nostrStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Search, MessageSquare } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { KINDS } from '@/types/nostr';
import type { Contact } from '@/types/nostr';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export const Messages: React.FC = () => {
  const { queryEvents, subscribeEvents, publishDM, signer } = useNostr();
  const { pubkey, contacts, addMessage, getMessages, profiles, addProfile } = useNostrStore();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [conversations, setConversations] = useState<Contact[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversations
  useEffect(() => {
    const loadConversations = async () => {
      if (!pubkey) return;

      // Get DMs where user is involved
      const dms = await queryEvents([{
        kinds: [KINDS.ENCRYPTED_DM],
        '#p': [pubkey],
        limit: 100,
      }]);

      // Also get DMs sent by user
      const sentDms = await queryEvents([{
        kinds: [KINDS.ENCRYPTED_DM],
        authors: [pubkey],
        limit: 100,
      }]);

      const allDms = [...dms, ...sentDms];

      // Extract unique conversation partners
      const partnerPubkeys = new Set<string>();
      allDms.forEach(event => {
        if (event.pubkey === pubkey) {
          // User sent this, recipient is in tags
          const recipient = event.tags.find(t => t[0] === 'p')?.[1];
          if (recipient) partnerPubkeys.add(recipient);
        } else {
          // Received from someone
          partnerPubkeys.add(event.pubkey);
        }
      });

      // Create contact list from partners
      const conversationContacts: Contact[] = Array.from(partnerPubkeys).map(pubkey => {
        const existingContact = contacts.find(c => c.pubkey === pubkey);
        return existingContact || { pubkey };
      });

      setConversations(conversationContacts);

      // Load profiles for contacts
      if (partnerPubkeys.size > 0) {
        const profiles = await queryEvents([{
          kinds: [KINDS.METADATA],
          authors: Array.from(partnerPubkeys),
        }]);

        profiles.forEach(event => {
          try {
            const data = JSON.parse(event.content);
            addProfile({ pubkey: event.pubkey, npub: event.pubkey, ...data });
          } catch {
            // Ignore invalid profiles
          }
        });
      }

      // Decrypt and add messages to store
      for (const event of allDms) {
        const isSent = event.pubkey === pubkey;
        const partnerPubkey = isSent
          ? event.tags.find(t => t[0] === 'p')?.[1]
          : event.pubkey;

        if (!partnerPubkey) continue;

        try {
          let decrypted = '';
          if (signer?.nip04) {
            decrypted = await signer.nip04.decrypt(partnerPubkey, event.content);
          }

          addMessage(partnerPubkey, {
            id: event.id,
            pubkey: event.pubkey,
            content: event.content,
            created_at: event.created_at,
            decrypted,
          });
        } catch {
          // Failed to decrypt, add encrypted message
          addMessage(partnerPubkey, {
            id: event.id,
            pubkey: event.pubkey,
            content: event.content,
            created_at: event.created_at,
          });
        }
      }
    };

    loadConversations();
  }, [pubkey, queryEvents, addMessage, contacts, addProfile, signer]);

  // Subscribe to new messages
  useEffect(() => {
    if (!pubkey) return;

    const setupSubscription = async () => {
      const unsubscribe = await subscribeEvents(
        [{
          kinds: [KINDS.ENCRYPTED_DM],
          '#p': [pubkey],
          since: Math.floor(Date.now() / 1000),
        }],
        async (event: NostrEvent) => {
          try {
            let decrypted = '';
            if (signer?.nip04) {
              decrypted = await signer.nip04.decrypt(event.pubkey, event.content);
            }

            addMessage(event.pubkey, {
              id: event.id,
              pubkey: event.pubkey,
              content: event.content,
              created_at: event.created_at,
              decrypted,
            });
          } catch {
            addMessage(event.pubkey, {
              id: event.id,
              pubkey: event.pubkey,
              content: event.content,
              created_at: event.created_at,
            });
          }
        }
      );

      return unsubscribe;
    };

    let unsubscribe: (() => void) | undefined;
    setupSubscription().then(unsub => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [pubkey, subscribeEvents, addMessage, signer]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedContact, getMessages]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedContact) return;

    try {
      await publishDM(messageInput, selectedContact.pubkey);
      setMessageInput('');
    } catch (error) {
      toast.error('Failed to send message');
    }
  };

  const messages = selectedContact ? getMessages(selectedContact.pubkey) : [];

  return (
    <div className="h-[calc(100vh-80px)]">
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Messages
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 flex overflow-hidden p-0">
          {/* Conversations List */}
          <div className="w-1/3 border-r overflow-hidden flex flex-col">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search messages..." className="pl-9" />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="divide-y">
                {conversations.map((contact) => {
                  const profile = profiles.get(contact.pubkey);
                  const lastMessage = getMessages(contact.pubkey).slice(-1)[0];

                  return (
                    <button
                      key={contact.pubkey}
                      onClick={() => setSelectedContact(contact)}
                      className={`w-full p-3 flex items-center gap-3 hover:bg-accent transition-colors ${
                        selectedContact?.pubkey === contact.pubkey ? 'bg-accent' : ''
                      }`}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={profile?.picture} />
                        <AvatarFallback>{profile?.name?.[0] || 'U'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-medium truncate">
                          {profile?.display_name || profile?.name || 'Anonymous'}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {lastMessage?.decrypted || lastMessage?.content.slice(0, 30) || 'No messages'}
                        </p>
                      </div>
                    </button>
                  );
                })}

                {conversations.length === 0 && (
                  <div className="p-4 text-center text-muted-foreground">
                    <p>No conversations yet</p>
                    <p className="text-sm">Start messaging your contacts!</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {selectedContact ? (
              <>
                {/* Chat Header */}
                <div className="p-3 border-b flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profiles.get(selectedContact.pubkey)?.picture} />
                    <AvatarFallback>
                      {profiles.get(selectedContact.pubkey)?.name?.[0] || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">
                      {profiles.get(selectedContact.pubkey)?.display_name ||
                        profiles.get(selectedContact.pubkey)?.name ||
                        'Anonymous'}
                    </p>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea ref={scrollRef} className="flex-1 p-4">
                  <div className="space-y-4">
                    {messages.map((message) => {
                      const isSent = message.pubkey === pubkey;

                      return (
                        <div
                          key={message.id}
                          className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                              isSent
                                ? 'bg-primary text-primary-foreground rounded-br-sm'
                                : 'bg-muted rounded-bl-sm'
                            }`}
                          >
                            <p>{message.decrypted || '[Encrypted]'}</p>
                            <p className={`text-xs mt-1 ${isSent ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                              {formatDistanceToNow(message.created_at * 1000, { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>

                {/* Input */}
                <div className="p-3 border-t flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <Button onClick={handleSendMessage} disabled={!messageInput.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a conversation to start messaging</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
