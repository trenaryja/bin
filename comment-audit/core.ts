import { readdir } from 'fs/promises'
import * as R from 'remeda'

const IGNORED_DIRS = new Set([
	'__fixtures__',
	'__pycache__',
	'_tmp',
	'.git',
	'.next',
	'.svelte-kit',
	'.turbo',
	'.venv',
	'.vercel',
	'build',
	'coverage',
	'dist',
	'external',
	'fixtures',
	'node_modules',
	'out',
	'third_party',
	'third-party',
	'vendor',
])

const SLASH_EXTS = new Set([
	'c',
	'cjs',
	'cpp',
	'cts',
	'go',
	'h',
	'java',
	'js',
	'json5',
	'jsonc',
	'jsx',
	'kt',
	'less',
	'mjs',
	'mts',
	'rs',
	'scss',
	'swift',
	'ts',
	'tsx',
])
const HASH_EXTS = new Set(['bash', 'conf', 'py', 'rb', 'sh', 'tf', 'tfvars', 'toml', 'yaml', 'yml', 'zsh'])
const BLOCK_EXTS = new Set([...SLASH_EXTS, 'css'])
const SCANNED = new Set([...SLASH_EXTS, ...HASH_EXTS, 'css'])

/* eslint-disable regexp/no-super-linear-backtracking -- input is one comment line, so backtracking stays bounded */
const DIVIDER = /^[\s|>*]*(?:[-=*_~#]{3,}|[─━═╌┄┈–—]{2,})[\s|>*]*$/
const WRAPPED = /^[^\w\s]*\s*[-=*_─━═]{2}.*[-=*_─━═]{2}\s*[^\w\s]*$/
/* eslint-enable regexp/no-super-linear-backtracking */
const USAGE = /^(?:example|how to run|invoke|run|usage)\s*:/i
const TODO = /\b(?:FIXME|HACK|TODO|WIP|XXX)\b/
const ANCHOR =
	/->|=>|@?[\w.-]+\/[\w./-]+|\.(?:js|py|sh|tf|ts|tsx|yml)\b|#\d+|\b(?:after|before|blocked|drop when|migrate to|move to|once|pending|replace with|switch to|until|when)\b/i
const CODEISH =
	/^(?:(?:async|await|class|const|else|export|for|function|if|import|interface|let|return|type|var|while)\b|console\.|\}|\)|<\/?[A-Za-z]+[\s/>])/
const CODETAIL = /[;{]$|\)\s*[;{]$|\s=\s|=>/
const HISTORY =
	/\badr[\s-]?\d|\.claude\/plans|\bper the (?:decision|discussion|plan|spec)\b|\bsee (?:the )?(?:decision|discussion|thread|ticket)\b|\bused to be\b|\bwe (?:agreed|changed|decided|moved|renamed)\b/i
const SSOT =
	/\bv?\d+\.\d+\.\d+\b|[€$£¥]\s?\d|\b\d+(?:\.\d+)?\s?(?:eur|gbp|usd)\b|\bline \d+\b|\b(?:per|see) [\w./-]+:\d+/i
const COMMENT_START = /^(?:\/\/|#|\*|\/\*)/

const IDENTIFIER_SPLIT = /[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/
const words = (text: string) =>
	new Set(
		text
			.toLowerCase()
			.split(IDENTIFIER_SPLIT)
			.filter((word) => word.length > 2),
	)

const restates = (body: string, next: string) => {
	const commentWords = words(body)
	if (commentWords.size < 2 || commentWords.size > 5) return false
	const codeWords = words(next)
	return codeWords.size > 0 && [...commentWords].every((word) => codeWords.has(word))
}

type Verdict = 'cut' | 'review'

type Rule = {
	id: string
	verdict: Verdict
	scope: 'block' | 'line'
	blurb: string
	test: (text: string, next: string, fromBlock: boolean) => boolean
}

export const RULES: Rule[] = [
	{
		id: 'banner',
		verdict: 'cut',
		scope: 'line',
		blurb: 'Divider or section header. The attached comment is the header.',
		test: (text) => DIVIDER.test(text) || WRAPPED.test(text),
	},
	{
		id: 'usage',
		verdict: 'cut',
		scope: 'line',
		blurb: 'How-to-run header. The CLI table or README owns this.',
		test: (text) => USAGE.test(text),
	},
	{
		id: 'commented-code',
		verdict: 'cut',
		scope: 'line',
		blurb: 'Commented-out code. Git owns this. Skipped inside /** */ so @example survives.',
		test: (text, _next, fromBlock) => !fromBlock && CODEISH.test(text) && CODETAIL.test(text),
	},
	{
		id: 'history',
		verdict: 'cut',
		scope: 'block',
		blurb: 'Cites a decision, doc, or ticket instead of describing the code.',
		test: (text) => HISTORY.test(text),
	},
	{
		id: 'todo-bare',
		verdict: 'review',
		scope: 'line',
		blurb: 'TODO with no destination or trigger — can never go stale or be done.',
		test: (text) => TODO.test(text) && !ANCHOR.test(text),
	},
	{
		id: 'ssot-risk',
		verdict: 'review',
		scope: 'block',
		blurb: 'Duplicates a fact owned elsewhere — a version, price, or line reference.',
		test: (text) => SSOT.test(text),
	},
	{
		id: 'restatement',
		verdict: 'review',
		scope: 'block',
		blurb: 'Every word already appears in the line below it. Only fires on 2–5 word comments.',
		test: (text, next) => restates(text, next),
	},
]

type Comment = {
	line: number
	body: string
	block: string
	blockLine: number
	next: string
	fromBlock: boolean
}

const extensionOf = (path: string) => path.split('.').pop()?.toLowerCase() ?? ''

const stripBlockMarkers = (text: string, opener: RegExp) =>
	text
		.replace(opener, '')
		.replace(/\*\/\s*$/, '')
		.trim()

const markerOf = (trimmed: string, extension: string) => {
	if (SLASH_EXTS.has(extension) && trimmed.startsWith('//')) return '//'
	return HASH_EXTS.has(extension) && trimmed.startsWith('#') ? '#' : ''
}

const trailingBody = (raw: string, extension: string) => {
	const trailing = SLASH_EXTS.has(extension) ? raw.indexOf(' //') : HASH_EXTS.has(extension) ? raw.indexOf(' #') : -1
	if (trailing < 0) return ''
	const before = raw.slice(0, trailing)
	const oddQuotes = (before.split('"').length - 1) % 2 || (before.split("'").length - 1) % 2
	if (oddQuotes || before.endsWith(':')) return ''
	return raw
		.slice(trailing)
		.replace(/^\s*(?:\/\/|#)\s?/, '')
		.trim()
}

const commentsIn = (source: string, extension: string) => {
	const lines = source.split('\n')
	const block = BLOCK_EXTS.has(extension)
	const comments: Comment[] = []
	let run: Comment[] = []
	let inBlock = false

	const nextCode = (from: number) =>
		lines
			.slice(from, from + 4)
			.map((candidate) => candidate.trim())
			.find((candidate) => candidate && !COMMENT_START.test(candidate)) ?? ''

	const flush = () => {
		const [first] = run
		const last = R.last(run)
		if (!first || !last) return
		const text = run
			.filter((comment) => !DIVIDER.test(comment.body))
			.map((comment) => comment.body)
			.join(' ')
		const next = nextCode(last.line)
		comments.push(...run.map((comment) => ({ ...comment, block: text, blockLine: first.line, next })))
		run = []
	}

	const extend = (line: number, body: string, fromBlock = false) =>
		run.push({ line, body, block: body, blockLine: line, next: '', fromBlock })

	const readBlock = (trimmed: string, line: number) => {
		if (!inBlock) flush()
		const body = stripBlockMarkers(trimmed, inBlock ? /^\*+\s?/ : /^\/\*+\s?/)
		if (body) extend(line, body, true)
		inBlock = !trimmed.includes('*/')
		if (!inBlock) flush()
	}

	lines.forEach((raw, index) => {
		const trimmed = raw.trim()
		const line = index + 1
		if (index === 0 && trimmed.startsWith('#!')) return
		if (block && (inBlock || trimmed.startsWith('/*'))) return readBlock(trimmed, line)

		const marker = markerOf(trimmed, extension)

		if (marker) {
			const body = trimmed.slice(marker.length).trim()
			if (body) extend(line, body)
			else flush()
			return
		}

		flush()

		const body = trailingBody(raw, extension)
		if (body) comments.push({ line, body, block: body, blockLine: line, next: '', fromBlock: false })
	})
	flush()

	return comments
}

type Hit = { file: string; line: number; rule: string; verdict: Verdict; text: string }

async function* walk(root: string, excluded: string[]): AsyncGenerator<string> {
	const entries = await readdir(root, { withFileTypes: true }).catch(() => [])

	for (const entry of entries) {
		const full = `${root}/${entry.name}`
		if (excluded.some((fragment) => full.includes(fragment))) continue
		if (!entry.isDirectory()) {
			if (SCANNED.has(extensionOf(entry.name))) yield full
			continue
		}
		if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.') || entry.name.endsWith('-dist')) continue
		yield* walk(full, excluded)
	}
}

const hitsIn = (file: string, comments: Comment[]) => {
	const seen = new Set<string>()
	return comments.flatMap((comment) => {
		const rule = RULES.find((candidate) =>
			candidate.test(candidate.scope === 'block' ? comment.block : comment.body, comment.next, comment.fromBlock),
		)
		if (!rule) return []
		const [text, line] = rule.scope === 'block' ? [comment.block, comment.blockLine] : [comment.body, comment.line]
		const key = `${rule.id}:${line}`
		if (seen.has(key)) return []
		seen.add(key)
		return [{ file, line, rule: rule.id, verdict: rule.verdict, text: text.slice(0, 120) }]
	})
}

export const scan = async (roots: string[], excluded: string[]) => {
	const hits: Hit[] = []
	let files = 0
	let commentLines = 0

	for (const root of roots)
		for await (const file of walk(root, excluded)) {
			const source = await Bun.file(file)
				.text()
				.catch(() => '')
			if (!source) continue
			files++
			const comments = commentsIn(source, extensionOf(file))
			commentLines += comments.length
			hits.push(...hitsIn(file, comments))
		}

	return { files, commentLines, hits }
}

type ScanResult = Awaited<ReturnType<typeof scan>>

export const formatRules = () => {
	const width = Math.max(...RULES.map((rule) => rule.id.length))
	return RULES.map((rule) => `  ${rule.id.padEnd(width)}  ${rule.verdict.padEnd(6)}  ${rule.blurb}`).join('\n')
}

export const formatReport = ({ hits, files, commentLines }: ScanResult, roots: string[]) => {
	const width = Math.max(...RULES.map((rule) => rule.id.length))
	const counts = R.countBy(hits, (hit) => hit.rule)
	const cut = hits.filter((hit) => hit.verdict === 'cut').length
	const worst = R.pipe(
		R.countBy(hits, (hit) => hit.file),
		R.entries(),
		R.sortBy([([, count]) => count, 'desc']),
		R.take(10),
	)
	return [
		`\nScanned ${files} files under ${roots.join(', ')} — ${commentLines} comment lines.\n`,
		`${'RULE'.padEnd(width)}  VERDICT  COUNT  WHAT IT MEANS`,
		...RULES.filter((rule) => counts[rule.id]).map(
			(rule) =>
				`${rule.id.padEnd(width)}  ${rule.verdict.padEnd(7)}  ${String(counts[rule.id]).padStart(5)}  ${rule.blurb}`,
		),
		`\n${cut} to cut, ${hits.length - cut} to review — ${((hits.length / (commentLines || 1)) * 100).toFixed(1)}% of all comment lines.`,
		...(worst.length
			? ['\nWorst files:', ...worst.map(([file, count]) => `  ${String(count).padStart(4)}  ${file}`)]
			: []),
		'\nEvery hit for one rule: --list <rule>. Skip a tree: --exclude <fragment>. Machine-readable: --json.\n',
	].join('\n')
}

export const formatList = ({ hits }: ScanResult, rule: string) => {
	const matching = hits.filter((hit) => hit.rule === rule)
	if (!matching.length) return `No hits for "${rule}". Rules: ${RULES.map((x) => x.id).join(', ')}`
	return [...matching.map((hit) => `${hit.file}:${hit.line}  ${hit.text}`), `\n${matching.length} hits.`].join('\n')
}
