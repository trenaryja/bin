# narrate

Reads AI agent responses aloud, locally and for free. `narrate` is an engine with a CLI on top: it
resolves text from a source (a Claude Code transcript message, a file, the clipboard, stdin),
normalizes the markdown for speech, splits it into sentence chunks, synthesizes each one with a
speech backend, and plays them in order while publishing its progress to a state directory. Every
command speaks JSON, and `play` detaches by default, so a UI — the Raycast view is the first one —
drives the whole thing by shelling out and polling.

## Build

```sh
bun run build          # from the repo root; binaries land in .bin/
bun narrate/cli.ts     # or run it straight from source
```

## Commands

Sources are shared by `play`, `summarize`, `normalize`, and `chunks`: `--message <id>`,
`--file <path>`, `--clipboard`, or piped stdin (the default). Every command takes `--json` and
`--help`; errors go to stderr with exit 1, as `{ "error": "..." }` under `--json`.

| Command     | Example                                                       |
| ----------- | ------------------------------------------------------------- |
| `play`      | `echo "hello there" \| narrate play --backend say`            |
| `stop`      | `narrate stop --json`                                         |
| `status`    | `narrate status --json`                                       |
| `seek`      | `narrate seek 4`                                              |
| `rate`      | `narrate rate 1.5`                                            |
| `list`      | `narrate list --project ~/Git/bin --limit 10 --json`          |
| `summarize` | `narrate summarize --message <id> --summarizer claude --play` |
| `voices`    | `narrate voices --backend say`                                |
| `normalize` | `narrate normalize --file notes.md`                           |
| `chunks`    | `narrate chunks --file notes.md`                              |

`play` prints `{ pid, label, chunkTotal }` and returns before any audio starts: it writes the
resolved text to a handoff file in the state dir and re-spawns itself detached with
`--foreground --raw --file <handoff>`, which the child deletes once read. `--foreground` skips the
re-spawn and narrates in the calling process, printing the final state.

## State directory

`~/.local/state/narrate/`, or `$NARRATE_STATE_DIR`. A view reads and writes these files directly —
they are the control protocol, not an implementation detail.

| Path         | Role                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| `state.json` | current playback state, rewritten on every phase and chunk change         |
| `pid`        | pid of the `afplay` process for the chunk being heard                     |
| `stop`       | sentinel: create it (empty) to stop; the runner consumes it within 100 ms |
| `seek`       | sentinel: write a chunk index to jump there; consumed the same way        |
| `rate`       | sentinel: write a playback rate; the current sentence replays at it       |
| `audio/`     | synthesized wav files                                                     |
| `scratch/`   | working dir for summarizer CLIs, excluded from `narrate list`             |
| `runner.log` | one line per chunk that failed to synthesize and was skipped              |

`state.json` fields: `phase` (`synthesizing` | `playing` | `stopped` | `done` | `error`), `pid` of
the runner, `label`, `origin`, `backend`, `voiceId`, `speed`, `chunkIndex`, `chunks` (the full text
of every chunk), `skipped` (indices whose synthesis failed), optional `error`, and `updatedAt`.
`narrate status` reports `{ "phase": "idle" }` when there is no state file, and when an active phase
is left behind by a runner that is no longer alive.

## Requirements

- macOS: `afplay` and `say` ship with the system.
- `say` backend: premium voices are an opt-in download in System Settings → Accessibility → Spoken
  Content → System Voice → Manage Voices. `Ava (Premium)` is preferred when installed.
- `kokoro` backend (the default): `brew install speech`.
- `summarize`: `claude` or `opencode` on PATH.

## Design

[`CONTEXT.md`](CONTEXT.md) for the architecture principles and glossary; [`docs/adr/`](docs/adr) for
the decisions behind the backends, summarizers, engine/view split, normalization, and sources.
