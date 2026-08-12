#!/usr/bin/env bun
// compare-deps TUI — interactive Clack interface with async package search
import { runCLI } from '@/lib'
import { cancel, intro, isCancel, note, outro, select, spinner } from '@clack/prompts'
import { AutocompletePrompt } from '@clack/core'
import chalk from 'chalk'
import { buildTableRows, fetchHealth, searchPackages } from './core'
import type { Ecosystem, SearchResult } from './core'

// ── Async search prompt ──────────────────────────────────────────────────────

type SearchOption = {
	value: string
	label: string
	hint?: string
}

async function searchPrompt(ecosystem: Ecosystem): Promise<symbol | string[]> {
	let searchResults: SearchOption[] = []
	let fetchId = 0
	let debounceTimer: ReturnType<typeof setTimeout> | null = null

	const prompt = new AutocompletePrompt<SearchOption>({
		options() {
			return searchResults
		},
		multiple: true,
		render() {
			const title = `Search ${ecosystem} packages (type to search, space to select, enter to confirm)`

			switch (this.state) {
				case 'submit':
					return `${chalk.gray('◇')}  ${title}\n${chalk.gray(`│  ${(this.value as string[]).join(', ')}`)}`
				case 'cancel':
					return `${chalk.gray('◇')}  ${title}\n${chalk.gray('│  cancelled')}`
				default:
					break
			}

			const input = this.userInputWithCursor || chalk.dim('type to search...')
			const selected = this.selectedValues as string[]

			const lines = [`${chalk.cyan('◆')}  ${title}`, `${chalk.gray('│')}  ${input}`]

			if (selected.length > 0) {
				lines.push(`${chalk.gray('│')}  ${chalk.dim(`selected: ${chalk.green(selected.join(', '))}`)}`)
			}

			const filtered = this.filteredOptions

			if (filtered.length > 0) {
				lines.push(`${chalk.gray('│')}`)
				const maxVisible = 10
				const start = Math.max(0, this.cursor - Math.floor(maxVisible / 2))
				const visible = filtered.slice(start, start + maxVisible)

				for (let i = 0; i < visible.length; i++) {
					const opt = visible[i]
					const idx = start + i
					const isSelected = selected.includes(opt.value)
					const isFocused = idx === this.cursor
					const check = isSelected ? chalk.green('●') : chalk.dim('○')
					const label = isFocused ? chalk.underline(opt.label) : opt.label
					const hint = opt.hint ? chalk.dim(` — ${opt.hint}`) : ''
					const prefix = isFocused ? chalk.cyan('>') : ' '
					lines.push(`${chalk.gray('│')}  ${prefix} ${check} ${label}${hint}`)
				}

				if (filtered.length > maxVisible) {
					lines.push(`${chalk.gray('│')}  ${chalk.dim(`  ... ${filtered.length - maxVisible} more`)}`)
				}
			} else if (this.userInput.length > 0) {
				lines.push(`${chalk.gray('│')}  ${chalk.dim('searching...')}`)
			}

			lines.push(`${chalk.gray('│')}`)
			lines.push(`${chalk.gray('└')}`)
			return lines.join('\n')
		},
		validate(value) {
			const selected = value as string[] | undefined
			if (!selected || selected.length < 2) return 'Select at least 2 packages to compare'
		},
	})

	// Async search: debounce keystrokes and fetch from registry
	prompt.on('userInput', (input: string) => {
		if (debounceTimer) clearTimeout(debounceTimer)
		if (!input.trim()) {
			searchResults = []
			return
		}

		fetchId += 1
		const currentId = fetchId
		debounceTimer = setTimeout(async () => {
			const results = await searchPackages(input, ecosystem)
			// Only update if this is still the latest search
			if (currentId !== fetchId) return
			searchResults = results.map((r: SearchResult) => ({
				value: r.name,
				label: r.name + (r.version ? chalk.dim(`@${r.version}`) : ''),
				hint: r.description ?? undefined,
			}))
		}, 200)
	})

	return prompt.prompt() as Promise<symbol | string[]>
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	intro('compare-deps')

	const ecosystem = await select<Ecosystem>({
		message: 'Which package ecosystem?',
		options: [
			{ value: 'npm', label: 'npm', hint: 'JavaScript / TypeScript' },
			{ value: 'crate', label: 'crates.io', hint: 'Rust' },
			{ value: 'go', label: 'Go modules', hint: 'Go (github.com only)' },
		],
	})

	if (isCancel(ecosystem)) {
		cancel('Cancelled.')
		process.exit(0)
	}

	const packages = await searchPrompt(ecosystem)

	if (isCancel(packages)) {
		cancel('Cancelled.')
		process.exit(0)
	}

	const s = spinner()
	s.start(`Fetching health data for ${packages.length} packages`)

	const results = await Promise.all(packages.map((pkg) => fetchHealth(pkg, ecosystem)))

	s.stop('Done')

	// Build table for note display
	const rows = buildTableRows(results)
	const labelWidth = 14
	const colWidths = results.map((_, colIdx) => Math.max(...rows.map((row) => row.values[colIdx].length)) + 2)

	const table = rows
		.map((row, rowIdx) => {
			const label = row.label.padEnd(labelWidth)
			const cols = row.values
				.map((val, colIdx) => {
					const padded = val.padEnd(colWidths[colIdx])
					return rowIdx === 0 ? chalk.bold(padded) : padded
				})
				.join('  ')
			return `${label}${cols}`
		})
		.join('\n')

	note(table, 'Comparison')

	const action = await select({
		message: 'What next?',
		options: [
			{ value: 'json', label: 'Copy as JSON' },
			{ value: 'search', label: 'New search' },
			{ value: 'done', label: 'Done' },
		],
	})

	if (isCancel(action) || action === 'done') {
		outro('Done.')
		return
	}

	if (action === 'json') {
		console.log(JSON.stringify(results, null, 2))
		outro('JSON printed.')
		return
	}

	// Restart for new search — just call main again
	if (action === 'search') {
		await main()
	}
}

runCLI(main)
