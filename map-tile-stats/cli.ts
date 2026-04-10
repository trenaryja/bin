#!/usr/bin/env bun
// map-tile-stats CLI — measure actual vs estimated file sizes for Mapbox tile composites
import { runCLI } from '@/lib'
import { log, spinner } from '@clack/prompts'
import chalk from 'chalk'
import {
	BYTES_PER_PIXEL,
	LOCATIONS,
	type Format,
	type TestResult,
	boundsToGrid,
	formatBytes,
	locationToBounds,
	runTest,
} from './core'

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

async function main() {
	const args = process.argv.slice(2)
	let zooms = [12, 14]
	let locationIdx: number | null = null
	let json = false

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case '--help':
			case '-h':
				printHelp()
				process.exit(0)
				break
			case '--zoom':
			case '-z':
				zooms = args[++i].split(',').map(Number)
				break
			case '--location':
			case '-l':
				locationIdx = Number(args[++i])
				break
			case '--list':
				for (const [i, loc] of LOCATIONS.entries()) {
					console.log(`  ${chalk.dim(String(i).padStart(2))}  ${loc.name}`)
				}
				process.exit(0)
				break
			case '--json':
				json = true
				break
			default:
				if (args[i].startsWith('-')) {
					console.error(`error: unknown flag: ${args[i]}`)
					process.exit(1)
				}
		}
	}

	const locations = locationIdx !== null ? [LOCATIONS[locationIdx]] : LOCATIONS

	const allResults: TestResult[] = []
	const cases: { name: string; zoom: number }[] = []
	for (const loc of locations) {
		for (const z of zooms) {
			const bounds = locationToBounds(loc, z)
			const { cols, rows } = boundsToGrid(bounds)
			cases.push({ name: loc.name, zoom: z })
			// Skip enormous grids unless explicitly targeted
			if (cols * rows > 200 && locationIdx === null) continue

			const s = spinner()
			const tiles = cols * rows
			s.start(`${loc.name} z${z} (${cols}×${rows} = ${tiles} tiles)`)

			const results = await runTest(bounds, z, loc.name, (done, total) => {
				s.message(`${loc.name} z${z} — ${done}/${total} tiles`)
			})

			allResults.push(...results)
			const png = results.find((r) => r.format === 'png')!
			const jpg = results.find((r) => r.format === 'jpg')!
			s.stop(
				`${loc.name} z${z}  ${chalk.dim(`PNG ${png.bpp.toFixed(3)} bpp (${formatBytes(png.actual)})`)}  ${chalk.dim(`JPG ${jpg.bpp.toFixed(3)} bpp (${formatBytes(jpg.actual)})`)}`,
			)
		}
	}

	if (json) {
		console.log(JSON.stringify(allResults, null, 2))
		return
	}

	// Summary
	log.step(chalk.bold('Summary'))

	for (const format of ['png', 'jpg'] as const) {
		const subset = allResults.filter((r) => r.format === format)
		if (subset.length === 0) continue
		const bpps = subset.map((r) => r.bpp)
		const sorted = [...bpps].sort((a, b) => a - b)
		const min = sorted[0]
		const max = sorted.at(-1)!
		const mean = bpps.reduce((a, b) => a + b, 0) / bpps.length
		const median = sorted[Math.floor(sorted.length / 2)]
		const p75 = sorted[Math.floor(sorted.length * 0.75)]
		const p90 = sorted[Math.floor(sorted.length * 0.9)]

		console.log()
		console.log(
			`  ${chalk.bold(format.toUpperCase())} bytes-per-pixel  ${chalk.dim(`(${subset.length} samples, current estimate: ${BYTES_PER_PIXEL[format]})`)}`,
		)
		console.log(
			`    min ${chalk.cyan(min.toFixed(4))}  median ${chalk.cyan(median.toFixed(4))}  mean ${chalk.cyan(mean.toFixed(4))}  p75 ${chalk.cyan(p75.toFixed(4))}  p90 ${chalk.cyan(p90.toFixed(4))}  max ${chalk.cyan(max.toFixed(4))}`,
		)
	}

	// Detail table
	console.log()
	log.step(chalk.bold('Detail'))
	console.log()

	const hdr = `  ${'Location'.padEnd(18)} ${'Zoom'.padStart(4)} ${'Tiles'.padStart(5)} ${'Fmt'.padEnd(3)} ${'Actual'.padStart(10)} ${'BPP'.padStart(8)} ${'Error'.padStart(8)}`
	console.log(chalk.dim(hdr))
	console.log(chalk.dim(`  ${'─'.repeat(hdr.length - 2)}`))

	for (const r of allResults) {
		const errorStr = `${r.error > 0 ? '+' : ''}${r.error.toFixed(0)}%`
		const errorColor = Math.abs(r.error) > 50 ? chalk.yellow : chalk.green
		console.log(
			`  ${r.name.padEnd(18)} ${String(r.zoom).padStart(4)} ${String(r.tiles).padStart(5)} ${r.format.toUpperCase().padEnd(3)} ${formatBytes(r.actual).padStart(10)} ${r.bpp.toFixed(4).padStart(8)} ${errorColor(errorStr.padStart(8))}`,
		)
	}
	console.log()
}

runCLI(main)
