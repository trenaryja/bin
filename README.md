# bin-tools

Personal CLI scripts — compiled to native binaries, available everywhere on `$PATH`.

## Setup

```bash
bun install
bun run build
```

Binaries are compiled to `.bin/` (gitignored). `~/.zshrc` has `~/Git/bin-tools/.bin` on PATH.

## Scripts

| Binary | Source | Description |
|--------|--------|-------------|
| `git-ai-commit` | `src/git-ai-commit.ts` | AI commit messages via Ollama — [@clack/prompts](https://github.com/bombshell-dev/clack) UI |
| `git-ai-commit-inquirer` | `src/git-ai-commit-inquirer.ts` | Same, [Inquirer](https://github.com/SBoudrias/Inquirer.js) UI |
| `git-ai-commit-rust` | `rust/git-ai-commit/` | Same, Rust binary with [dialoguer](https://github.com/console-rs/dialoguer) |

## Adding a new script

1. Create `src/my-script.ts`
2. Run `bun run build`
3. Binary lands at `.bin/my-script` and is immediately on PATH

## Shared libraries

- `src/lib/ollama.ts` — typed Ollama chat client
- `src/lib/git.ts` — git diff, commit helpers
