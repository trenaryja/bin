# bin-tools

Personal CLI platform — tools compiled to native binaries, available everywhere on `$PATH`.

## Philosophy

Every tool in this repo is built as a **progressive CLI**: usable both as a scriptable/AI-callable program via flags, and as a rich interactive terminal experience when flags aren't provided. The flags and prompts derive from the same definition — defined once, not twice.

This means:

- AI agents can call tools non-interactively via flags
- Humans get prompted for anything not provided
- Shell scripts can automate tools without UI interaction

## Setup

```bash
bun install   # TypeScript dependencies
bun run build # Compiles all binaries to .bin/
```

Requires [Bun](https://bun.sh), [Rust/cargo](https://rustup.rs), and [Go](https://go.dev) for all targets. Missing runtimes are skipped automatically.

Binaries land in `.bin/` (gitignored). Add to PATH:

```bash
export PATH="$HOME/Git/bin-tools/.bin:$PATH"
```

## Projects

### `git-ai-commit`

Generates AI commit messages from staged diffs via Ollama. The reference implementation — see [`git-ai-commit/README.md`](./git-ai-commit/README.md).

## Shared libraries

Co-located by domain in `lib/`. Each module has a TypeScript and Rust implementation side by side.

| Module   | TS          | Rust        | Go          | Description                                                     |
| -------- | ----------- | ----------- | ----------- | --------------------------------------------------------------- |
| `ollama` | `ollama.ts` | `ollama.rs` | `ollama.go` | Ollama chat client, `OllamaModel` type                          |
| `git`    | `git.ts`    | `git.rs`    | `git.go`    | `isGitRepo`, `getStagedDiff`, `commit`                          |
| `editor` | `editor.ts` | `editor.rs` | `editor.go` | `openEditor` — spawns `$EDITOR`, blocks, returns result         |
| `cli`    | `cli.ts`    | —           | —           | `runCLI` — wraps `main()` with consistent error/Ctrl+C handling |
| `tui`    | `tui.ts`    | —           | —           | `tuiHeading` — styled terminal heading                          |

TypeScript: `lib/index.ts` barrel + `@/lib` path alias.
Rust: `lib/index.rs` as the crate root (`[lib] path = "lib/index.rs"` in `Cargo.toml`).
Go: `lib/` is `package lib`, imported as `bin-tools/lib`.

## Adding a new tool

**TypeScript:** Add an entry to `TS_SCRIPTS` in `build.ts`.
**Rust:** Add a `[[bin]]` entry in `Cargo.toml`.
**Go:** Add an entry to `GO_SCRIPTS` in `build.ts` with a build tag.

## Architecture goals

- **Single source of truth** — config, types, and CLI interface defined once, derived everywhere. `config.json` per project is the current approach; the next step is extending it to also define the CLI argument schema so flag parsers (Commander, clap, cobra) and interactive prompts are both derived from it.
- **Consistency across languages** — same UX, same behavior, same file structure regardless of implementation language.
- **Co-location** — `.ts` and `.rs` and `.go` files for the same domain live next to each other in `lib/`.
