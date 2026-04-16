# Couples Wordle – Product Requirements Document

## Overview
- **Goal**: Daily Wordle-style ritual for couples that blends a classic Wordle lane with a personalized couple lane, delivered with playful pastel visuals, lively but calm animations, and strong privacy defaults.
- **Platform**: Web PWA (React + Vite + shadcn/ui), installable to iOS Home Screen; responsive for mobile-first. 
- **Business model**: 100% free at launch (no ads/IAP).
- **Content**: PG-only.
- **Comparison scope**: Couple-only; no public/global leaderboards.

## Success Metrics
- D1 retention ≥ 55%; D7 retention ≥ 35%.
- ≥ 60% of couples play both lanes (classic + couple) weekly.
- Avg weekly puzzles solved per couple ≥ 5; ≥ 60% of puzzles completed by both partners on the same day.
- Hint satisfaction (CSAT) ≥ 4.3/5; AI opt-in rate ≥ 35%.

## Users & Use Cases
- Couples (including long-distance) wanting a light, 5–10 minute shared game.
- Partners seeking async competition (Versus) or shared success (Co-op).
- Privacy-conscious pairs who only want to compare within the couple.

## Pillars
- **Playful, modern-simplistic UI**: Pastel palette, soft radii, low-noise layout, delightful animations.
- **Respectful privacy**: PG-only content; couple-only comparisons; explicit opt-ins for personal data sources.
- **AI assist, not dictate**: Contextual hints and personalized wordlists that stay safe and optional.

## Experience
### Modes
- **Classic Lane**: Standard 5-letter Wordle, 6 guesses, offline-first word pack.
- **Couple Lane**: Themed/custom words drawn from shared context (opt-in) and curated lists; “Gift a Puzzle” (one partner sets a word; AI generates decoy hints that don’t leak the answer).
- **Co-op**: Partners share attempts; succeed together.
- **Versus**: Same board; fastest solve/time wins.
- **Weekend Marathon**: 3 boards in sequence.

### Core Loop
1) Daily notification (default noon local) nudges play.
2) Partners open Today’s puzzle; can choose Classic or Couple lane.
3) Play with animated tile flips/bounces, haptics, and optional power-ups.
4) Compare view shows attempts timeline, time-to-solve, hint usage, and an animated “compatibility pulse.”
5) Earn badges/power-ups; maintain couple and individual streaks.

### Power-Ups (earned, not sold)
- Extra hint.
- Reveal one letter.
- Swap a row.

### Streaks & Rewards
- Individual streak; couple streak (both complete the daily board).
- Badges for milestones; season resets keep stakes fresh.

### Notifications
- Daily reminder: noon local by default; user-configurable.
- Event: “Your partner started a game” (realtime via Supabase + APNs).

## AI Features (Opt-in, PG)
- **Contextual hints**: Use opted-in sources (Apple Calendar, Google Calendar, Apple Notes, iMessages) via on-device embeddings; only minimal signals go to backend; PG safety filters.
- **Personalized wordlists**: Rank candidate words from opted-in signals; PG blocklists; on-device store where possible.
- **Tone-safe encouragement**: Short supportive messages; safety-filtered.
- **Dynamic difficulty**: Adjust attempts/word length based on frustration signals (time per guess, erasures).
- **Gift a Puzzle**: AI crafts decoy hints for partner-set words without leaking answer.

## Design System
- **Fonts**: Body & default text — Atkinson Hyperlegible. Headings — SF Pro Rounded.
- **Palette**: Pastel primaries with high-contrast neutrals; soft shadows; rounded radii.
- **Motion**: Tile flip/bounce on validation; page fade+scale; progress pulse when partner advances; gentle confetti on win.
- **Accessibility**: Large tap targets, Dynamic Type support, colorblind-friendly states.

## Architecture
- **Client**: React + Vite + TypeScript + shadcn/ui; Tailwind theming with pastel tokens; PWA via `vite-plugin-pwa`; local cache for word packs; add-to-home-screen prompt and offline shell.
- **Backend**: Supabase (Postgres, Auth, Realtime, Edge Functions for LLM proxy and safety). Magic links for auth; QR or share-link for couple linking.
- **Realtime**: Supabase Realtime for partner status and “partner started a game” events.
- **Notifications**: Web Push (where supported; iOS when installed as PWA on Safari 16.4+); fallback email reminders via Supabase functions; in-app reminders. Add SMS magic-link option via Supabase OTP SMS (Twilio) for sign-in or a “copy text invite” that users can send manually if carrier integration isn’t available.
- **Analytics**: PostHog (web-friendly) and Sentry for errors.

## Data Model (high level)
- users (id, auth, settings), couples (id, name, privacy_mode), couple_members (user_id, couple_id, role).
- puzzles (id, date, word, lane: classic/couple, season_id), puzzle_attempts (user_id, puzzle_id, rows, time_ms, hints_used, lane, mode), powerups (type, earned_at, consumed_at), seasons (id, start, end), ai_profiles (source opts, embedding ptr), notifications.

## Privacy & Safety
- Explicit opt-in per data source; revoke/delete controls.
- On-device embedding store; backend stores only hashed IDs and minimal ranking signals.
- PG-only wordlists and outputs; blocklists and safety filters for model outputs.
- Couple-only visibility; no public/global leaderboards.

## Roadmap
1) **v0.1**: PWA shell, Classic lane board, Supabase auth (magic link), base theme/fonts, install guidance.
2) **v0.2**: Couple lane, compare view, couple streaks, compatibility pulse.
3) **v0.3**: Power-ups, weekend marathon, animation polish, partner-started realtime banner.
4) **v0.4**: AI hints & personalized lists (opt-in sources), safety filters, gift-a-puzzle.
5) **v0.5**: Badges, analytics + crash reporting, push/email reminders, soft launch cohort.

## Open Items
- Finalize badge art style (pastel ribbons vs minimalist glyphs).
- Decide max word length in Couple lane (cap at 6 vs allow 7–8 for customs).
- Choose analytics provider (TelemetryDeck vs PostHog) and crash stack (Sentry baseline assumed).
