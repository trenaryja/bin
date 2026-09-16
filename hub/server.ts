import { $, Glob } from 'bun'
import * as R from 'remeda'
import { z } from 'zod'
import indexHtml from './index.html' with { type: 'file' }

// Same rule as nas/mac/provision.sh, whose CoreDNS answers this zone: first name, lowercased.
const FIRST_NAME = (await $`id -F`.nothrow().quiet().text()).trim().split(' ').find(Boolean) ?? Bun.env.USER ?? ''
const ZONE = `${FIRST_NAME.toLowerCase()}.internal`
const PORT = 7800
// bun-types calls every .html import an HTMLBundle; type: 'file' makes it a path, embedded when compiled.
const INDEX_PAGE = z.string().parse(indexHtml)
const CADDYFILE = '/opt/homebrew/etc/Caddyfile'
const CADDY_BLOCK = `# >>> hub (managed by ~/Git/bin/hub) >>>
http://${ZONE}, http://*.${ZONE} {
	reverse_proxy localhost:${PORT}
}
# <<< hub <<<`
const GIT = `${Bun.env.HOME}/Git`
// Colima's ssh port tunnels also run from ~/Git/nas, so match on runtime, not just folder.
const RUNTIMES = ['node', 'bun', 'deno']
// Anything under .claude/, not all of ~/Git: repo HTML includes build output and app entry points.
const BOARDS = new Glob('*/.claude/**/*.html')

const lsof = async (args: string[]) => {
	const byPid = new Map<string, { command: string; names: string[] }>()
	let pid = ''

	for (const line of (await $`lsof -nP ${args} -Fpcn`.nothrow().quiet().text()).split('\n')) {
		const value = line.slice(1)
		if (line[0] === 'p') byPid.set((pid = value), { command: '', names: [] })
		if (line[0] === 'c') byPid.get(pid)!.command = value
		if (line[0] === 'n') byPid.get(pid)!.names.push(value)
	}

	return byPid
}

const devServers = async () => {
	const listening = await lsof(['-iTCP', '-sTCP:LISTEN'])
	const pids = [...listening]
		.filter(([pid, x]) => RUNTIMES.includes(x.command) && pid !== String(process.pid))
		.map(([pid]) => pid)
	if (!pids.length) return []
	const cwds = await lsof(['-a', '-d', 'cwd', '-p', pids.join(',')])
	const servers = pids.flatMap((pid) => {
		const dir = cwds.get(pid)?.names[0] ?? ''
		if (!dir.startsWith(`${GIT}/`)) return []
		// ~/Git/codepen → codepen; ~/Git/codepen-worktrees/feat-vloop → feat-vloop-codepen
		const [repo = '', branch] = dir.slice(GIT.length + 1).split('/')
		const label = repo.endsWith('-worktrees') && branch ? `${branch}-${repo.replace(/-worktrees$/, '')}` : repo
		const port = Math.min(...listening.get(pid)!.names.map((name) => Number(name.split(':').at(-1))))
		return [{ label, port }]
	})
	return servers.map((server) =>
		servers.filter((other) => other.label === server.label).length > 1
			? { ...server, label: `${server.label}-${server.port}` }
			: server,
	)
}

const boards = async () =>
	(await Array.fromAsync(BOARDS.scan(GIT))).map((path) => ({
		// ui/.claude/orchestrate/repo-health/board.html → /ui/orchestrate/repo-health/board.html
		route: `/${path.replace('/.claude/', '/')}`,
		file: `${GIT}/${path}`,
	}))

const CaddyServers = z.record(
	z.string(),
	z.object({
		routes: z
			.array(z.object({ match: z.array(z.object({ host: z.array(z.string()).optional() })).optional() }))
			.optional(),
	}),
)

// Whatever Caddy already routes by name (the arr apps), read live so there's no second list.
const caddyHosts = async () => {
	const servers = CaddyServers.parse(
		await fetch('http://localhost:2019/config/apps/http/servers').then((x) => x.json()),
	)
	return R.values(servers)
		.flatMap((server) => server.routes ?? [])
		.flatMap((route) => route.match ?? [])
		.flatMap((match) => match.host ?? [])
		.filter((host) => host.endsWith(`.${ZONE}`) && !host.startsWith('*'))
}

const discover = async () => {
	const [servers, boardFiles, caddy] = await Promise.all([devServers(), boards(), caddyHosts()])
	return { servers, boardFiles, caddy }
}

// Every asset request would otherwise run lsof twice.
let cache: { at: number; value: ReturnType<typeof discover> } | undefined

const snapshot = () => {
	if (!cache || Date.now() - cache.at > 2000) cache = { at: Date.now(), value: discover() }
	return cache.value
}

// ui/orchestrate/repo-health/board.html → ui · repo-health; ui/plans/lens-board.html → ui · lens
const boardName = (route: string) => {
	const [repo, ...rest] = route.slice(1).split('/')
	const file = (rest.at(-1) ?? '').replace(/\.html$/, '').replace(/-?board$/, '')
	return `${repo} · ${file || rest.at(-2)}`
}

const sitemap = ({ servers, boardFiles, caddy }: Awaited<ReturnType<typeof discover>>) => ({
	Apps: caddy.map((host) => ({ name: host.split('.')[0], url: `http://${host}/` })),
	'Dev servers': servers.map((x) => ({ name: x.label, url: `http://${x.label}.${ZONE}/` })),
	Boards: R.sortBy(
		boardFiles.map((x) => ({ name: boardName(x.route), url: `http://boards.${ZONE}${x.route}` })),
		(x) => x.name,
	),
})

const startServer = () =>
	Bun.serve<{ upstream: string; protocol?: string; socket?: WebSocket }>({
		hostname: '127.0.0.1',
		port: PORT,
		async fetch(req, server) {
			const url = new URL(req.url)
			const [host = ''] = (req.headers.get('host') ?? '').split(':')
			const found = await snapshot()

			if (host === ZONE)
				return url.pathname === '/sites.json' ? Response.json(sitemap(found)) : new Response(Bun.file(INDEX_PAGE))

			if (host === `boards.${ZONE}`) {
				// Only exact glob matches are served, so no path can climb out into ~/Git.
				const board = found.boardFiles.find((x) => x.route === url.pathname)
				return board ? new Response(Bun.file(board.file)) : new Response('no such board', { status: 404 })
			}

			const label = host.slice(0, -(ZONE.length + 1))
			const dev = found.servers.find((x) => x.label === label)
			if (!dev) return new Response(`nothing named ${label} is running`, { status: 404 })
			const target = `localhost:${dev.port}${url.pathname}${url.search}`

			// Vite's hot reload is a websocket with a subprotocol; bridge it or HMR silently dies.
			if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
				const protocol = req.headers.get('sec-websocket-protocol')?.split(',')[0]?.trim()
				const upgraded = server.upgrade(req, {
					data: { upstream: `ws://${target}`, protocol },
					headers: protocol ? { 'sec-websocket-protocol': protocol } : {},
				})
				return upgraded ? undefined : new Response('upgrade failed', { status: 400 })
			}

			// Presenting as localhost is what gets past Vite's allowedHosts 403.
			const headers = new Headers(req.headers)
			headers.set('host', `localhost:${dev.port}`)
			return fetch(`http://${target}`, {
				method: req.method,
				headers,
				body: req.body,
				redirect: 'manual',
				decompress: false,
			})
		},
		websocket: {
			open(client) {
				const upstream = new WebSocket(client.data.upstream, client.data.protocol)
				upstream.onmessage = (event) => client.send(event.data)
				upstream.onclose = () => client.close()
				client.data.socket = upstream
			},
			message: (client, message) => client.data.socket?.send(message),
			close: (client) => client.data.socket?.close(),
		},
	})

/**
 * - Exact names in Caddy (the arr apps) outrank this wildcard, so only unclaimed names reach the hub.
 * - Only the block's content counts as drift — provision.sh re-appends its own block below this one.
 */
const ensureCaddyBlock = async () => {
	const current = await Bun.file(CADDYFILE).text()
	const existing = /# >>> hub .*?# <<< hub <<</s.exec(current)?.[0]
	if (existing === CADDY_BLOCK) return
	const others = existing
		? current
				.replace(existing, '')
				.replace(/\n{3,}/g, '\n\n')
				.trimEnd()
		: current.trimEnd()
	await Bun.write(CADDYFILE, `${others}\n\n${CADDY_BLOCK}\n`)
	await $`caddy reload --config ${CADDYFILE}`.quiet()
	console.log(`wrote the hub block to ${CADDYFILE} and reloaded caddy`)
}

export const serve = async () => {
	await ensureCaddyBlock()
	startServer()
	console.log(`hub on 127.0.0.1:${PORT} for ${ZONE}`)
}
