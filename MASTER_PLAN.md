# dJT Master Plan

## Version Summary

**Current Version:** v0.2.2  
**Status:** Current phase wrapped; v0.3.0 intent-engine package planned  
**Last Updated:** 2026-06-24

### v0.2.2 Summary

- Wrapped the current testing/prototype phase before switching to other work.
- Documented the standing rule to think ahead and bundle closely related enhancements into the same proposed revision.
- Documented the preferred future workflow to suspend GitHub Pages builds during multi-commit revisions when the connector supports it, then re-enable after all commits are complete.
- Documented the planned v0.3.0 intent-engine package.
- Preserved the rule that every revision must end in a deployable, testable state.

### v0.2.1 Summary

- Added Progressive Web App support so dJT can be added to the iPhone/iPad Home Screen from Safari.
- Added dJT branding with lowercase `d` and uppercase `JT`.
- Added app icon and manifest metadata.
- Fixed parser bugs found during testing.
- Expanded phrase handling for restart, block, skip, pause, play, favor, reduce, playlist, undo, and rules commands.
- Added `block_genre` handling so phrases like "don't play any more country tonight" do not get misread as "more country."
- Added timed play/favor parsing for phrases like "play Tom Petty for the next 1 hour."
- Added an AI Review Queue that locally captures commands needing AI interpretation so future deterministic rules can be developed.
- Added regression tests from real testing feedback.
- Added the standing rule that every revision must end in a deployable, testable state.

---

## Project Vision

dJT is a custom DJ web app controlled primarily by voice commands. The app should run on an iPad or iPhone through Safari, be hosted for free using GitHub Pages, and eventually control Spotify playback through Spotify's APIs.

The goal is to build a personal DJ assistant that understands practical DJ instructions such as skipping songs, restarting songs, changing energy, immediate play requests, favoring artists, blocking artists or genres for a period of time, adding songs to playlists, capturing unclear phrases for future rules, and managing a live DJ session.

---

## Core Architecture

### Platform

dJT is a web app instead of a native iOS app.

Reasons:

- The user does not have a Mac.
- Native iOS development would require Xcode and macOS.
- A web app can be hosted free on GitHub Pages.
- Safari on iPad/iPhone can run the app without App Store distribution.

### Progressive Web App

dJT should behave like an app when added to the iPhone/iPad Home Screen from Safari.

The app includes:

- `manifest.webmanifest`
- Apple mobile web app meta tags
- theme color
- Home Screen capable mode
- app title
- app icon

The Home Screen name is `dJT`, with lowercase `d` and uppercase `JT`.

### Interface Direction

dJT is voice-first. Typing is only a debug fallback so parser behavior can be tested when voice recognition is unavailable, unreliable, or unsupported.

### Spotify Integration

The app will eventually control Spotify through Spotify APIs where possible.

Expected Spotify-related capabilities:

- authenticate with the user's Spotify Premium account
- search songs, artists, albums, and playlists
- control playback
- add songs to playlists
- manage queue behavior where Spotify allows it
- read current playback state

### AI Strategy

AI is optional.

Current approach:

1. Try to parse commands locally with deterministic rules.
2. If clear, execute locally with no AI cost.
3. If unclear, return `needs_ai_interpretation`.
4. Save unclear phrases to the AI Review Queue in browser `localStorage`.
5. Use those real phrases to decide which new deterministic rules to add.
6. Later, when real AI is added, AI must return structured commands only.

---

## Design Principles

1. Do not require AI when deterministic logic can solve the problem.
2. Every user command must map to a structured action before execution.
3. The app should remain useful with AI disabled.
4. Prioritize reliability over cleverness.
5. Minimize operating cost without sacrificing practical capability.
6. Keep project knowledge in this master plan so a new chat can resume work quickly.
7. Separate command interpretation from command execution.
8. Add new actions deliberately so the command engine remains understandable.
9. Small non-functional quality-of-life improvements are allowed when they do not change existing functionality or contradict prior decisions.
10. Voice is the primary interface; typing is only a fallback/debug tool.
11. Every revision must end in a deployable, testable state before beginning the next feature.
12. Unknown or AI-needed phrases should be captured so real usage can guide future parser rules.
13. Before proposing a revision, think ahead and bundle closely related enhancements together, especially parser architecture, testing, stats, and review tools.

---

## Project Rules

### Rule 1: Wait for "go" Before Making Project Changes

When the user asks for code, files, repository changes, commits, or implementation work, the assistant must first explain what will be done. The assistant must not make the project change until the user explicitly says **go**.

When the user says **go**, proceed immediately with the requested work, including access checks and commits if those are part of the task. Do not ask for another confirmation unless there is a true blocker.

### Rule 2: Keep MASTER_PLAN.md Updated

`MASTER_PLAN.md` is the project memory and master planning document.

Every new project rule, major decision, architecture change, convention, regression test, or important idea should be added to `MASTER_PLAN.md` as part of the next project commit.

### Rule 3: Every Commit Must Be Self-Documenting

Every commit should leave the repo in a state where a new ChatGPT conversation can read `MASTER_PLAN.md` and understand the project, rules, current version, decisions, and next likely steps.

### Rule 4: Report the New Version After Each Commit

After every committed change, report the new version number to the user.

### Rule 5: Versioned Commit Messages

Single commit:

```text
dJT vX.Y.Z -> vA.B.C: short description
```

Multiple commits for the same version:

```text
dJT vX.Y.Z -> vA.B.C (x of y) - short description
```

New repository initialization may use `null` as the starting version.

### Rule 6: Deployment Build Control

For future multi-commit revisions, if the GitHub connector supports it, suspend GitHub Pages builds or deployment during the commit sequence, perform all commits, then re-enable builds so only the final revision is deployed for testing.

If the connector cannot control Pages or Actions, use the closest available workflow and tell the user.

---

## Versioning System

dJT uses semantic-style versioning.

- **MAJOR**: large breaking direction changes or first full release
- **MINOR**: new feature area or meaningful capability
- **PATCH**: small updates, documentation, rule updates, parser fixes, bug fixes, refinements

Known versions:

- `null`: empty repository before migration
- `v0.2.0`: migrated voice-first command prototype
- `v0.2.1`: testable PWA parser improvement release
- `v0.2.2`: phase wrap and v0.3.0 planning documentation
- `v0.3.0`: planned intent-engine package
- `v1.0.0`: first genuinely usable DJ app release

---

## Command System Philosophy

The command pipeline is:

```text
User speech/text -> command parser -> structured action -> action executor -> Spotify/app behavior
```

The app should not directly execute raw natural language. It should execute only known structured actions.

Different user phrases should map to the same structured action when the intent is the same.

The parser should prioritize negative intent before matching positive words like `more`. Example: `don't play any more country tonight` must be understood as avoiding country, not requesting more country.

Threatening or emotional phrasing should be interpreted by intent, not literally. If intent is unclear, save the phrase to the AI Review Queue.

---

## Current Structured Actions

The current parser supports or anticipates these actions:

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

Planned immediate play actions for v0.3.0:

19. `play_artist`
20. `play_song`
21. `play_album`
22. `play_playlist`
23. `play_genre`

---

## Command Categories

### Playback Control

- play
- pause
- resume
- skip
- previous song
- restart song
- replay this song
- play this song from the beginning
- play it from the top
- run it back
- stop after this song

### Immediate Play Requests

These should become first-class intents in v0.3.0 because they are different from long-term favoring.

- play Tom Petty
- play me some Tom Petty
- I want to hear Tom Petty
- let's hear Tom Petty
- put on some Tom Petty
- give me some Tom Petty
- I could go for some Tom Petty
- throw on some Tom Petty
- play some country
- play classic rock
- play some 80s music

### Queue Control

- add this song to the queue
- play this next
- move this song later
- clear the queue
- remove this song from the queue
- what is next?
- shuffle upcoming songs

### Artist Rules

- do not play this artist for a specified period
- never play this artist tonight
- never play this artist for the next 7 days
- block this artist permanently
- play more of this artist tonight
- play this artist for the next 1 hour
- play this artist every certain number of songs
- play less of this artist tonight
- remove an artist block
- show blocked artists

### Song Rules

- do not play this song again tonight
- never play this song
- play this song more often
- add this song to favorites
- remove this song from rotation

### Genre Rules

- do not play any more country tonight
- no more country tonight
- stop playing country tonight
- play more country
- play less pop
- switch away from country
- enough country

### Playlist and Library Actions

- add this song to my playlist
- add this artist to my playlist
- create a playlist with a specified name
- save this song
- save this album
- show my DJ playlist
- remove this song from a playlist

### Music Direction

- keep it upbeat
- slow it down
- make it rowdier
- no sad songs
- play more 90s music
- play more singalong songs
- keep the energy at 8
- play music like the current song

### Time-Based Rules

The parser should convert time phrases into a standard expiration time or session scope.

- tonight
- one hour
- 1 hour
- next 1 hour
- the next 1 hour
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

### Confirmation and Correction Commands

- yes
- no
- cancel that
- undo that
- never mind
- scratch that
- that is not what I meant
- try again
- confirm
- do it
- forget that rule

---

## AI Review Queue

Commands that return `needs_ai_interpretation` are saved in browser `localStorage` with:

- original phrase
- source (`voice` or `debug`)
- reason
- timestamp

The UI exposes the queue so testing reveals which phrases are not yet handled locally. During future revisions, the queue should be reviewed and converted into deterministic parser rules where practical.

This lets dJT learn from testing without immediately requiring paid AI calls.

### Planned AI Review Queue Improvements

The queue should evolve from a simple list into an aggregated review system.

Each phrase or normalized phrase group should track:

- phrase
- normalized phrase
- count
- first seen
- last seen
- last source
- last reason
- whether a deterministic rule has been implemented

This will show the most common unsupported phrases and guide future rule development.

---

## Regression Tests

These real phrases were found during testing or requested during the v0.2.1 revision and must remain handled correctly:

| Phrase | Expected Action |
|---|---|
| `never play Tom Petty for the next 7 days` | `block_artist`, artist `Tom Petty`, duration `7 days` |
| `play this song from the beginning` | `restart_track` |
| `don't play any more country tonight` | `block_genre`, genre `Country`, duration `tonight` |
| `play Tom Petty for the next 1 hour` | `favor_artist`, artist `Tom Petty`, duration `1 hour` |

Planned v0.3.0 regression additions:

| Phrase | Expected Action |
|---|---|
| `Play me some Tom Petty` | `play_artist`, artist `Tom Petty` |
| `Let's hear Tom Petty` | `play_artist`, artist `Tom Petty` |
| `Put on some Tom Petty` | `play_artist`, artist `Tom Petty` |
| `Give me some Tom Petty` | `play_artist`, artist `Tom Petty` |

---

## Planned v0.3.0: Intent Engine Package

v0.3.0 should be a bundled parser architecture revision, not a piecemeal phrase-fix release.

It should include:

1. **Intent Engine**
   - Determine intent before phrase-specific matching.
   - Separate immediate play, favor, reduce, block, temporary block, queue, playback, playlist, genre, and correction intents.

2. **Immediate Play Actions**
   - Add `play_artist`, `play_song`, `play_album`, `play_playlist`, and `play_genre`.
   - Treat commands like "Play me some Tom Petty" as immediate requests, not favor rules.

3. **AI Review Queue Aggregation**
   - Group repeated unknown phrases.
   - Track count, first seen, last seen, source, and status.
   - Show most common unknown phrases first.

4. **Regression Test Database**
   - Move beyond a list in `MASTER_PLAN.md`.
   - Store test cases in a dedicated data structure or file.
   - Include phrase, expected action, expected fields, and version fixed.

5. **Parser Statistics**
   - Show commands handled locally.
   - Show commands captured for AI review.
   - Show local parse success rate.
   - Show most common unknown phrases.
   - Show most common intents.

This package should make future parser improvements data-driven and reduce the need for AI calls.

---

## AI Cost Strategy

The ChatGPT web subscription and OpenAI API usage are separate.

The app should use the OpenAI API only when AI is enabled and only when local parsing cannot confidently resolve the command.

Recommended cost-control features:

- AI assistant toggle: on/off
- local rule engine first
- AI fallback only for ambiguous or complex commands
- cache prior interpretations
- optional live cost counter
- OpenAI API spending limits when available

If AI is disabled or never called, AI usage cost should be zero.

---

## Future Ideas Backlog

- Spotify authentication
- Spotify playback controls
- Spotify playlist management
- persistent rule storage
- visible rule list for blocked/favored artists, genres, and songs
- live AI cost counter
- AI interpretation cache
- plugin-style architecture
- guest request mode
- party mode
- dinner mode
- road trip mode
- country night mode
- rule history
- undo stack
- session playback history
- smart recommendations based on current song
- energy-level management
- explicit-song filtering
- emergency "save the dance floor" control
- AI-generated DJ announcements
- smart lighting integration
- karaoke mode
- trivia mode
- holiday mode

---

## Decision Log

### Use a Web App Instead of Native iOS

A native iOS app would require macOS and Xcode. The project begins as a web app hosted on GitHub Pages.

### Use GitHub Pages for Hosting

GitHub Pages is free and works well for a browser-based app on iPad/iPhone.

### Use a Hybrid Rule Engine and AI Fallback

Routine commands should be handled locally. AI should be reserved for ambiguous, conversational, or context-heavy commands.

### Use Structured Actions

All commands must map to structured actions before execution.

### Maintain MASTER_PLAN.md as Project Memory

The master plan contains rules, architecture, command categories, decisions, version history, and next steps so work can resume cleanly in a new chat.

### Build Voice First

dJT should be designed around voice commands from the beginning. Typed input remains only as a debug fallback.

### Rename Project Repository

The project was originally started in `jtaylor807/JTDJ`, then migrated to `jtaylor807/dJT`.

### Make dJT a PWA

dJT should be installable from Safari using Share -> Add to Home Screen and should launch like an app where supported.

### Capture AI-Needed Phrases Locally

Before adding real AI calls, commands that need AI should be saved locally during testing so the user and assistant can improve deterministic parsing.

### Bundle Related Enhancements

When a feature direction reveals obvious companion improvements, the assistant should think ahead and propose them together instead of discovering them one by one.

---

## Project Conventions

Main planning file:

```text
MASTER_PLAN.md
```

Web app entry point:

```text
index.html
```

Every commit should update the version summary and version history when appropriate.

---

## Version History

### v0.2.2 - 2026-06-24

Phase wrap and v0.3.0 planning documentation.

Included:

- Standing rule to bundle obvious related enhancements.
- GitHub Pages build-suspension preference for future multi-commit revisions.
- Planned v0.3.0 intent-engine package.
- Immediate play request category.
- Planned parser statistics and review queue aggregation.

### v0.2.1 - 2026-06-23

Testable PWA parser improvement release.

Included:

- PWA metadata and manifest.
- dJT app icon.
- Parser fixes for testing bugs.
- Expanded phrase support.
- Genre blocking.
- Timed artist favoring such as `play Tom Petty for the next 1 hour`.
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
- Repository rename/migration from `JTDJ` to `dJT`.

---

## Next Likely Steps

1. Switch gears to the user's next task.
2. When returning to dJT, read this file first.
3. Test the current deployed app.
4. Review the AI Review Queue after testing.
5. Build v0.3.0 as the bundled intent-engine package.
6. Add Spotify authentication only after the parser proves useful.
