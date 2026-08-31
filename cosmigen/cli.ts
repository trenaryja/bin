#!/usr/bin/env bun
// cosmigen CLI — generate all cosmiconfig-supported config files from a Zod schema
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import * as clack from '@clack/prompts'
import chalk from 'chalk'
import { runCLI } from '@/lib'
import type { ConfigDefinition, FieldMeta, Format, FormatCategory, GeneratedFile } from './types'
import { FORMAT_CATEGORIES } from './types'
import { introspectSchema } from './introspect'
import { generateAll, generateFormats } from './formats'

/** Convention-based schema file names, checked in order */
const SCHEMA_CONVENTIONS = ['cosmigen.config.ts', 'cosmigen.schema.ts', '.cosmigenrc.ts']

function findSchemaFile(cwd: string): string | null {
	for (const name of SCHEMA_CONVENTIONS) {
		const p = resolve(cwd, name)
		if (existsSync(p)) return p
	}

	return null
}

async function loadSchema(path: string): Promise<ConfigDefinition> {
	const mod = await import(resolve(path))
	const config = mod.default ?? mod.config ?? mod

	if (!config.name || !config.schema) {
		throw new Error(
			`Schema file must export { name: string, schema: ZodObject }.\nGot keys: ${Object.keys(config).join(', ')}`,
		)
	}

	return config as ConfigDefinition
}

function writeGeneratedFile(file: GeneratedFile, outDir: string, dryRun: boolean): void {
	const resolvedOut = resolve(outDir)
	const fullPath = resolve(resolvedOut, file.path)

	if (!fullPath.startsWith(resolvedOut + sep) && fullPath !== resolvedOut) {
		throw new Error(`Path traversal detected: ${file.path} escapes output directory`)
	}
	if (dryRun) {
		clack.log.info(`${chalk.dim('[dry-run]')} ${file.path}`)
		return
	}

	const dir = dirname(fullPath)
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
	writeFileSync(fullPath, `${file.content}\n`, 'utf-8')
}

// ── Argument parsing ─────────────────────────────────────────────────────────

type CliOptions = {
	dryRun: boolean
	formats: Format[] | null
	interactive: boolean
	jsonOutput: boolean
	outDir: string
	schemaPath: string | null
}

const isFormat = (value: string): value is Format => value in FORMAT_CATEGORIES

function parseFormatList(value: string): Format[] {
	const requested = value
		.split(',')
		.map((x) => x.trim())
		.filter(Boolean)
	const unknown = requested.filter((format) => !isFormat(format))

	if (unknown.length > 0) {
		console.error(`error: unknown format(s): ${unknown.join(', ')}`)
		console.error(`valid formats: ${Object.keys(FORMAT_CATEGORIES).sort().join(', ')}`)
		process.exit(1)
	}

	return requested.filter(isFormat)
}

/** Handles the `default:` arm of parseArgs — flags carrying a value, plus the positional schema path */
function applyValueArg(arg: string, options: CliOptions): void {
	if (arg.startsWith('-o=') || arg.startsWith('--out=')) {
		options.outDir = arg.split('=')[1]!
		return
	}

	if (arg.startsWith('--formats=')) {
		options.formats = parseFormatList(arg.split('=')[1]!)
		options.interactive = false
		return
	}

	if (arg.startsWith('-')) {
		console.error(`error: unknown flag: ${arg}`)
		process.exit(1)
	}

	options.schemaPath = arg
}

function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = {
		dryRun: false,
		formats: null,
		interactive: true,
		jsonOutput: false,
		outDir: '.',
		schemaPath: null,
	}

	// Handled before the switch: `process.exit` is `never`, but `no-fallthrough` can't see that,
	// and the `break` it would demand is unreachable code to TypeScript.
	if (args.includes('--help') || args.includes('-h')) {
		printHelp()
		process.exit(0)
	}

	for (const arg of args) {
		switch (arg) {
			case '--dry-run':
			case '-n':
				options.dryRun = true
				break
			case '--json':
				options.jsonOutput = true
				options.interactive = false
				break
			case '--all':
				options.interactive = false
				break
			default:
				applyValueArg(arg, options)
		}
	}

	return options
}

// ── Pipeline stages ──────────────────────────────────────────────────────────

async function resolveSchemaPath(explicit: string | null, interactive: boolean): Promise<string> {
	if (explicit) return explicit

	const discovered = findSchemaFile(process.cwd())

	if (discovered) {
		if (interactive) clack.log.info(`Found schema: ${chalk.cyan(discovered)}`)
		return discovered
	}

	if (!interactive) {
		console.error('error: no schema file found. Provide a path or create cosmigen.config.ts')
		process.exit(1)
	}

	const input = await clack.text({
		message: 'Path to schema file:',
		placeholder: './cosmigen.config.ts',
		validate: (value) => {
			if (!value) return 'Required'
			if (!existsSync(resolve(value))) return 'File not found'
		},
	})

	if (clack.isCancel(input)) {
		clack.cancel('Cancelled.')
		process.exit(0)
	}

	return input
}

/** Formats that serialize without executing code */
const STATIC_CATEGORIES: FormatCategory[] = ['json', 'yaml']

async function selectFiles(fields: FieldMeta[], moduleName: string, options: CliOptions): Promise<GeneratedFile[]> {
	if (options.formats) return generateFormats(fields, moduleName, options.formats)
	if (!options.interactive || options.jsonOutput) return generateAll(fields, moduleName)

	const choice = await clack.select({
		message: 'Which formats to generate?',
		options: [
			{ value: 'all', label: 'All formats', hint: `${generateAll(fields, moduleName).length} files` },
			{ value: 'full-fidelity', label: 'Full fidelity only', hint: 'JS/TS formats (no data loss)' },
			{ value: 'static', label: 'Static only', hint: 'JSON + YAML (no code execution)' },
		],
	})

	if (clack.isCancel(choice)) {
		clack.cancel('Cancelled.')
		process.exit(0)
	}

	const allFiles = generateAll(fields, moduleName)

	switch (choice) {
		case 'full-fidelity':
			return allFiles.filter((file) => file.fullFidelity)
		case 'static':
			return allFiles.filter((file) => STATIC_CATEGORIES.includes(FORMAT_CATEGORIES[file.format]))
		case 'all':
			return allFiles
	}
}

async function confirmWrite(files: GeneratedFile[], options: CliOptions): Promise<void> {
	const message = options.dryRun
		? `Preview ${files.length} files?`
		: `Write ${files.length} files to ${chalk.cyan(resolve(options.outDir))}?`
	const confirmed = await clack.confirm({ message })

	if (clack.isCancel(confirmed) || !confirmed) {
		clack.cancel('Cancelled.')
		process.exit(0)
	}
}

function logWritten(file: GeneratedFile): void {
	const losses = file.fidelityLosses.length
	const fidelityTag = file.fullFidelity
		? chalk.green('✓ full fidelity')
		: chalk.yellow(`⚠ ${losses} loss${losses > 1 ? 'es' : ''}`)

	clack.log.success(`${chalk.bold(file.path)} ${chalk.dim('—')} ${fidelityTag}`)
}

function reportFidelity(files: GeneratedFile[]): void {
	const lossy = files.filter((file) => !file.fullFidelity)
	if (lossy.length === 0) return

	clack.log.warn(chalk.yellow('Fidelity losses:'))

	for (const file of lossy) {
		for (const loss of file.fidelityLosses) {
			clack.log.message(`  ${chalk.dim(file.path)} → ${loss.field}: ${loss.reason}`)
		}
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2))

	if (options.interactive) clack.intro(chalk.bgCyan.black(' cosmigen '))

	const schemaPath = await resolveSchemaPath(options.schemaPath, options.interactive)
	const spinner = options.interactive ? clack.spinner() : null

	spinner?.start('Loading schema...')

	const config = await loadSchema(schemaPath)
	const fields = introspectSchema(config.schema)

	spinner?.stop(`Introspected ${chalk.bold(fields.length)} fields from ${chalk.cyan(config.name)} schema`)

	const files = await selectFiles(fields, config.name, options)

	if (options.jsonOutput) {
		console.log(JSON.stringify(files, null, '\t'))
		return
	}

	if (options.interactive) await confirmWrite(files, options)

	for (const file of files) {
		writeGeneratedFile(file, options.outDir, options.dryRun)
		if (options.interactive) logWritten(file)
	}

	if (!options.interactive) return

	reportFidelity(files)
	clack.outro(`Generated ${files.length} config files for ${chalk.cyan(config.name)}`)
}

function printHelp() {
	console.log(`
${chalk.bold('cosmigen')} — Generate all cosmiconfig config files from a Zod schema

${chalk.bold('USAGE')}
  cosmigen [schema-path] [options]

${chalk.bold('ARGUMENTS')}
  schema-path        Path to schema file (default: auto-discover cosmigen.config.ts)

${chalk.bold('OPTIONS')}
  --all              Generate all formats non-interactively
  --formats=<list>   Generate only these comma-separated formats (implies --all)
  --json             Output generated files as JSON (for piping)
  --dry-run, -n      Preview without writing files
  --out=<dir>        Output directory (default: current directory)
  -h, --help         Show this help

${chalk.bold('FORMATS')}
  ${Object.keys(FORMAT_CATEGORIES).sort().join(', ')}

${chalk.bold('SCHEMA FILE')}
  Export a { name, schema } object using defineConfig():

    import { z } from 'zod'
    import { defineConfig } from 'cosmigen/define'

    export default defineConfig({
      name: 'myapp',
      schema: z.object({
        port: z.number().default(3000).describe('Server port'),
        debug: z.boolean().default(false).describe('Enable debug mode'),
      }),
    })

${chalk.bold('CONVENTIONS')}
  Auto-discovered files (in order):
    cosmigen.config.ts, cosmigen.schema.ts, .cosmigenrc.ts
`)
}

runCLI(main)
