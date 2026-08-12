# bin

## CLI Design

- **Progressive CLI pattern:** Every tool accepts flags. Interactive by default, fully flag-driven for AI agents. Derive new CLI entrypoints from `sayx` as the reference implementation.

## Changelogs (git-cliff)

Subject lines appear directly in CHANGELOG.md — write them as changelog entries.

| Prefix                          | Changelog Section |
| ------------------------------- | ----------------- |
| `feat`                          | Added             |
| `fix`                           | Fixed             |
| `refactor`                      | Changed           |
| `perf`                          | Performance       |
| `docs`                          | Documentation     |
| `chore`, `ci`, `build`, `style` | Internal          |
| `test`, `chore(release)`        | Skipped           |

### Commit body conventions

- Bullet-point list with technical detail — name specific files, functions, flags
- Group by concern for multi-area commits (e.g. "Dependencies:", "Build:")
- Each bullet should be independently meaningful
