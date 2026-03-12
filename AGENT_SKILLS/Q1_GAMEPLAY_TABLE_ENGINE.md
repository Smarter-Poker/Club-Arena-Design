# Q1: Gameplay & Table Engine — Agent Skill

## Overview

This skill covers **everything that happens at the poker table** — the live gameplay experience, animations, sounds, multiplayer sync, tournaments, and all table utilities. This is where the money lives.

---

## Architecture Quick Reference

### Core Files

| Component                  | Path                                | Size        | Purpose                        |
| :------------------------- | :---------------------------------- | :---------- | :----------------------------- |
| **TablePage.tsx**          | `src/pages/TablePage.tsx`           | 4,377 lines | Monolithic table orchestrator  |
| **HeadlessTableEngine.ts** | `src/engine/HeadlessTableEngine.ts` | 59KB        | Server-authoritative game loop |
| **TournamentEngine.ts**    | `src/engine/TournamentEngine.ts`    | 66KB        | Full MTT/SNG lifecycle         |
| **HandController.ts**      | `src/engine/HandController.ts`      | 29KB        | Hand-level game logic          |
| **PokerEngine.ts**         | `src/engine/PokerEngine.ts`         | 25KB        | Deck, evaluation, pot calc     |
| **HorseLogic.ts**          | `src/engine/HorseLogic.ts`          | 27KB        | Horse (bot) decision AI        |

### Card Rendering (Custom PNG Deck)

**CRITICAL**: The custom 52-card PNG deck lives at `public/cards/` with 2-color and 4-color variants plus 8 card back designs at `public/cards/backs/`.

| Renderer               | Path                                        | Usage                                                               |
| :--------------------- | :------------------------------------------ | :------------------------------------------------------------------ |
| `CardImage.tsx`        | `src/components/table/CardImage.tsx`        | Primary card renderer — uses `/cards/{deckStyle}/{suit}_{rank}.png` |
| `PremiumCard.tsx`      | `src/components/table/PremiumCard.tsx`      | Premium renderer with 3D flip + shine effects                       |
| `CardBack`             | Exported from `CardImage.tsx`               | Card back renderer with theme selection                             |
| `CommunityCards.tsx`   | `src/components/table/CommunityCards.tsx`   | Board cards (uses `CardImage`)                                      |
| `SeatSlot.tsx`         | `src/components/table/SeatSlot.tsx`         | Hole cards at seats (uses `CardImage` + `CardBack`)                 |
| `CardReveal.tsx`       | `src/components/table/CardReveal.tsx`       | Showdown card flip (uses `CardImage` + `CardBack`)                  |
| `HandReplayPlayer.tsx` | `src/components/table/HandReplayPlayer.tsx` | Replay viewer (uses `CardImage`)                                    |

> **Rule**: ALL card rendering MUST use `CardImage` or `PremiumCard`. Never use Unicode suit symbols (♠♥♦♣) or CSS-generated cards. This was a past bug that was fixed.

### Sensory Layer

| Service               | Path                                      | Purpose                                   |
| :-------------------- | :---------------------------------------- | :---------------------------------------- |
| `SoundService.ts`     | `src/services/SoundService.ts`            | 14 procedural sounds via Web Audio API    |
| `PremiumSFX.ts`       | `src/services/PremiumSFX.ts`              | Premium sound effects layer               |
| `ChipAnimation.tsx`   | `src/components/table/ChipAnimation.tsx`  | Bezier-curve chip flights                 |
| `ConfettiCanvas.tsx`  | `src/components/table/ConfettiCanvas.tsx` | Winner celebration canvas                 |
| `ParticleSystem.tsx`  | `src/components/table/ParticleSystem.tsx` | Gold sparks, chip burst, confetti modes   |
| `SoundPackService.ts` | `src/services/SoundPackService.ts`        | Themed sound volumes (casino/minimal/etc) |
| `ScreenShake.ts`      | `src/utils/ScreenShake.ts`                | Screen shake utility (light/medium/heavy) |
| `ThrowAnimation.tsx`  | `src/components/table/ThrowAnimation.tsx` | Object throwables                         |

### Multiplayer & Sync

| Service                          | Path                                          | Purpose                    |
| :------------------------------- | :-------------------------------------------- | :------------------------- |
| `TableWebSocket.ts`              | `src/services/TableWebSocket.ts`              | Real-time game state sync  |
| `RoomService.ts`                 | `src/services/RoomService.ts`                 | WebSocket room management  |
| `RealtimeChannelService.ts`      | `src/services/RealtimeChannelService.ts`      | Supabase Realtime channels |
| `PresenceService.ts`             | `src/services/PresenceService.ts`             | Online/offline tracking    |
| `DisconnectProtectionService.ts` | `src/services/DisconnectProtectionService.ts` | Connection recovery        |

### Table Utilities (All ✅ Built)

ActionPanel, SitOutModal, WaitListModal, TimeBank, CashierModal, BuyInModal, StraddleToggle, RabbitHunt, InsuranceModal, RunItTwice, BombPotOverlay, ThrowableSelector, EmotePanel, PlayerNotesPanel, HandHistoryPanel, HandReplayPlayer, ShareHand, QuickChatPresets, SessionHUD, SessionSummary, AutoRebuyService, StreamerMode, TableTabBar, SettingsPanel, ThemeSelector

---

## Card Back Designs Available

| ID       | Name         | Type            | Path                        |
| :------- | :----------- | :-------------- | :-------------------------- |
| black    | Black        | Default         | `/cards/backs/black.jpeg`   |
| red      | Red          | Default         | `/cards/backs/red.jpeg`     |
| blue     | Blue         | Default         | `/cards/backs/blue.jpeg`    |
| white    | White        | Default         | `/cards/backs/white.jpeg`   |
| classic  | Classic      | Premium (💎50)  | `/cards/backs/classic.jpg`  |
| burgundy | Burgundy     | Premium (💎75)  | `/cards/backs/burgundy.jpg` |
| navy     | Navy         | Premium (💎75)  | `/cards/backs/navy.jpg`     |
| gold     | Premium Gold | Premium (💎150) | `/cards/backs/gold.jpg`     |

---

## Industry-Leading Overhaul — Status Tracker

### ✅ Phase 1: Custom Deck Integration — COMPLETE

- [x] `CardReveal.tsx` — replaced Unicode with CardImage+CardBack (3D flip preserved)
- [x] `HandReplayPlayer.tsx` — replaced text cards with CardImage (hole + board)
- [x] `CardBackSelector.tsx` — replaced text span with `<img>`, added 4 premium backs
- [x] Build verified: zero TypeScript errors

### ✅ Phase 2: Visual Polish — Animations & Effects — COMPLETE

- [x] Card deal arc trajectory — enhanced `cardDeal` CSS (slide from right with brightness flash)
- [x] 3D flip for turn/river — already existed (`cardTurnReveal` / `cardRiverReveal`)
- [x] Staggered flop dealing — already existed via `--card-index` \* 100ms
- [x] ParticleSystem.tsx — gold sparks, casino chips, confetti (3 modes)
- [x] ScreenShake.ts — light/medium/heavy with GPU translate3d
- [x] Chip stack sprites — already existed (`ChipStack.tsx` with denomination colors)
- [x] Chip drop animation — already existed (`chip-drop` keyframes)
- [x] Bonus: Fixed ShareHand.tsx board preview Unicode → CardImage

### ✅ Phase 3: Sensory & Immersion — COMPLETE

- [x] All-in drama mode — tension glow border, dimmed UI, super spotlight, 0.9s slow dealing
- [x] Sound pack selection — `SoundPackService.ts` (casino/minimal/tournament/silent)
- [x] Table felt fabric texture — SVG weave data URI
- [x] Rail leather stitching — inner dashed ring
- [x] Center watermark — 'S' logo at 1.8% opacity
- [x] Theme-configurable felt color — 6 themes via `data-felt-theme` CSS variable

### 🔲 Phase 4: New Game Modes

- [ ] SpinItEngine.ts — lottery SNG
- [ ] SpinItWheel.tsx — animated prize wheel
- [ ] FlashPoolEngine.ts — fast-fold player pool
- [ ] FlashTransition.tsx — table wipe transition

### 🔲 Phase 5: Feature Parity+

- [ ] EV Cashout tab in InsuranceModal
- [ ] Paid hand reveal (HandReveal.tsx)
- [ ] Smart HUD visual upgrade (color VPIP, flame icon)
- [ ] SessionAnalytics.tsx — PokerCraft-style dashboard

---

## Competitive Benchmarks

| Feature           | Us  | PokerBros | ClubGG | WPT Global |
| :---------------- | :-: | :-------: | :----: | :--------: |
| Custom PNG Deck   | ✅  |    ✅     |   ✅   |     ✅     |
| OFC Pineapple     | ✅  |    ❌     |   ❌   |     ❌     |
| Horse AI Bots     | ✅  |    ❌     |   ❌   |     ❌     |
| GTO Advisor       | ✅  |    ❌     |   ❌   |     ❌     |
| Player Style Tags | ✅  |    ❌     |   ❌   |     ❌     |
| Equity Display    | ✅  |    ❌     |   ❌   |     ❌     |
| Spin-It           | ❌  |    ✅     |   ❌   |     ❌     |
| Flash/Fast-Fold   | ❌  |    ❌     |   ❌   |     ✅     |
| EV Cashout        | ❌  |    ❌     |   ✅   |     ❌     |

---

## Rules & Standards

1. **Custom deck ONLY** — never render cards with CSS text or Unicode symbols
2. **Haptic feedback** — use `haptic.light()/medium()/strong()` from SoundService for all user interactions
3. **Card type** — always use `Card` interface from `CardImage.tsx` (`rank: '2'-'A'`, `suit: 'h'|'d'|'c'|'s'`)
4. **4-color default** — use `deckStyle="4color"` unless user setting overrides
5. **Performance** — `TablePage.tsx` is 4,377 lines; prefer extracting to custom hooks over adding more inline logic
6. **Animations** — use `requestAnimationFrame` for smooth motion; CSS transitions for simple state changes
7. **Sound** — coordinate SoundService playback with animation timing (e.g., `playDeal()` syncs with card arc arrival)
