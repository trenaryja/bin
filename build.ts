#!/usr/bin/env bun
// Build all scripts to .bin/
// Add or remove targets in build.json — no changes needed here for new scripts.
//
// Flags (skip the prompt):
//   --symlink   Symlink TS scripts (requires bun on PATH at runtime)
//   --compile   Compile TS scripts to self-contained binaries
import { cancel, intro, isCancel, log, outro, select } from '@clack/prompts'
import { spawnSync } from 'child_process'
import { chmodSync, copyFileSync, mkdirSync, readdirSync, rmSync, symlinkSync, unlinkSync } from 'fs'
import { join, relative } from 'path'
import buildConfig from './build.json'
import pkg from './package.json'

type TsTarget = { lang: 'typescript'; entry: string; output: string }

type GoTarget = { lang: 'go'; package: string; tag: string; output: string }

type RustTarget = { lang: 'rust'; crate?: string }

type BuildTarget = GoTarget | RustTarget | TsTarget

const ROOT = import.meta.dir
const BIN_DIR = join(ROOT, '.bin')
const targets = buildConfig.targets as BuildTarget[]

mkdirSync(BIN_DIR, { recursive: true })

const cleanBunTemp = () => {
	for (const f of readdirSync(ROOT).filter((file) => file.endsWith('.bun-build'))) rmSync(join(ROOT, f))
}

// ── TypeScript build mode ─────────────────────────────────────────────────────

type TsMode = 'compile' | 'symlink'

async function resolveMode(): Promise<TsMode> {
	if (process.argv.includes('--symlink')) return 'symlink'
	if (process.argv.includes('--compile')) return 'compile'

	const answer = await select({
		message: 'TypeScript build mode?',
		options: [
			{ value: 'symlink', label: 'Symlink', hint: 'requires bun on PATH · edits reflect immediately' },
			{ value: 'compile', label: 'Compile to binary', hint: 'self-contained · no bun required at runtime' },
		],
	})

	if (isCancel(answer)) {
		cancel('Cancelled.')
		process.exit(0)
	}

	return answer as TsMode
}

cleanBunTemp()
intro(`${pkg.name} build`)
const tsMode = await resolveMode()

// ── TypeScript ────────────────────────────────────────────────────────────────

const tsTargets = targets.filter((t): t is TsTarget => t.lang === 'typescript')

if (tsMode === 'symlink') {
	log.step('Symlinking TypeScript scripts...')

	for (const { entry, output } of tsTargets) {
		const source = join(ROOT, entry)
		const target = join(BIN_DIR, output)
		chmodSync(source, 0o755) // kernel requires +x on the target to honor the shebang

		try {
			unlinkSync(target)
		} catch {
			/* not yet linked — fine */
		}

		symlinkSync(relative(BIN_DIR, source), target) // relative so .bin/ stays portable
		log.success(`${output} → ${relative(ROOT, source)}`)
	}
} else {
	log.step('Building TypeScript scripts...')

	for (const { entry, output } of tsTargets) {
		const result = spawnSync(
			'bun',
			['build', '--compile', '--minify', '--outfile', join(BIN_DIR, output), join(ROOT, entry)],
			{ stdio: ['ignore', 'pipe', 'pipe'] },
		)

		if (result.status === 0) log.success(output)
		else {
			log.error(output)
			console.error(result.stderr?.toString())
		}
	}
}

// ── Rust + Go (parallel) ──────────────────────────────────────────────────────

async function buildRust(): Promise<void> {
	if (!Bun.which('cargo')) {
		log.warn('Skipping Rust (cargo not found).')
		return
	}

	log.step('Building Rust binaries...')
	const rustTarget = targets.find((t): t is RustTarget => t.lang === 'rust')
	const crate = rustTarget?.crate ?? '.'

	const proc = Bun.spawn(['cargo', 'build', '--release'], {
		cwd: join(ROOT, crate),
		stdout: 'ignore',
		stderr: 'pipe',
	})

	// Drain stderr concurrently so a full buffer never blocks cargo
	const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])

	if (exitCode === 0) {
		const releaseDir = join(ROOT, crate, 'target', 'release')
		const skip = new Set(['build', 'deps', 'examples', 'incremental'])

		for (const bin of readdirSync(releaseDir).filter((f) => !f.includes('.') && !skip.has(f))) {
			copyFileSync(join(releaseDir, bin), join(BIN_DIR, bin))
			log.success(bin)
		}
	} else {
		log.error('Rust build failed')
		console.error(stderr)
	}
}

async function buildGo(): Promise<void> {
	if (!Bun.which('go')) {
		log.warn('Skipping Go (go not found).')
		return
	}

	log.step('Building Go binaries...')
	const goTargets = targets.filter((t): t is GoTarget => t.lang === 'go')

	await Promise.all(
		goTargets.map(async ({ package: pkg, tag, output }) => {
			const proc = Bun.spawn(['go', 'build', `-tags=${tag}`, '-ldflags=-s -w', '-o', join(BIN_DIR, output), pkg], {
				cwd: ROOT,
				stdout: 'ignore',
				stderr: 'pipe',
			})
			const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])

			if (exitCode === 0) log.success(output)
			else {
				log.error(output)
				console.error(stderr)
			}
		}),
	)
}

await Promise.all([buildRust(), buildGo()])

cleanBunTemp()
outro('Done. Binaries in .bin/')
