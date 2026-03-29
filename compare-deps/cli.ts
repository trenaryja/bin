#!/usr/bin/env bun
// compare-deps CLI — non-interactive, same output as the old shell script
import { runCLI } from '@/lib'
import { type Ecosystem, detectEcosystem, fetchHealth, formatTable } from './core'

async function main() {
	const args = process.argv.slice(2)
	let ecosystem: Ecosystem | null = null
	let json = false
	const packages: string[] = []

	for (const arg of args) {
		switch (arg) {
			case '--npm':
				ecosystem = 'npm'
				break
			case '--crate':
				ecosystem = 'crate'
				break
			case '--go':
				ecosystem = 'go'
				break
			case '--json':
				json = true
				break
			case '--help':
			case '-h':
				console.log('Usage: compare-deps [--npm|--crate|--go] [--json] <pkg1> <pkg2> [pkg3...]')
				process.exit(0)
				break // eslint-disable-next-line no-useless-escape -- not a real escape issue, just a default case
			default:
				if (arg.startsWith('-')) {
					console.error(`error: unknown flag: ${arg}`)
					process.exit(1)
				}
				packages.push(arg)
		}
	}

	if (packages.length < 2) {
		console.error('error: need at least 2 packages to compare')
		process.exit(1)
	}

	const results = await Promise.all(
		packages.map((pkg) => fetchHealth(pkg, ecosystem ?? detectEcosystem(pkg))),
	)

	if (json) {
		console.log(JSON.stringify(results, null, 2))
	} else {
		console.log(formatTable(results))
	}
}

runCLI(main)
