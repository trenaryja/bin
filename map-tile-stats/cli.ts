#!/usr/bin/env bun
// map-tile-stats CLI — measure actual vs estimated file sizes for Mapbox tile composites
import { runCLI } from '@/lib'
import { log, spinner } from '@clack/prompts'
import chalk from 'chalk'
import { boundsToGrid, BYTES_PER_PIXEL, formatBytes, LOCATIONS, locationToBounds, runTest } from './core'
import type { TestResult } from './core'

function printHelp() {
	console.log(`Usage: map-tile-stats [options]

Measure actual vs estimated file sizes for Mapbox tile composites.
Fetches real tiles, composites with sharp, and compares to byte-per-pixel estimates.

Options:
  --zoom, -z <n,...>   Zoom levels to test (default: 12,14)
  --location, -l <n>   Only test location at index N (0-based)
  --list               List built-in locations and exit
  --json               Output results as JSON
  -h, --help           Show this help

Current estimates: PNG ${BYTES_PER_PIXEL.png} bpp, JPG ${BYTES_PER_PIXEL.jpg} bpp`)
}

// ── Argument parsing ─────────────────────────────────────────────────────────

type CliOptions = {
	json: boolean
	locationIdx: number | null
	zooms: number[]
}

function printLocations() {
	for (const [locationIndex, loc] of LOCATIONS.entries()) {
		console.log(`  ${chalk.dim(String(locationIndex).padStart(2))}  ${loc.name}`)
	}
}

function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = { json: false, locationIdx: null, zooms: [12, 14] }

	// Handled before the switch: `process.exit` is `never`, but `no-fallthrough` can't see
	// that, and the `break` it would demand is unreachable code to TypeScript.
	if (args.includes('--help') || args.includes('-h')) {
		printHelp()
		process.exit(0)
	}

	if (args.includes('--list')) {
		printLocations()
		process.exit(0)
	}

	let index = 0

	while (index < args.length) {
		const arg = args[index]! // while-guard: index < args.length
		index += 1

		switch (arg) {
			case '--zoom':
			case '-z':
				options.zooms = (args[index] ?? '').split(',').map(Number)
				index += 1
				break
			case '--location':
			case '-l':
				options.locationIdx = Number(args[index])
				index += 1
				break
			case '--json':
				options.json = true
				break
			default:
				if (arg.startsWith('-')) {
					console.error(`error: unknown flag: ${arg}`)
					process.exit(1)
				}
		}
	}

	return options
}

// ── Measurement ──────────────────────────────────────────────────────────────

/** Grids larger than this are skipped unless the location was explicitly targeted */
const MAX_UNTARGETED_TILES = 200

async function collectResults({ locationIdx, zooms }: CliOptions): Promise<TestResult[]> {
	const locations = locationIdx !== null ? LOCATIONS.slice(locationIdx, locationIdx + 1) : LOCATIONS
	const allResults: TestResult[] = []

	for (const loc of locations) {
		// Serial on purpose: each run drives one spinner line and shares the tile server's
		// connection budget with every other run.
		for (const zoom of zooms) {
			const bounds = locationToBounds(loc, zoom)
			const { cols, rows } = boundsToGrid(bounds)
			const tiles = cols * rows

			if (tiles > MAX_UNTARGETED_TILES && locationIdx === null) continue

			const s = spinner()
			s.start(`${loc.name} z${zoom} (${cols}×${rows} = ${tiles} tiles)`)

			const results = await runTest({
				bounds,
				zoom,
				label: loc.name,
				onProgress: (done, total) => s.message(`${loc.name} z${zoom} — ${done}/${total} tiles`),
			})

			allResults.push(...results)
			const png = results.find((r) => r.format === 'png')!
			const jpg = results.find((r) => r.format === 'jpg')!
			s.stop(
				`${loc.name} z${zoom}  ${chalk.dim(`PNG ${png.bpp.toFixed(3)} bpp (${formatBytes(png.actual)})`)}  ${chalk.dim(`JPG ${jpg.bpp.toFixed(3)} bpp (${formatBytes(jpg.actual)})`)}`,
			)
		}
	}

	return allResults
}

// ── Reporting ────────────────────────────────────────────────────────────────

function printSummary(allResults: TestResult[]) {
	log.step(chalk.bold('Summary'))

	for (const format of ['png', 'jpg'] as const) {
		const subset = allResults.filter((r) => r.format === format)
		if (subset.length === 0) continue

		const bpps = subset.map((x) => x.bpp)
		const sorted = [...bpps].sort((a, b) => a - b)
		const min = sorted[0]!
		const max = sorted.at(-1)!
		const mean = bpps.reduce((a, b) => a + b, 0) / bpps.length
		const median = sorted[Math.floor(sorted.length / 2)]!
		const p75 = sorted[Math.floor(sorted.length * 0.75)]!
		const p90 = sorted[Math.floor(sorted.length * 0.9)]!

		console.log()
		console.log(
			`  ${chalk.bold(format.toUpperCase())} bytes-per-pixel  ${chalk.dim(`(${subset.length} samples, current estimate: ${BYTES_PER_PIXEL[format]})`)}`,
		)
		console.log(
			`    min ${chalk.cyan(min.toFixed(4))}  median ${chalk.cyan(median.toFixed(4))}  mean ${chalk.cyan(mean.toFixed(4))}  p75 ${chalk.cyan(p75.toFixed(4))}  p90 ${chalk.cyan(p90.toFixed(4))}  max ${chalk.cyan(max.toFixed(4))}`,
		)
	}
}

function printDetail(allResults: TestResult[]) {
	console.log()
	log.step(chalk.bold('Detail'))
	console.log()

	const header = `  ${'Location'.padEnd(18)} ${'Zoom'.padStart(4)} ${'Tiles'.padStart(5)} ${'Fmt'.padEnd(3)} ${'Actual'.padStart(10)} ${'BPP'.padStart(8)} ${'Error'.padStart(8)}`
	console.log(chalk.dim(header))
	console.log(chalk.dim(`  ${'─'.repeat(header.length - 2)}`))

	for (const result of allResults) {
		const errorStr = `${result.error > 0 ? '+' : ''}${result.error.toFixed(0)}%`
		const errorColor = Math.abs(result.error) > 50 ? chalk.yellow : chalk.green
		console.log(
			`  ${result.name.padEnd(18)} ${String(result.zoom).padStart(4)} ${String(result.tiles).padStart(5)} ${result.format.toUpperCase().padEnd(3)} ${formatBytes(result.actual).padStart(10)} ${result.bpp.toFixed(4).padStart(8)} ${errorColor(errorStr.padStart(8))}`,
		)
	}

	console.log()
}

async function main() {
	const options = parseArgs(process.argv.slice(2))
	const allResults = await collectResults(options)

	if (options.json) {
		console.log(JSON.stringify(allResults, null, 2))
		return
	}

	printSummary(allResults)
	printDetail(allResults)
}

runCLI(main)
