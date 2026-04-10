// Shared core for find-as-casts — scanner, types, formatters.

import { Glob } from 'bun'
import { join, resolve } from 'path'

export type AsCast = {
	file: string
	absPath: string
	line: number
	col: number
	castTo: string
	code: string
}

export type OutputFormat = 'eslint' | 'json' | 'csv'

// Matches `as <Type>` but not `as const`. Handles:
//   - simple: as string, as HTMLElement
//   - generic: as Record<string, string>
//   - tuple: as [number, number]
//   - union/intersection: as 'a' | 'b', as Foo & Bar
//   - object: as { html?: string }
//   - chained: as unknown as Foo
const AS_PATTERN =
	/\bas\s+(?!const\b)(\[.*?\]|\{.*?\}|[\w.'"|&]+(?:<.*?>)?(?:\s*\|\s*[\w.'"|&]+(?:<.*?>)?)*(?:\s*&\s*[\w.'"|&]+(?:<.*?>)?)*(?:\[.*?\])?)/g

// Strip trailing inline comments from a line, respecting string literals
function stripInlineComment(line: string): string {
	let inSingle = false
	let inDouble = false
	let inTemplate = false
	for (let i = 0; i < line.length; i++) {
		const ch = line[i]
		const next = line[i + 1]
		if (ch === '\\') {
			i++
			continue
		}
		if (!inDouble && !inTemplate && ch === "'") {
			inSingle = !inSingle
			continue
		}
		if (!inSingle && !inTemplate && ch === '"') {
			inDouble = !inDouble
			continue
		}
		if (!inSingle && !inDouble && ch === '`') {
			inTemplate = !inTemplate
			continue
		}
		if (inSingle || inDouble || inTemplate) continue
		if (ch === '/' && next === '/') return line.slice(0, i)
		if (ch === '/' && next === '*') return line.slice(0, i)
	}
	return line
}

export async function scan(root: string): Promise<AsCast[]> {
	const resolved = resolve(root)
	const results: AsCast[] = []
	const glob = new Glob('**/*.{ts,tsx}')

	for await (const relPath of glob.scan({ cwd: resolved, absolute: false, onlyFiles: true })) {
		if (relPath.includes('node_modules')) continue

		const fullPath = join(resolved, relPath)
		const text = await Bun.file(fullPath).text()
		const lines = text.split('\n')

		let inBlockComment = false

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const trimmed = line.trimStart()

			// Track block comment state (/* ... */)
			if (inBlockComment) {
				if (trimmed.includes('*/')) inBlockComment = false
				continue
			}
			if (trimmed.startsWith('/*')) {
				if (!trimmed.includes('*/')) inBlockComment = true
				continue
			}

			if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) continue

			// Strip inline trailing comment before scanning
			const codePart = stripInlineComment(line)

			AS_PATTERN.lastIndex = 0
			let match: RegExpExecArray | null
			while ((match = AS_PATTERN.exec(codePart)) !== null) {
				// Skip matches inside string literals
				const before = codePart.slice(0, match.index)
				const singleQuotes = (before.match(/'/g) ?? []).length
				const doubleQuotes = (before.match(/"/g) ?? []).length
				const backticks = (before.match(/`/g) ?? []).length
				if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0 || backticks % 2 !== 0) continue

				results.push({
					file: relPath,
					absPath: fullPath,
					line: i + 1,
					col: match.index + 1,
					castTo: match[1].trim(),
					code: line.trim(),
				})
			}
		}
	}

	return results.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}

// ── Formatters ───────────────────────────────────────────────────────────────

export function formatEslint(casts: AsCast[]): string {
	if (casts.length === 0) return 'No as-casts found.'

	const byFile = new Map<string, AsCast[]>()
	for (const c of casts) {
		const group = byFile.get(c.file) ?? []
		group.push(c)
		byFile.set(c.file, group)
	}

	const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
	const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
	const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
	const gray = (s: string) => `\x1b[90m${s}\x1b[0m`

	const lines: string[] = []

	for (const [file, group] of byFile) {
		lines.push(bold(file))
		for (const c of group) {
			const link = `${c.absPath}:${c.line}:${c.col}`
			lines.push(`  ${gray(link)}  ${yellow('as')} ${c.castTo}`)
		}
		lines.push('')
	}

	// Summary
	const byType = new Map<string, number>()
	for (const c of casts) {
		byType.set(c.castTo, (byType.get(c.castTo) ?? 0) + 1)
	}
	const sorted = [...byType.entries()].sort((a, b) => b[1] - a[1])

	lines.push(`${yellow(`${casts.length} as-casts`)} across ${byFile.size} files`)
	lines.push('')
	for (const [type, count] of sorted) {
		lines.push(`  ${String(count).padStart(3)}× ${type}`)
	}

	return lines.join('\n')
}

export function formatJSON(casts: AsCast[]): string {
	return JSON.stringify(
		casts.map(({ file, line, col, castTo, code }) => ({ file, line, col, castTo, code })),
		null,
		2,
	)
}

export function formatCSV(casts: AsCast[]): string {
	const lines = ['file,line,col,castTo,code']
	for (const c of casts) {
		const escaped = c.code.replaceAll('"', '""')
		lines.push(`"${c.file}",${c.line},${c.col},"${c.castTo}","${escaped}"`)
	}
	return lines.join('\n')
}
