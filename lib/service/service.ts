import { select } from '@clack/prompts'
import { $ } from 'bun'
import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import buildConfig from '../../build.json'

const ROOT = join(import.meta.dir, '../..')
const VERBS = ['serve', 'status', 'logs', 'start', 'stop', 'restart'] as const

type Verb = (typeof VERBS)[number]

const agent = (name: string) => {
	const label = `app.trenary.${name}`
	return {
		label,
		target: `gui/${process.getuid?.()}/${label}`,
		plist: join(homedir(), 'Library/LaunchAgents', `${label}.plist`),
		log: join(homedir(), 'Library/Logs', `${label}.log`),
	}
}

const isLoaded = async (name: string) =>
	(await $`launchctl print ${agent(name).target}`.nothrow().quiet()).exitCode === 0

const plistFor = (name: string, program: string) => {
	const { label, log } = agent(name)
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${label}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${program}</string>
		<string>serve</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>${process.env.PATH}</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>${log}</string>
	<key>StandardErrorPath</key>
	<string>${log}</string>
</dict>
</plist>
`
}

const bootstrap = async (name: string) => {
	const { target, plist } = agent(name)
	await $`launchctl bootout ${target}`.nothrow().quiet()
	// bootout returns before the job is gone; bootstrapping into that gap fails with EIO.
	for (let attempt = 0; attempt < 10 && (await isLoaded(name)); attempt++) await Bun.sleep(500)
	await $`launchctl bootstrap gui/${process.getuid?.()} ${plist}`.quiet()
}

/** Runs `<program> serve` under launchd with the installing shell's PATH — launchd's own has no Homebrew. */
export const installService = async (name: string, program: string) => {
	const { plist, log } = agent(name)
	const desired = plistFor(name, program)
	mkdirSync(join(homedir(), 'Library/LaunchAgents'), { recursive: true })
	mkdirSync(join(homedir(), 'Library/Logs'), { recursive: true })
	const current = existsSync(plist) ? await Bun.file(plist).text() : ''

	if (current === desired && (await isLoaded(name))) await $`launchctl kickstart -k ${agent(name).target}`.quiet()
	else {
		await Bun.write(plist, desired)
		await bootstrap(name)
	}

	return { plist, log }
}

/**
 * - Symlinked targets see their real entry path, not the .bin/ name, so look it up in build.json.
 * - Compiled targets have no entry path on disk, so they're named after the binary.
 */
const serviceName = (entryPath: string) =>
	buildConfig.targets.find(
		(target) => 'entry' in target && typeof target.entry === 'string' && join(ROOT, target.entry) === entryPath,
	)?.output ?? basename(process.execPath)

const pickVerb = async (name: string): Promise<Verb> => {
	const argument = process.argv[2]
	const verb = VERBS.find((x) => x === argument)
	if (verb) return verb
	if (argument || !process.stdin.isTTY) {
		console.error(`usage: ${name} ${VERBS.join('|')}`)
		process.exit(1)
	}

	const answer = await select({ message: name, options: VERBS.map((x) => ({ value: x, label: x })) })
	if (typeof answer !== 'string') process.exit(0)
	return answer
}

/** `serve` runs in the foreground (what launchd calls); every other verb manages the LaunchAgent. Pass `import.meta.path`. */
export const runService = async (entryPath: string, serve: () => unknown) => {
	const name = serviceName(entryPath)
	const { target, plist, log } = agent(name)
	const verb = await pickVerb(name)

	if (verb === 'serve') return serve()
	if (!existsSync(plist)) {
		console.error(`${name} has no LaunchAgent yet — add "service": true to its build.json target and build`)
		process.exit(1)
	}

	if (verb === 'status') {
		const printed = await $`launchctl print ${target}`.nothrow().quiet().text()
		const summary = printed.split('\n').filter((line) => /^\t(?:last exit code|pid|state) =/.test(line))
		console.log(summary.length ? summary.map((line) => line.trim()).join('\n') : 'not loaded')
		console.log(`log = ${log}`)
	}
	if (verb === 'logs') await $`tail -n 50 -f ${log}`.nothrow()
	if (verb === 'start') await ((await isLoaded(name)) ? $`launchctl kickstart ${target}` : bootstrap(name))
	if (verb === 'stop') await $`launchctl bootout ${target}`.nothrow()
	if (verb === 'restart') await ((await isLoaded(name)) ? $`launchctl kickstart -k ${target}` : bootstrap(name))
}
