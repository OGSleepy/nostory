# Nostory 🔮

A feature-rich, decentralized social media client built on the [Nostr protocol](https://nostr.com). Nostory brings together the best features of Instagram, Twitter, and YouTube — but fully decentralized, censorship-resistant, and owned by you.

🌐 **Live at [nostory.vercel.app](https://nostory.vercel.app)**

## Features

### Core
- 🔐 **Multiple login methods** — Browser extension (NIP-07), `nsec` key, or Bunker (NIP-46 / Amber)
- 📡 **Outbox model** — Smart relay routing via NIP-65 relay lists
- ⚡ **LRU event cache** — Fast profile and event loading with NCache
- 🌐 **Global & Following feeds** — Real-time posts from your network

### Social
- 💬 **Posts & Replies** — Full threaded conversations
- 🔁 **Reposts & Quote Reposts** — Share with or without commentary
- ❤️ **Reactions** — Like and react to posts
- ⚡ **Zaps** — Lightning Network tipping via LNURL
- 💛 **Nostr Wallet Connect** — One-tap zapping with NWC-compatible wallets (NIP-47)
- 🔖 **Bookmarks** — Save posts to relay (NIP-51, kind 30001)
- 🔕 **Mute list** — Mute users, hashtags, and words (NIP-51, kind 10000)

### Content
- 📝 **Long-form articles** — Full Markdown editor with live preview (NIP-23)
- 🏷️ **Hashtag following** — Follow topics and get a dedicated Topics feed (NIP-51)
- ⚠️ **Content warnings** — Blur sensitive content with one-tap reveal (NIP-36)
- ✅ **NIP-05 verification** — Live verified checkmarks on profiles

### Discovery
- 🔍 **Explore** — Trending posts and user search
- 🎥 **Video feed** — Short-form video content
- 📖 **Stories** — Ephemeral story-style posts
- 🔔 **Notifications** — Mentions, reactions, zaps, reposts, and new followers

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** — Fast build tooling
- **Tailwind CSS** — Utility-first styling
- **shadcn/ui** — Accessible component library
- **Zustand** — Lightweight state management with persistence
- **@nostrify/nostrify** — Nostr protocol library (NPool, NCache, NSchema, LNURL, NConnectSigner)
- **applesauce-wallet-connect** — NIP-47 Nostr Wallet Connect client

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Install

```bash
git clone https://github.com/OGSleepy/nostory.git
cd nostory
npm install
```

### Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
npm run build
```

## Login Methods

| Method | Description |
|--------|-------------|
| **Extension** | Use a NIP-07 browser extension like [Alby](https://getalby.com) or [nos2x](https://github.com/fiatjaf/nos2x) |
| **nsec** | Paste your private key directly (stored locally, never sent anywhere) |
| **Bunker** | Connect via NIP-46 using [Amber](https://github.com/greenart7c3/Amber), [nsecbunker](https://nsecbunker.com), or [nsec.app](https://nsec.app) |

## Wallet Connect (NWC)

Connect a NWC-compatible wallet for instant one-tap zapping without leaving the app. Tap **Connect Wallet** in the sidebar and paste your `nostr+walletconnect://` URI.

Compatible wallets:
- [Alby](https://getalby.com)
- [Mutiny Wallet](https://mutinywallet.com)
- [Wallet of Satoshi](https://walletofsatoshi.com)

## NIPs Supported

- NIP-01 — Basic protocol
- NIP-05 — DNS verification
- NIP-07 — Browser extension signing
- NIP-09 — Event deletion
- NIP-10 — Reply threading
- NIP-18 — Reposts
- NIP-21 — `nostr:` URI scheme
- NIP-23 — Long-form content
- NIP-25 — Reactions
- NIP-36 — Content warnings
- NIP-46 — Remote signing (Bunker)
- NIP-47 — Nostr Wallet Connect
- NIP-51 — Lists (mute, bookmarks, hashtags)
- NIP-57 — Lightning Zaps
- NIP-65 — Relay list metadata (Outbox model)

## License

MIT
