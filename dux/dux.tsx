#!/usr/bin/env bun
import { accessSync, constants, existsSync } from 'fs'
import { render } from 'ink'
import { parseArgs } from 'util'
import { App } from './app.tsx'
import { formatTopTable, toJson, topEntries } from './report.ts'
import { scanToTree } from './tree.ts'

const { values, positionals } = parseArgs({
	allowPositionals: true,
	args: process.argv.slice(2),
	options: {
		depth: { type: 'string', short: 'd' },
		'no-hidden': { type: 'boolean' },
		json: { type: 'boolean' },
		top: { type: 'string', short: 't' },
		help: { type: 'boolean', short: 'h' },
	},
})

if (values.help) {
	console.log(`
  🦆 dux — interactive disk usage explorer

  Usage: dux [path] [options]

  Options:
    -d, --depth <n>    Max directory depth to display (1-100)
    -t, --top <n>      Print the n largest entries and exit (non-interactive)
        --json         Print the tree as JSON and exit (non-interactive)
        --no-hidden    Skip hidden files/directories
    -h, --help         Show this help

  Navigation:
    ↑/↓    Move cursor
    →/Enter Enter directory
    ←/Bksp Go back
    q       Quit

  Sizes are allocated disk blocks with hardlinks counted once, matching du.
  In --top/--json mode the scan is always complete so totals stay accurate,
  and --depth controls output nesting rather than scan depth.
`)
	process.exit(0)
}

const targetPath = positionals[0] ?? '.'

if (!existsSync(targetPath)) {
	console.error(`dux: path does not exist: ${targetPath}`)
	process.exit(1)
}

try {
	accessSync(targetPath, constants.R_OK)
} catch {
	console.error(`dux: permission denied: ${targetPath}`)
	process.exit(1)
}

const parsedDepth = values.depth ? parseInt(values.depth, 10) : undefined

if (parsedDepth !== undefined && Number.isNaN(parsedDepth)) {
	console.error(`dux: invalid depth value: ${values.depth}`)
	process.exit(1)
}

const maxDepth = parsedDepth !== undefined ? Math.max(1, Math.min(parsedDepth, 100)) : undefined
const showHidden = !values['no-hidden']

const parsedTop = values.top !== undefined ? parseInt(values.top, 10) : undefined

if (parsedTop !== undefined && (Number.isNaN(parsedTop) || parsedTop < 1)) {
	console.error(`dux: invalid top value: ${values.top}`)
	process.exit(1)
}

// ── Non-interactive modes ────────────────────────────────────────────────────

if (values.json || parsedTop !== undefined) {
	// Scan the full tree regardless of --depth: truncating the walk would omit
	// deep files and silently understate every parent's total.
	const { root } = await scanToTree(targetPath, showHidden)

	if (parsedTop !== undefined) {
		const entries = topEntries(root, parsedTop)
		const output = values.json
			? JSON.stringify(
					entries.map((entry) => ({ name: entry.name, size: entry.totalSize, isDir: entry.children.size > 0 })),
					null,
					2,
				)
			: formatTopTable(entries, root.totalSize)
		console.log(output)
	} else {
		console.log(JSON.stringify(toJson(root, maxDepth ?? 2), null, 2))
	}

	process.exit(0)
}

const { waitUntilExit } = render(<App targetPath={targetPath} maxDepth={maxDepth} showHidden={showHidden} />)
await waitUntilExit()
