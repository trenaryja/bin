#!/usr/bin/env bun
import { runCLI } from '@/lib'
import { homedir } from 'os'
import { formatList, formatReport, formatRules, scan } from './core'

const USAGE = `Usage: comment-audit [<dir>...] [--all] [--list <rule>] [--exclude <fragment,...>] [--json]

Scores every comment in a tree against the mechanical comment rules in ~/CLAUDE.md. Never edits.
An unflagged comment is not thereby a good one: whether deleting it would mislead the next agent
stays a reader's call.

Rules (cut = the rule alone is grounds; review = read it, measured results legitimately carry numbers):
${formatRules()}

Options:
  --all                 Every repo under ~/Git
  --list <rule>         Every hit for one rule, as file:line
  --exclude <fragments> Comma-separated path fragments to skip, matched anywhere in the full path.
                        Dependency, build, vendored and dot dirs are always skipped.
  --json                Machine-readable
  -h, --help            Show this help`

const VALUED = new Set(['--exclude', '--list'])
const FLAGS = new Set([...VALUED, '--all', '--json'])

async function main() {
	const args = process.argv.slice(2)
	if (args.includes('-h') || args.includes('--help')) return console.log(USAGE)
	const unknown = args.filter((arg) => arg.startsWith('-') && !FLAGS.has(arg))

	if (unknown.length) {
		console.error(`error: unknown flag: ${unknown.join(' ')}\n\n${USAGE}`)
		process.exit(2)
	}

	const valueOf = (flag: string) => {
		const index = args.indexOf(flag)
		return index < 0 ? undefined : args[index + 1]
	}

	const excluded = (valueOf('--exclude') ?? '').split(',').filter(Boolean)
	const named = args
		.filter((arg, index) => !arg.startsWith('-') && !VALUED.has(args[index - 1] ?? ''))
		.map((dir) => dir.replace(/\/$/, ''))
	const roots = args.includes('--all') ? [`${homedir()}/Git`] : named.length ? named : [process.cwd()]

	const result = await scan(roots, excluded)
	const rule = valueOf('--list')
	if (args.includes('--json')) console.log(JSON.stringify(result, null, 2))
	else if (rule !== undefined) console.log(formatList(result, rule))
	else console.log(formatReport(result, roots))
}

runCLI(main)
