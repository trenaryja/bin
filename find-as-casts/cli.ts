#!/usr/bin/env bun
// find-as-casts CLI — scan TypeScript files for `as` type assertions (excluding `as const`)
import { runCLI } from '@/lib'
import { type OutputFormat, formatCSV, formatEslint, formatJSON, scan } from './core'

async function main() {
	const args = process.argv.slice(2)
	let format: OutputFormat = 'eslint'
	let dir = '.'

	for (const arg of args) {
		switch (arg) {
			case '--json':
				format = 'json'
				break
			case '--csv':
				format = 'csv'
				break
			case '--help':
			case '-h':
				console.log('Usage: find-as-casts [--json|--csv] [dir]')
				console.log('\nScans TypeScript files for `as` type assertions (excluding `as const`).')
				console.log('\nOptions:')
				console.log('  --json   Output as JSON')
				console.log('  --csv    Output as CSV (pipe to mlr for tables)')
				console.log('  -h       Show this help')
				process.exit(0)
				break
			default:
				if (arg.startsWith('-')) {
					console.error(`error: unknown flag: ${arg}`)
					process.exit(1)
				}
				dir = arg
		}
	}

	const casts = await scan(dir)

	switch (format) {
		case 'json':
			console.log(formatJSON(casts))
			break
		case 'csv':
			console.log(formatCSV(casts))
			break
		default:
			console.log(formatEslint(casts))
	}
}

runCLI(main)
