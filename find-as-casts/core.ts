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

export type OutputFormat = 'csv' | 'eslint' | 'json'

// Matches `as <Type>` but not `as const`. Handles:
//   - simple: as string, as HTMLElement
//   - generic: as Record<string, string>
//   - tuple: as [number, number]
//   - union/intersection: as 'a' | 'b', as Foo & Bar
//   - object: as { html?: string }
//   - chained: as unknown as Foo
const AS_PATTERN =
	/\bas\s+(?!const\b)(\[.*?\]|\{.*?\}|[\w"&'.|]+(?:<.*?>)?(?:\s*\|\s*[\w"&'.|]+(?:<.*?>)?)*(?:\s*&\s*[\w"&'.|]+(?:<.*?>)?)*(?:\[.*?\])?)/g

const QUOTE_CHARS = new Set(["'", '"', '`'])

// Strip trailing inline comments from a line, respecting string literals.
// One `quote` holding the open delimiter replaces a boolean per quote type — the three
// "am I inside one of the *other* two" guards collapse into a single check.
function stripInlineComment(line: string): string {
	let quote: string | null = null
	let index = 0

	while (index < line.length) {
		const ch = line[index]

		// Escape consumes the next character whatever it is
		if (ch === '\\') {
			index += 2
			continue
		}

		if (quote) {
			if (ch === quote) quote = null
		} else if (QUOTE_CHARS.has(ch)) {
			quote = ch
		} else if (ch === '/' && (line[index + 1] === '/' || line[index + 1] === '*')) {
			return line.slice(0, index)
		}

		index += 1
	}

	return line
}

/** Lines starting with these are comments or imports, never cast sites */
const SKIP_PREFIXES = ['//', '*', 'import ']

/** An odd count of any quote char before the match means it opened a string that is still open */
const isInsideStringLiteral = (before: string) =>
	[...QUOTE_CHARS].some((quote) => (before.split(quote).length - 1) % 2 !== 0)

type LineScanInput = { absPath: string; file: string; line: string; lineNumber: number }

function findCastsInLine({ absPath, file, line, lineNumber }: LineScanInput): AsCast[] {
	const codePart = stripInlineComment(line)
	const found: AsCast[] = []

	AS_PATTERN.lastIndex = 0
	let match: RegExpExecArray | null

	while ((match = AS_PATTERN.exec(codePart)) !== null) {
		if (isInsideStringLiteral(codePart.slice(0, match.index))) continue

		found.push({
			file,
			absPath,
			line: lineNumber,
			col: match.index + 1,
			castTo: match[1].trim(),
			code: line.trim(),
		})
	}

	return found
}

function scanFileText({ absPath, file, text }: { absPath: string; file: string; text: string }): AsCast[] {
	const found: AsCast[] = []
	let inBlockComment = false

	for (const [index, line] of text.split('\n').entries()) {
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

		if (SKIP_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) continue

		found.push(...findCastsInLine({ absPath, file, line, lineNumber: index + 1 }))
	}

	return found
}

export async function scan(root: string): Promise<AsCast[]> {
	const resolved = resolve(root)
	const results: AsCast[] = []
	const glob = new Glob('**/*.{ts,tsx}')

	for await (const relPath of glob.scan({ cwd: resolved, absolute: false, onlyFiles: true })) {
		if (relPath.includes('node_modules')) continue

		const absPath = join(resolved, relPath)
		const text = await Bun.file(absPath).text()
		results.push(...scanFileText({ absPath, file: relPath, text }))
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
