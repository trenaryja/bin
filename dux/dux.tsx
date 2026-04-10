#!/usr/bin/env bun
import { accessSync, constants, existsSync } from 'fs'
import { render } from 'ink'
import { parseArgs } from 'util'
import React from 'react'
import { App } from './app.tsx'

const { values, positionals } = parseArgs({
	allowPositionals: true,
	args: process.argv.slice(2),
	options: {
		depth: { type: 'string', short: 'd' },
		'no-hidden': { type: 'boolean' },
		help: { type: 'boolean', short: 'h' },
	},
})

if (values.help) {
	console.log(`
  🦆 dux — interactive disk usage explorer

  Usage: dux [path] [options]

  Options:
    -d, --depth <n>    Max directory depth to display (1-100)
    --no-hidden        Skip hidden files/directories
    -h, --help         Show this help

  Navigation:
    ↑/↓    Move cursor
    →/Enter Enter directory
    ←/Bksp Go back
    q       Quit
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

const { waitUntilExit } = render(<App targetPath={targetPath} maxDepth={maxDepth} showHidden={showHidden} />)
await waitUntilExit()
