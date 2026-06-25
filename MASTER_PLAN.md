# dJT Master Plan

## Version Summary

**Current Version:** v0.2.1  
**Status:** Testable voice-first PWA with parser fixes and AI review queue  
**Last Updated:** 2026-06-23

### v0.2.1 Summary

- Added Progressive Web App support so dJT can be added to the iPhone/iPad Home Screen from Safari.
- Added dJT branding with lowercase `d` and uppercase `JT`.
- Added app icon and manifest metadata.
- Fixed parser bugs found during testing.
- Expanded phrase handling for restart, block, skip, pause, play, favor, reduce, playlist, undo, and rules commands.
- Added `block_genre` handling so phrases like "don't play any more country tonight" do not get misread as "more country."
- Added an AI Review Queue that locally captures commands needing AI interpretation so future deterministic rules can be developed.
- Added regression tests from real testing feedback.
- Added the standing rule that every revision must end in a deployable, testable state.

### v0.2.0 Summary

- Migrated the project from `JTDJ` to `dJT`.
- Preserved the voice-first web app prototype.
- Preserved the local deterministic command parser.
- Preserved the structured JSON output test flow.
- Preserved the rule that the assistant waits for **go** before making project changes.
- Preserved the rule that this master plan must stay updated with project decisions, rules, and plans.
- Established that multi-commit version changes may use `(x of y)` in the commit message.

---

## Project Vision

dJT is a custom DJ web app controlled primarily by voice commands. The app should run on an iPad or iPhone through Safari, be hosted for free using GitHub Pages, and eventually control Spotify playback through Spotify's APIs.

The goal is not to build a generic playlist app. The goal is to build a personal DJ assistant that understands practical DJ instructions such as skipping songs, changing energy, favoring artists, blocking artists or genres for a period of time, adding songs to playlists, and managing a live DJ session.

The user will direct the product. The assistant will do the engineering work, but changes must follow the project rules in this document.

---

## Core Architecture

### Platform Decision

dJT will start as a web app instead of a native iPhone/iPad app.

Reasoning:

- The user does not currently have a Mac.
- Native iOS development would require Xcode and macOS.
- Publishing or permanently distributing an iOS app may require an Apple Developer Program membership.
- A web app can be built with HTML, CSS, and JavaScript.
- GitHub Pages can host the app for free.
- Safari on iPad/iPhone can run the app without App Store distribution.

### Hosting

The initial hosting target is GitHub Pages.

### Progressive Web App Direction

dJT should behave like an app when added to the iPhone/iPad Home Screen from Safari.

The app should include:

- Web app manifest.
- Apple mobile web app meta tags.
- Theme color.
- Home Screen capable mode.
- App title.
- App icon.

The target Home Screen name is `dJT`, with lowercase `d` and uppercase `JT`.

### Interface Direction

dJT is voice-first. The main interface should be built around speaking commands, not typing them.

Typing may exist as a debug fallback so parser behavior can be tested when voice recognition is unavailable, unreliable, or unsupported by the browser. The debug input should not drive the product design.

### Spotify Integration

The app will control Spotify through Spotify's Web API where possible.

Expected Spotify-related capabilities include:

- Authenticate with the user's Spotify Premium account.
- Search for songs, artists, albums, and playlists.
- Control playback.
- Add songs to playlists.
- Manage queue-related behavior where Spotify allows it.
- Read current playback state.

Spotify Premium is already available for the user, so no extra Spotify subscription is expected for personal use.

### AI Strategy

AI should be optional.

The preferred design is:

1. Try to parse commands locally with deterministic rules.
2. If the command is clear, execute locally with no AI cost.
3. If the command is ambiguous or too natural-language-heavy, mark it as `needs_ai_interpretation`.
4. Save those unclear commands to the AI Review Queue.
5. Use that queue to decide whether to build more local rules before adding real AI calls.
6. When AI is eventually added, AI must return a structured command, not free-form instructions.
7. The app executes only structured actions it already understands.

This keeps the app fast, reliable, inexpensive, and usable even if AI is disabled.

---

## Design Principles

1. **Do not require AI when deterministic logic can solve the problem.**
2. **Every user command must map to a structured action before execution.**
3. **The app should remain useful with AI disabled.**
4. **Prioritize reliability over cleverness.**
5. **Minimize operating cost without sacrificing practical capability.**
6. **Keep project knowledge in this master plan so a new chat can resume work quickly.**
7. **Separate command interpretation from command execution.**
8. **Add new actions deliberately so the command engine remains understandable.**
9. **Small non-functional quality-of-life improvements are allowed when they do not change existing functionality or contradict prior decisions.**
10. **Voice is the primary interface; typing is only a fallback/debug tool.**
11. **Every revision must end in a deployable, testable state before beginning the next feature.**
12. **Unknown or AI-needed phrases should be captured so we can learn from real usage and develop better local rules.**

---

## Project Rules

### Rule 1: Wait for "go" Before Making Project Changes

When the user asks for code, files, repository changes, commits, or implementation work, the assistant must first explain what will be done. The assistant must not make the project change until the user explicitly says **go**.

When the user says **go**, the assistant should proceed immediately with the requested work, including checking access and committing if that is part of the task. The assistant should not ask for another confirmation unless there is a true blocker.

### Rule 2: Keep MASTER_PLAN.md Updated

`MASTER_PLAN.md` is the project memory and master planning document.

Every time the user gives a new rule, major decision, architecture change, project convention, or important idea, it should be added to `MASTER_PLAN.md` as part of the next project commit.

### Rule 3: Every Commit Must Be Self-Documenting

Every commit should leave the repository in a state where a new ChatGPT conversation can read `MASTER_PLAN.md` and understand the project, rules, current version, decisions, and next likely steps.

### Rule 4: Report the New Version After Each Commit

After every committed change, report the new version number to the user.

### Rule 5: Versioned Commit Messages

Commit messages must include the version transition.

Single-commit format:

```text
dJT vX.Y.Z -> vA.B.C: short description
```

Multi-commit format:

```text
dJT vX.Y.Z -> vA.B.C (x of y) - short description
```

New repository initialization may use `null` as the starting version.

---

## Versioning System

dJT will use semantic-style versioning.

### Version Format

```text
vMAJOR.MINOR.PATCH
```

### Meaning

- **MAJOR**: Large breaking direction changes or first full release.
- **MINOR**: New feature area or meaningful capability added.
- **PATCH**: Small updates, documentation changes, rule updates, bug fixes, or refinements.

### Initial Versions

- `null`: Empty repository before migration.
- `v0.2.0`: Migrated voice-first command prototype.
- `v0.2.1`: Testable PWA parser improvement release.
- `v1.0.0`: First genuinely usable DJ app release.

---

## Command System Philosophy

The app should understand commands through this pipeline:

```text
User speech/text -> command parser -> structured action -> action executor -> Spotify/app behavior
```

The app should not directly execute raw natural language. It should execute only known structured actions.

Different user phrases should map to the same structured action when the intent is the same.

The parser should prioritize negative intent before matching positive words like `more`. For example, `don't play any more country tonight` must be understood as blocking or avoiding country, not as requesting more country.

Threatening or emotional phrasing should be interpreted by intent, not literally. If the local parser cannot confidently distinguish the intent, AI fallback should be used later and the phrase should be saved to the AI Review Queue now.

---

## Command Categories

### 1. Playback Control

- play
- pause
- resume
- skip
- previous song
- restart song
- replay this song
- play this song from the beginning
- stop after this song
- volume up
- volume down
- mute
- unmute

### 2. Queue Control

- add this song to the queue
- play this next
- move this song later
- clear the queue
- remove this song from the queue
- what is next?
- shuffle upcoming songs

### 3. Artist Rules

- do not play this artist for a specified period
- never play this artist tonight
- never play this artist for the next 7 days
- block this artist permanently
- play more of this artist tonight
- play less of this artist tonight
- play this artist every certain number of songs
- remove an artist block
- show blocked artists

### 4. Song Rules

- do not play this song again tonight
- never play this song
- play this song more often
- add this song to favorites
- remove this song from rotation
- play this song next time a slow song is needed

### 5. Genre Rules

- do not play any more country tonight
- no more country tonight
- stop playing country tonight
- play more country
- play less pop
- switch away from country
- enough country

### 6. Playlist and Library Actions

- add this song to my playlist
- add this artist to my playlist
- create a playlist with a specified name
- save this song
- save this album
- show my DJ playlist
- remove this song from a playlist

### 7. Music Direction

- keep it upbeat
- slow it down
- make it rowdier
- no sad songs
- play more 90s music
- play more singalong songs
- keep the energy at 8
- play music like the current song

### 8. Time-Based Rules

The parser should convert time phrases into a standard expiration time or session scope.

- tonight
- one hour
- seven days
- 7 days
- next 7 days
- the next 7 days
- next seven days
- the next seven days
- a week
- until midnight
- until next weekend
- permanently
- just this party

### 9. DJ Session Controls

- start party mode
- start dinner mode
- start background mode
- start road trip mode
- start country night
- end DJ session
- save tonight's history
- do not repeat anything from tonight
- show what was played tonight

### 10. Discovery Commands

- find songs like this
- find more artists like this
- play something new
- play something I probably know
- play deep cuts
- play popular songs only
- avoid overplayed songs

### 11. Confirmation and Correction Commands

- yes
- no
- cancel that
- undo that
- that is not what I meant
- try again
- confirm
- do it
- forget that rule

---

## Initial MVP Action List

The first command engine should support these structured actions:

1. `play`
2. `pause`
3. `skip_track`
4. `restart_track`
5. `play_next`
6. `block_artist`
7. `favor_artist`
8. `reduce_artist`
9. `block_song`
10. `favor_song`
11. `block_genre`
12. `set_genre_preference`
13. `add_current_song_to_playlist`
14. `add_artist_to_playlist`
15. `set_energy`
16. `show_rules`
17. `undo_last_action`
18. `needs_ai_interpretation`

---

## v0.2.1 Prototype Scope

The v0.2.1 prototype remains intentionally small. It does not connect to Spotify and does not call AI.

It includes:

- PWA install metadata.
- dJT app icon branding.
- Better parser phrase coverage.
- Negative-intent-first parsing.
- Genre blocking.
- Regression tests.
- Local AI Review Queue for commands that would need AI later.

---

## AI Review Queue

Commands that return `needs_ai_interpretation` should be saved in browser `localStorage` with:

- original phrase
- source (`voice` or `debug`)
- reason
- timestamp

The UI should expose this queue so testing can reveal which natural phrases are not yet handled locally. During future revisions, the queue should be reviewed and converted into deterministic parser rules where practical.

This allows dJT to learn from testing without immediately requiring paid AI calls.

---

## Regression Tests

These real phrases were found during testing and must remain handled correctly:

| Phrase | Expected Action |
|---|---|
| `never play Tom Petty for the next 7 days` | `block_artist`, artist `Tom Petty`, duration `7 days` |
| `play this song from the beginning` | `restart_track` |
| `don't play any more country tonight` | `block_genre`, genre `Country`, duration `tonight` |

---

## AI Cost Strategy

The ChatGPT web subscription and OpenAI API usage are separate.

The app should use the OpenAI API only when AI is enabled and only when local parsing cannot confidently resolve the command.

Recommended cost-control features:

- AI assistant toggle: on/off.
- Local rule engine first.
- AI fallback only for ambiguous or complex commands.
- Cache prior interpretations to avoid repeat AI calls.
- Optional live cost counter showing estimated AI usage for the session, month, and lifetime.
- Spending limits should be configured on the OpenAI API account when available.

If AI is disabled or never called, AI usage cost should be zero.

---

## Future Ideas Backlog

- Spotify authentication.
- Spotify playback controls.
- Spotify playlist management.
- Live AI cost counter.
- AI interpretation cache.
- Plugin-style architecture for future modules.
- Guest request mode.
- Party mode.
- Dinner mode.
- Road trip mode.
- Country night mode.
- Rule history.
- Undo stack.
- Blocked artist list.
- Favored artist list.
- Session playback history.
- Smart recommendations based on current song.
- Energy-level management.
- Explicit-song filtering.
- Emergency "save the dance floor" control.
- AI-generated DJ announcements.
- Smart lighting integration if desired later.
- Karaoke mode.
- Trivia mode.
- Holiday mode.

---

## Decision Log

### Decision: Use a Web App Instead of Native iOS

A native iOS app would require macOS and Xcode. Since the user does not have a Mac and wants to avoid unnecessary costs, the project will begin as a web app hosted on GitHub Pages.

### Decision: Use GitHub Pages for Hosting

GitHub Pages is free, fits the user's existing GitHub workflow, and works well for a browser-based app on iPad/iPhone.

### Decision: Use a Hybrid Rule Engine and AI Fallback

Routine commands should be handled locally to avoid cost and improve speed. AI should be reserved for ambiguous, conversational, or context-heavy commands.

### Decision: Use Structured Actions

All commands, whether locally parsed or AI-interpreted, must map to structured actions before execution. This keeps the execution engine deterministic and safer.

### Decision: Maintain MASTER_PLAN.md as Project Memory

The master plan should contain the rules, architecture, command categories, decisions, version history, and next steps so work can resume cleanly in a new chat.

### Decision: Build Voice First

The user does not intend for typing to be the main interaction model. dJT should be designed around voice commands from the beginning. Typed input may remain as a debug fallback only.

### Decision: Rename Project Repository

The project was originally started in `jtaylor807/JTDJ`, then migrated to `jtaylor807/dJT` at the user's request.

### Decision: Make dJT a PWA

dJT should be installable from Safari using Share -> Add to Home Screen and should launch like an app where supported.

### Decision: Capture AI-Needed Phrases Locally

Before adding real AI calls, commands that need AI should be saved locally during testing so the user and assistant can find opportunities to improve deterministic parsing.

---

## Project Conventions

### Main Planning File

```text
MASTER_PLAN.md
```

### Generated App Entry Point

```text
index.html
```

### Commit Message Format

Single commit:

```text
dJT vOLD -> vNEW: concise description
```

Multiple commits for the same version change:

```text
dJT vOLD -> vNEW (x of y) - concise description
```

For repository initialization or migration from an empty repo:

```text
dJT null -> vNEW (x of y) - concise description
```

### Version Updates

Every commit should update the version summary and version history in this file.

### Change Process

1. User requests a change.
2. Assistant explains what will be changed.
3. Assistant waits for the user to say **go**.
4. Assistant makes the change.
5. Assistant updates `MASTER_PLAN.md` if needed.
6. Assistant commits with a versioned commit message.
7. Assistant reports the new version.

---

## Version History

### v0.2.1 - 2026-06-23

Testable PWA parser improvement release.

Included:

- PWA metadata and manifest.
- dJT app icon.
- Parser fixes for testing bugs.
- Expanded phrase support.
- Genre blocking.
- AI Review Queue.
- Regression tests.
- Rule that every revision ends testable.

### v0.2.0 - 2026-06-23

Voice-first command prototype migrated into the renamed `dJT` repository.

Included:

- `index.html` web app entry point.
- `style.css` basic responsive UI styling.
- `app.js` voice recognition and local parser logic.
- Browser speech recognition support check.
- Debug-only typed command fallback.
- Structured JSON action output.
- Master plan update for voice-first direction.
- Multi-commit version message convention.
- Repository rename/migration from `JTDJ` to `dJT`.

---

## Next Likely Steps

1. Enable GitHub Pages for `jtaylor807/dJT` from the `main` branch and `/root` folder.
2. Add dJT to the iPad/iPhone Home Screen from Safari.
3. Test voice recognition and parser behavior.
4. Review the AI Review Queue after testing.
5. Convert frequent AI-needed phrases into deterministic parser rules.
6. Decide how to persist actual DJ rules locally.
7. Add a visible rule list for blocked/favored artists, genres, and songs.
8. Add Spotify authentication only after the command parser proves useful.
