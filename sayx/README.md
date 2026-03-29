# sayx

Interactive terminal explorer for macOS speech synthesis voices. Built with [Ink](https://term.ink) and [Bun](https://bun.sh).

Browse, audition, and compare every voice available through macOS `say` — with live filtering, tag-based discovery, configurable playback rates, and persistent favorites.

## Usage

```sh
bun sayx.tsx
```

## Features

- **Voice browser** — scroll through all system voices with bio descriptions and tags
- **Live search** — space-separated terms filter by name, bio, and tags (AND logic)
- **Tag filtering** — chip-based tag input with inline typeahead autocomplete
- **Playback controls** — play, stop, adjust rate (50–500 wpm) with fine and coarse steps
- **Text sources** — deterministic phrases (cyclable), Wikipedia random articles, quotes, or custom text
- **Word highlighting** — animated word-by-word highlight synced to speech rate
- **Audio visualizer** — procedural waveform animation during playback
- **Favorites** — save voice + rate combos, dirty state tracking, explicit save
- **Configurable keybindings** — every key remappable via config
- **Cosmiconfig** — config auto-seeds to `~/.config/sayx/config.json` on first launch

## Tests

```sh
bun test lib/
```

## Config

Config is resolved via [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) and auto-seeded to `~/.config/sayx/config.json` on first launch.

Supported config locations (in resolution order):

1. `sayx.config.ts`
2. `.config/sayxrc.ts`
3. `sayx.config.mjs`
4. `sayx.config.js`
5. `sayx.config.cjs`
6. `"sayx"` field in `package.json`
7. `.sayxrc.json`
8. `.config/sayxrc.json`
9. `.sayxrc.yaml` / `.sayxrc.yml`
10. `.config/sayxrc.yaml`
11. `.sayxrc` (bare, JSON or YAML)
12. `~/.config/sayx/config.json` (XDG fallback, auto-seeded)

The config includes keybindings, voice metadata (bios and tags with era information), deterministic phrases, rate bounds, and favorites.

## Keyboard

Default keybindings and all configurable options are defined in [`config.default.json`](config.default.json).

## License

MIT
