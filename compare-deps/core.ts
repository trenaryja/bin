// Shared core for compare-deps — fetchers, types, formatters.
// Used by both CLI and TUI entry points.

export type Ecosystem = 'npm' | 'crate' | 'go'

export interface PackageHealth {
	name: string
	ecosystem: Ecosystem
	version: string | null
	license: string | null
	weeklyDownloads: number | null
	stars: number | null
	openIssues: number | null
	deps: number | null
	sizeBytes: number | null
	lastPublish: string | null
	lastCommit: string | null
}

export interface SearchResult {
	name: string
	description: string | null
	version: string | null
}

// ── Ecosystem detection ──────────────────────────────────────────────────────

export function detectEcosystem(pkg: string): Ecosystem {
	// Go modules: github.com/..., golang.org/..., etc.
	if (/^[a-z]+\.[a-z]+\//.test(pkg)) return 'go'
	// Everything else defaults to npm (most common case)
	return 'npm'
}

// ── Search ───────────────────────────────────────────────────────────────────

export async function searchPackages(query: string, ecosystem: Ecosystem): Promise<SearchResult[]> {
	if (!query.trim()) return []

	switch (ecosystem) {
		case 'npm':
			return searchNpm(query)
		case 'crate':
			return searchCrates(query)
		case 'go':
			return searchGo(query)
	}
}

async function searchNpm(query: string): Promise<SearchResult[]> {
	const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=20`
	const res = await fetch(url)
	if (!res.ok) return []
	const data = (await res.json()) as {
		objects: Array<{ package: { name: string; description?: string; version?: string } }>
	}
	return data.objects.map((o) => ({
		name: o.package.name,
		description: o.package.description ?? null,
		version: o.package.version ?? null,
	}))
}

async function searchCrates(query: string): Promise<SearchResult[]> {
	const url = `https://crates.io/api/v1/crates?q=${encodeURIComponent(query)}&per_page=20`
	const res = await fetch(url)
	if (!res.ok) return []
	const data = (await res.json()) as { crates: Array<{ name: string; description?: string; newest_version?: string }> }
	return data.crates.map((c) => ({
		name: c.name,
		description: c.description ?? null,
		version: c.newest_version ?? null,
	}))
}

async function searchGo(query: string): Promise<SearchResult[]> {
	const url = `https://pkg.go.dev/search?q=${encodeURIComponent(query)}&m=package&limit=20`
	const res = await fetch(url, { headers: { Accept: 'text/html' } })
	if (!res.ok) return []
	const html = await res.text()

	// Parse search results from HTML (pkg.go.dev has no JSON API)
	const results: SearchResult[] = []
	const pattern =
		/data-href="\/([^"]+)"[\s\S]*?class="SearchSnippet-header-title"[^>]*>([^<]*)<[\s\S]*?class="SearchSnippet-synopsis"[^>]*>([^<]*)</g
	let match
	while ((match = pattern.exec(html)) !== null) {
		results.push({ name: match[1], description: match[3].trim() || null, version: null })
	}

	// Fallback: simpler pattern
	if (results.length === 0) {
		const simplePattern = /href="\/([^"]+?)(?:@[^"]*)?"\s+data-gtmc="search result"/g
		while ((match = simplePattern.exec(html)) !== null) {
			results.push({ name: match[1], description: null, version: null })
		}
	}

	return results.slice(0, 20)
}

// ── GitHub helpers ───────────────────────────────────────────────────────────

async function ghApi(path: string): Promise<Record<string, unknown> | null> {
	// Try gh CLI first (handles auth), fall back to unauthenticated API
	try {
		const proc = Bun.spawn(['gh', 'api', path], { stdout: 'pipe', stderr: 'ignore' })
		const text = await new Response(proc.stdout).text()
		const code = await proc.exited
		if (code === 0) return JSON.parse(text) as Record<string, unknown>
	} catch {
		// fall through
	}

	const res = await fetch(`https://api.github.com/${path}`)
	if (!res.ok) return null
	return (await res.json()) as Record<string, unknown>
}

function extractGitHubRepo(repoUrl: string): string | null {
	const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/)
	return match ? match[1] : null
}

async function fetchGitHubStats(
	repo: string,
): Promise<{ stars: number | null; openIssues: number | null; lastCommit: string | null }> {
	const data = await ghApi(`repos/${repo}`)
	if (!data) return { stars: null, openIssues: null, lastCommit: null }
	return {
		stars: (data.stargazers_count as number) ?? null,
		openIssues: (data.open_issues_count as number) ?? null,
		lastCommit: (data.pushed_at as string) ?? null,
	}
}

// ── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchNpm(pkg: string): Promise<PackageHealth> {
	const [reg, dlRes] = await Promise.all([
		fetch(`https://registry.npmjs.org/${pkg}`).then((r) => r.json() as Promise<Record<string, unknown>>),
		fetch(`https://api.npmjs.org/downloads/point/last-week/${pkg}`)
			.then((r) => r.json() as Promise<Record<string, unknown>>)
			.catch(() => null),
	])

	const distTags = reg['dist-tags'] as Record<string, string>
	const latest = distTags?.latest
	const time = reg.time as Record<string, string>
	const versions = reg.versions as Record<string, Record<string, unknown>>
	const latestMeta = versions?.[latest] ?? {}
	const dist = latestMeta.dist as Record<string, unknown> | undefined
	const dependencies = latestMeta.dependencies as Record<string, unknown> | undefined

	const repoField = latestMeta.repository as string | { url?: string } | undefined
	const repoUrl = typeof repoField === 'string' ? repoField : (repoField?.url ?? '')
	const repo = extractGitHubRepo(repoUrl)
	const gh = repo ? await fetchGitHubStats(repo) : { stars: null, openIssues: null, lastCommit: null }

	return {
		name: pkg,
		ecosystem: 'npm',
		version: latest ?? null,
		license: (reg.license as string) ?? null,
		weeklyDownloads: (dlRes?.downloads as number) ?? null,
		stars: gh.stars,
		openIssues: gh.openIssues,
		deps: dependencies ? Object.keys(dependencies).length : null,
		sizeBytes: (dist?.unpackedSize as number) ?? null,
		lastPublish: time?.[latest] ?? null,
		lastCommit: gh.lastCommit,
	}
}

async function fetchCrate(pkg: string): Promise<PackageHealth> {
	const res = await fetch(`https://crates.io/api/v1/crates/${pkg}`)
	if (!res.ok) throw new Error(`crates.io: package '${pkg}' not found`)
	const data = (await res.json()) as { crate: Record<string, unknown>; versions: Array<Record<string, unknown>> }
	const crate = data.crate
	const latest = data.versions[0]

	const repoUrl = (crate.repository as string) ?? ''
	const repo = extractGitHubRepo(repoUrl)
	const gh = repo ? await fetchGitHubStats(repo) : { stars: null, openIssues: null, lastCommit: null }

	return {
		name: pkg,
		ecosystem: 'crate',
		version: (crate.newest_version as string) ?? null,
		license: (latest?.license as string) ?? null,
		weeklyDownloads: (crate.recent_downloads as number) ?? null,
		stars: gh.stars,
		openIssues: gh.openIssues,
		deps: null,
		sizeBytes: (latest?.crate_size as number) ?? null,
		lastPublish: (latest?.updated_at as string) ?? null,
		lastCommit: gh.lastCommit,
	}
}

async function fetchGo(pkg: string): Promise<PackageHealth> {
	const repoPath = pkg.match(/^github\.com\/([^/]+\/[^/]+)/)?.[1]
	if (!repoPath) throw new Error(`go: only github.com modules are supported (got '${pkg}')`)

	const [ghData, tagsData] = await Promise.all([ghApi(`repos/${repoPath}`), ghApi(`repos/${repoPath}/tags`)])

	if (!ghData) throw new Error(`go: GitHub repo '${repoPath}' not found`)
	const tags = tagsData as unknown as Array<{ name: string }> | null
	const version = tags?.[0]?.name ?? null

	return {
		name: pkg,
		ecosystem: 'go',
		version,
		license: ((ghData.license as Record<string, unknown>)?.spdx_id as string) ?? null,
		weeklyDownloads: null,
		stars: (ghData.stargazers_count as number) ?? null,
		openIssues: (ghData.open_issues_count as number) ?? null,
		deps: null,
		sizeBytes: null,
		lastPublish: (ghData.pushed_at as string) ?? null,
		lastCommit: (ghData.pushed_at as string) ?? null,
	}
}

export async function fetchHealth(pkg: string, ecosystem: Ecosystem): Promise<PackageHealth> {
	switch (ecosystem) {
		case 'npm':
			return fetchNpm(pkg)
		case 'crate':
			return fetchCrate(pkg)
		case 'go':
			return fetchGo(pkg)
	}
}

// ── Formatters ───────────────────────────────────────────────────────────────

export function fmtNum(n: number | null): string {
	if (n == null) return 'n/a'
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
	return String(n)
}

export function fmtSize(n: number | null): string {
	if (n == null) return 'n/a'
	if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`
	if (n >= 1_024) return `${(n / 1_024).toFixed(1)} KB`
	return `${n} B`
}

export function fmtDate(d: string | null): string {
	if (!d) return 'n/a'
	return d.split('T')[0]
}

export function fmtVal(v: string | null): string {
	return v ?? 'n/a'
}

export interface TableRow {
	label: string
	values: string[]
}

export function buildTableRows(results: PackageHealth[]): TableRow[] {
	return [
		{ label: '', values: results.map((r) => r.name) },
		{ label: 'ecosystem', values: results.map((r) => r.ecosystem) },
		{ label: 'version', values: results.map((r) => fmtVal(r.version)) },
		{ label: 'license', values: results.map((r) => fmtVal(r.license)) },
		{ label: 'weekly dl', values: results.map((r) => fmtNum(r.weeklyDownloads)) },
		{ label: 'stars', values: results.map((r) => fmtNum(r.stars)) },
		{ label: 'open issues', values: results.map((r) => fmtNum(r.openIssues)) },
		{ label: 'deps', values: results.map((r) => fmtNum(r.deps)) },
		{ label: 'size', values: results.map((r) => fmtSize(r.sizeBytes)) },
		{ label: 'last publish', values: results.map((r) => fmtDate(r.lastPublish)) },
		{ label: 'last commit', values: results.map((r) => fmtDate(r.lastCommit)) },
	]
}

export function formatTable(results: PackageHealth[]): string {
	const rows = buildTableRows(results)
	const labelWidth = 14
	const colWidths = results.map((_, colIdx) => Math.max(...rows.map((row) => row.values[colIdx].length)) + 2)

	return rows
		.map((row, rowIdx) => {
			const label = row.label.padEnd(labelWidth)
			const cols = row.values
				.map((val, colIdx) => {
					const padded = val.padEnd(colWidths[colIdx])
					return rowIdx === 0 ? `\x1b[1m${padded}\x1b[0m` : padded
				})
				.join('  ')
			return `${label}${cols}`
		})
		.join('\n')
}
