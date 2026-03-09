# CLUB ARENA — Master Knowledge File
## LAST UPDATED: Session 54+ (March 9, 2026)
## STATUS: Phase 9 DEPLOYED — Level-Based Tournament Overhaul
## RULE: UPDATE THIS FILE EVERY TIME YOU STOP TO UPDATE THE USER

---

## STANDING DIRECTIVES (NEVER VIOLATE)
- NEVER REFER TO BOTS — HORSES ONLY
- NO $ ANYWHERE IN USER-FACING TEXT
- NO ROUNDING — `Math.trunc(value * 100) / 100` EVERYWHERE
- ALL FUNCTIONALITY ON SERVER
- EVERY TRANSACTION LOGGED
- TOURNAMENTS DISPLAYED 72 HOURS OUT
- MOBILE OPTIMIZED (44px min touch targets)
- FULL AUTONOMOUS CONTROL — DON'T ASK, JUST DO
- HORSES = REAL USERS
- ALL WALLET TRANSACTIONS THROUGH AGENT CASHIER BUTTON
- LEADERBOARD PAGE AND TOURNAMENT LOBBY ARE TWO SEPARATE THINGS
- TOURNAMENT CANCELLATION ONLY IF < 3 PLAYERS
- UPDATE THIS KNOWLEDGE FILE ON EVERY STATUS UPDATE
- LATE REGISTRATION = PER-TOURNAMENT, LEVEL-BASED (NEVER GLOBAL TIME LIMIT)
- REBUY CUTOFF = LATE REG CUTOFF (ALWAYS THE SAME LEVEL)
- REBUY = SAME SEAT, SAME TABLE
- RE-ENTRY = NEW SEAT ASSIGNMENT
- MOST TOURNAMENTS RUN 8-12 LEVELS BEFORE ENDING REBUY PERIOD
- ADD-ON PERIOD = LEVEL-BASED (AFTER REBUY PERIOD ENDS)

---

## INFRASTRUCTURE
- Git: github.com/Smarter-Poker/Smarter-Poker-Club-Arena
- Vercel Team: smarter-poker (team_SVD8r7AOPH065G3usBxVvrBc)
- Vercel Project: club-arena (prj_oaCq8RYhExLRUYizLG93li0uX468)
- Supabase: kuklfnapbkmacvwxktbh.supabase.co
- Supabase Service Role: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs
- Supabase Anon: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0AZ-jnu4FkX9YKjo
- DB Password: Bek454545!!
- Login: DANIEL@BEKAVACTRADING.COM / Bek454545!!
- KingFish User: 47965354-0e56-43ef-931c-ddaab82af765
- BrowserRouter basename: /hub/club-arena
- Shark Club: a41434bb-8d0c-400a-8f0d-e8b3d65afed4 (club_id: 25450)
- JAQK Club: a0000000-0000-0000-0000-000000000001 (club_id: 77777)
- Midway Union: fade0000-0000-0000-0000-000000000001
- Chrome tab 34580077: Supabase SQL editor (active)
- Chrome tab 34580082: Smarter.Poker site

---

## FEATURE STATUS (COMPREHENSIVE)

### OVERALL: ~90% COMPLETE, PRODUCTION READY

| Category | Completion | Status |
|----------|-----------|--------|
| Pages & Routing | 100% | 50+ pages, all functional |
| Tournament System | 95% | All 10 types working |
| Cash Games | 90% | All mechanics working |
| Wallet/Financial | 100% | Triple wallet fully functional |
| Club Management | 95% | Complete with agent hierarchy |
| Leaderboards | 95% | Full featured |
| Unions | 90% | Cross-club tournaments working |
| Admin/Agents | 95% | Full management suite |
| Horses/AI | 90% | Backend strong, UI minimal |
| Real-Time Updates | 100% | Supabase channels everywhere |
| Mobile Optimization | 95% | 44px touch targets |
| Server/Engine | 100% | 24/7 fully automated |

---

### PAGES (50+ ALL FUNCTIONAL)
- HomePage, AuthPage, LobbyPage, TablePage (158KB!)
- TournamentLobbyPage, TournamentDetails, TournamentResultsPage, TournamentPage
- ClubHomePage, ClubDetailPage, ClubsPage, CreateClubPage, ClubSettingsPage
- AgentManagementPage, SuperAgentDashboard
- ProfilePage, SettingsPage, LeaderboardPage, HandHistoryPage
- PlayerWalletPage, CashierPage, TransactionHistoryPage
- UnionsPage, UnionDetailPage, CreateUnionPage, SettlementPage
- ClubFinancialsPage, ClubAnnouncementsPage, NotificationsPage
- MessagesPage, ClubMessagesPage, AchievementsPage, FriendsPage
- RakebackPage, BadBeatJackpotPage, PlayerStatsPage
- PromotionsPage, VIPPage, BonusPage, WaitlistPage
- InvitePage, SearchPage, HelpPage, ReportPlayerPage
- HandReplayerPage, Legal pages (TOS, Privacy, Fair Gaming)

### TOURNAMENT TYPES (ALL 10 WORKING)
| Type | Creation | Registration | Gameplay | Blinds | Elimination | Prizes | Results |
|------|----------|-------------|----------|--------|-------------|--------|---------|
| MTT | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| SNG | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| Spin & Go | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| Turbo | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| Freeze-out | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| Bounty KO | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| PKO | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| Mystery Bounty | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| XMTT (Union) | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| Multi-Day | DONE | DONE | DONE | DONE | DONE | DONE | DONE |

### CASH GAME FEATURES (ALL WORKING)
- Table creation, Sit/leave, Buy-in/cash-out, Rake, Hand history
- Run It Twice, Insurance, Time Bank, Straddle, Bomb Pot
- Rabbit Hunting, Throwables/Reactions, Tipping, Bad Beat Jackpot
- Player Notes, Hand Sharing, Chat, Pre-action buttons
- Game variants: NLH, FLH, PLO4, PLO5, PLO6, PLO8, Short Deck, OFC Pineapple

### WALLET SYSTEM (100% COMPLETE)
- Triple wallet: PLAYER, BUSINESS, PROMO
- RPCs: credit_player_wallet, deduct_player_wallet, log_wallet_transaction
- All transactions logged with full audit trail
- Agent cashier, chip distribution, transfers

### SERVER (100% COMPLETE, 24/7 AUTOMATED)
- TournamentOrchestrator: Main server class
- ServerTableEngine: Continuous hand dealing per table
- HandController: Full hand state machine (preflop → showdown)
- PokerEngine: Hand evaluation, rake calc, winner determination
- HorseLogic: 5 AI styles (TAG, LAG, BALANCED, TRICKY, GRINDER)
- HorseFleetManager: Seeds 37 cash tables every 30s
- TournamentRecurringService: 16+ hourly tournament types, SNGs, Spins, XMTTs
- HorseLifecycleManager: Cleanup every 60s

### SPIN MULTIPLIERS
- 2x (75%), 3x (15%), 5x (7%), 10x (2.5%), 25x (0.4%), 100x (0.1%)

---

## COMPLETED BUG FIX PHASES (DO NOT RE-AUDIT)

### Phase 1-4 (Previous Sessions)
- Server-side tournament lifecycle fully wired
- Supabase Realtime broadcast events (11 types)
- Triple wallet system
- All tournament types
- Blind escalation with auto-double on exhaustion
- Prize recalculation on late reg/add-on
- Table rebalancing with client redirect
- Pre-action buttons, Integer-cent arithmetic

### Phase 5 (Commit 3903b80)
- [x] TournamentRegistration.tsx: Admin remove includes refund
- [x] TablePage.tsx: rebuyProcessing guard on AddOnModal
- [x] TournamentService.ts: canRebuy validation, payout nil check
- [x] server/index.ts: Stack sync NaN guard, elimination count fix, stuck-COMPLETING recovery
- [x] TournamentRecurringService.ts: bountyPercent in XMTTConfig
- [x] TournamentBreakScreen: Minimizable with floating badge
- [x] CSS: Mobile touch targets 44px, font sizes

### Phase 5b (Commits e0dc5a7, 49f68b9)
- [x] Blind grid overflow, AddOnModal/RebuyModal touch targets, z-index

### Phase 6 (Commit 2c961d1)
- [x] TournamentResultsPage deep link, late reg failure notification

### Phase 7 (Commit bdf3510)
- [x] Bounty channel memory leak fixed (bountyChannelRef)
- [x] Duplicate add-on channel removed
- [x] TournamentDetails wallet query fixed (play_chips → balance)
- [x] LeaderboardPage stale closure fixed (activeTabRef)
- [x] PokerEngine server rake precision (Math.trunc)
- [x] Payout normalization integer-cent + remainder
- [x] TournamentDetails prize calc consistency

### Phase 7b (Commit e7a8541)
- [x] PokerEngine client rake precision
- [x] LeaderboardPage Math.round → Math.trunc on all money
- [x] LeaderboardPage .toFixed → Math.trunc for ROI

### Phase 8 (Commit c20133a) — VISUAL VERIFIED ON LIVE SITE
- [x] TournamentDetails.tsx: Info grid layout fix — .info-row.half elements were concatenating
  Wrapped in .info-half-grid flex container with proper 2-column layout
  Added border separators between columns
  Added mobile fallback (stacks to 1 column at 480px)
- [x] TournamentDetails.css: New .info-half-grid class with flex-wrap
- [x] LeaderboardPage.tsx: formatValue .toFixed(1) → Math.trunc(val * 10) / 10
- [x] VISUALLY VERIFIED: Tournament details info grid now displays correctly on production

### Phase 9 (Commit b332d35) — LEVEL-BASED TOURNAMENT OVERHAUL
**MAJOR OVERHAUL — Time-based → Level-based for ALL tournament registration periods**
- [x] Late registration: Per-tournament, controlled by blind level count (never global time limit)
- [x] Rebuy cutoff always matches late reg cutoff (same level, `late_reg_levels`)
- [x] Rebuy = same seat/table, Re-entry = new seat assignment (separate toggles)
- [x] Add-on period: opens after rebuy/late reg period ends, stays open for `addon_levels` levels
- [x] CreateTournamentModal: level dropdown (1-20, 8-12 recommended), rebuy/re-entry checkboxes
- [x] Server engine: level-up handler replaces all setTimeout-based finalization
- [x] TournamentService: level-based canRebuy, canAddOn, isLateRegOpen checks
- [x] TournamentDetails/LobbyCard: level-based countdown display ("X levels remaining")
- [x] DB migration: late_reg_levels, addon_levels, is_reentry columns added + data migrated
- [x] NotificationDropdown: Supabase channel cleanup memory leak fixed
- [x] ClubActivityFeed: Supabase channel cleanup memory leak fixed
- [x] TypeScript builds clean (client + server)
- [x] 13 files changed, 283 insertions, 183 deletions
- **Files modified**: server/src/index.ts, server/src/services/TournamentRecurringService.ts,
  src/components/club/ClubActivityFeed.tsx, src/components/club/CreateTournamentModal.tsx,
  src/components/navigation/NotificationDropdown.tsx, src/components/tournament/TournamentLobbyCard.tsx,
  src/engine/TournamentEngine.ts, src/pages/tournament/TournamentDetails.tsx,
  src/pages/tournament/TournamentLobbyPage.tsx, src/services/HorseOrchestrator.ts,
  src/services/TournamentRecurringService.ts, src/services/TournamentService.ts,
  src/types/database.types.ts

### Phase 9b (Commit 2713afe) — BUG FIX SWEEP
- [x] canRebuy/canAddOn: `||` → `??` (nullish coalescing) — late_reg_levels=0 no longer falls back to 8
- [x] canRebuy: explicit `rebuyLevelCap <= 0` check disables rebuys when no late reg configured
- [x] processRebuy: passes correct `p_rebuy_type` based on `is_reentry` flag (reentry vs rebuy)
- [x] TournamentLobbyCard: feature tags check `late_reg_levels` instead of old `lateRegMins`
- [x] TournamentLobbyCard: late reg display shows "through Lvl X" instead of "Xm"
- [x] RakeReports: avgRakePerHand `.toFixed(2)` → `Math.trunc(value * 100) / 100`

### Phase 9c (Commit 1c74dba) — REMAINING || FALLBACK FIXES
- [x] server/index.ts: ALL late_reg_levels/rebuy_levels/addon_levels use `??` (4 locations)
- [x] TournamentDetails.tsx: Rebuy/add-on level display uses `??` (3 locations)
- [x] TournamentEngine.ts: Add-on trigger uses `late_reg_levels ?? rebuy_levels ?? 8`
- [x] VISUALLY VERIFIED: Create Tournament modal shows level-based dropdown, lobby cards show "Late Reg: Closed"

---

## VERIFIED CLEAN (LAST SWEEP)
- [x] Zero Math.round on money values
- [x] Zero Math.floor on money values
- [x] Zero .toFixed on stored money values
- [x] Zero $ symbols in user-facing strings
- [x] Zero bot/bots references
- [x] Zero play_chips references
- [x] All Supabase channels properly cleaned up in useEffect
- [x] All stale closures resolved with useRef pattern
- [x] Database schema fully synced — late_reg_levels, addon_levels, is_reentry columns added
- [x] TypeScript builds clean (client + server)
- [x] All deployments on Vercel READY

---

## SUPABASE REALTIME CHANNELS
| Channel | Events | Page |
|---------|--------|------|
| `t-break-{tournamentId}` | tournament_break, break_ended, ADDON_PERIOD_START/END, hand_for_hand, bubble_burst, player_eliminated, table_rebalance, late_reg_closed, rebuy, level_up | TablePage |
| `bounty-{tournamentId}` | postgres_changes on tournament_players | TablePage |
| `tournament-lobby` | postgres_changes on tournaments | TournamentLobbyPage |
| `tournament-details-{id}` | postgres_changes on tournaments | TournamentDetails |
| `tournament-results` | postgres_changes on tournaments | TournamentResultsPage |
| `leaderboard-updates` | postgres_changes on promotion_leaderboards | LeaderboardPage |
| `tournament-leaderboard-updates` | postgres_changes on tournament_players | LeaderboardPage |

## TOURNAMENT LIFECYCLE
```
ANNOUNCED → REGISTERING → RUNNING → COMPLETING → COMPLETED
                                                → CANCELLED (< 3 players)
SNG: Auto-starts when max_players reached (NOT time-based)
MTT: Starts at scheduled time when min_players met
```

## KEY FILES
| File | Purpose | Lines |
|------|---------|-------|
| server/src/index.ts | Main game server, TournamentManager | 2131 |
| server/src/engine/PokerEngine.ts | Hand evaluation, rake, winners | 477 |
| server/src/engine/HandController.ts | Hand state machine | 553 |
| server/src/engine/ServerTableEngine.ts | Table management, dealing | 689 |
| server/src/engine/HorseLogic.ts | Horse AI decision engine | 332 |
| server/src/services/supabase.ts | DB client + wallet RPCs | 489 |
| server/src/services/HorseFleetManager.ts | Cash table seeding | 420 |
| server/src/services/HorseLifecycleManager.ts | Horse monitoring | 389 |
| server/src/services/TournamentRecurringService.ts | 24/7 scheduling | 800+ |
| src/services/TournamentService.ts | Client tournament ops | 2500+ |
| src/pages/TablePage.tsx | Main poker table UI | 3170+ |
| src/pages/tournament/TournamentLobbyPage.tsx | Tournament lobby | ~400 |
| src/pages/tournament/TournamentDetails.tsx | Detail + registration | ~1000 |
| src/pages/tournament/TournamentResultsPage.tsx | Results | ~400 |
| src/pages/LeaderboardPage.tsx | Rankings + stats | 561 |

## DATABASE (91 TABLES, 63 RPCs — ALL SYNCED)
- Core: profiles, clubs, club_members
- Tables: tables, table_seats, table_templates, table_waitlists, table_chip_locks
- Tournaments: tournaments, tournament_players, tournament_tables, tournament_eliminations, tournament_prize_pools, tournament_payouts, tournament_rebuys
- Financial: wallets, wallet_transactions, chip_transactions, agent_settlements, agent_commissions
- Bounties: tournament_players has current_bounty, bounties_collected, bounty_winnings, mystery_bounty_value
- BBJ: bad_beat_jackpots, bbj_contributions, bbj_payouts
- Player: player_stats, player_notes, player_presence, player_sessions
- History: hand_history, rake_history, rake_records, rake_attributions
- Messaging: messages, conversations, message_reactions
- Critical RPCs: credit_player_wallet, deduct_player_wallet, log_wallet_transaction

## REMAINING GAPS (LOW PRIORITY)
1. Horse management admin UI — backend complete, no dedicated stats/config page
2. Leaderboard CSV/JSON export — not implemented
3. Satellite tournaments — type defined, limited functionality
4. Training system detail pages — ArenaTrainingController exists, UI minimal
5. Custom blind structure editor — predefined structures work, custom creation limited

## GIT LOG (RECENT)
```
1c74dba Phase 9c: Fix remaining || fallbacks to ?? across server + client
2713afe Phase 9b: Fix rebuy/add-on 0-value fallback, re-entry type, lobby card tags, rake precision
c8d15ec Update knowledge file with Phase 9 level-based tournament overhaul
b332d35 Phase 9: Level-based late reg/rebuy/re-entry/add-on overhaul + channel cleanup
8e806af Update knowledge file with Phase 8 visual verification results
c20133a Phase 8: Fix tournament details info grid layout + leaderboard precision
```
