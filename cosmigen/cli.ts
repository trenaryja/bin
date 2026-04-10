#!/usr/bin/env bun
// cosmigen CLI — generate all cosmiconfig-supported config files from a Zod schema
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import * as clack from '@clack/prompts'
import chalk from 'chalk'
import { runCLI } from '@/lib'
import type { ConfigDefinition, Format, GeneratedFile } from './types'
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
			`Schema file must export { name: string, schema: ZodObject }.\n` + `Got keys: ${Object.keys(config).join(', ')}`,
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
	writeFileSync(fullPath, file.content + '\n', 'utf-8')
}

async function main() {
	const args = process.argv.slice(2)
	let schemaPath: string | null = null
	let outDir = '.'
	let dryRun = false
	let jsonOutput = false
	let interactive = true
	let selectedFormats: Format[] | null = null

	for (const arg of args) {
		switch (arg) {
			case '--dry-run':
			case '-n':
				dryRun = true
				break
			case '--json':
				jsonOutput = true
				interactive = false
				break
			case '--all':
				interactive = false
				break
			case '--help':
			case '-h':
				printHelp()
				process.exit(0)
				break
			default:
				if (arg.startsWith('-o=') || arg.startsWith('--out=')) {
					outDir = arg.split('=')[1]
				} else if (arg.startsWith('-')) {
					console.error(`error: unknown flag: ${arg}`)
					process.exit(1)
				} else {
					schemaPath = arg
				}
		}
	}

	if (interactive) {
		clack.intro(chalk.bgCyan.black(' cosmigen '))
	}

	// Resolve schema file
	if (!schemaPath) {
		schemaPath = findSchemaFile(process.cwd())
		if (!schemaPath) {
			if (interactive) {
				const input = await clack.text({
					message: 'Path to schema file:',
					placeholder: './cosmigen.config.ts',
					validate: (v) => {
						if (!v) return 'Required'
						if (!existsSync(resolve(v))) return 'File not found'
					},
				})
				if (clack.isCancel(input)) {
					clack.cancel('Cancelled.')
					process.exit(0)
				}
				schemaPath = input
			} else {
				console.error('error: no schema file found. Provide a path or create cosmigen.config.ts')
				process.exit(1)
			}
		} else if (interactive) {
			clack.log.info(`Found schema: ${chalk.cyan(schemaPath)}`)
		}
	}

	// Load and introspect
	const spinner = interactive ? clack.spinner() : null
	spinner?.start('Loading schema...')

	const config = await loadSchema(schemaPath)
	const fields = introspectSchema(config.schema)

	spinner?.stop(`Introspected ${chalk.bold(fields.length)} fields from ${chalk.cyan(config.name)} schema`)

	// Select formats
	let files: GeneratedFile[]
	if (selectedFormats) {
		files = generateFormats(fields, config.name, selectedFormats)
	} else if (interactive && !jsonOutput) {
		const choice = await clack.select({
			message: 'Which formats to generate?',
			options: [
				{ value: 'all', label: 'All formats', hint: `${generateAll(fields, config.name).length} files` },
				{ value: 'full-fidelity', label: 'Full fidelity only', hint: 'JS/TS formats (no data loss)' },
				{ value: 'static', label: 'Static only', hint: 'JSON + YAML (no code execution)' },
			],
		})
		if (clack.isCancel(choice)) {
			clack.cancel('Cancelled.')
			process.exit(0)
		}
		const allFiles = generateAll(fields, config.name)
		switch (choice) {
			case 'full-fidelity':
				files = allFiles.filter((f) => f.fullFidelity)
				break
			case 'static':
				files = allFiles.filter((f) =>
					['rc', 'rc-json', 'rc-yaml', 'package-json', 'config-dir-rc', 'config-dir-json', 'config-dir-yaml'].includes(
						f.format,
					),
				)
				break
			default:
				files = allFiles
		}
	} else {
		files = generateAll(fields, config.name)
	}

	// JSON output mode
	if (jsonOutput) {
		console.log(JSON.stringify(files, null, '\t'))
		return
	}

	// Write files
	if (interactive) {
		const confirmMsg = dryRun
			? `Preview ${files.length} files?`
			: `Write ${files.length} files to ${chalk.cyan(resolve(outDir))}?`
		const confirmed = await clack.confirm({ message: confirmMsg })
		if (clack.isCancel(confirmed) || !confirmed) {
			clack.cancel('Cancelled.')
			process.exit(0)
		}
	}

	for (const file of files) {
		writeGeneratedFile(file, outDir, dryRun)
		if (interactive) {
			const fidelityTag = file.fullFidelity
				? chalk.green('✓ full fidelity')
				: chalk.yellow(`⚠ ${file.fidelityLosses.length} loss${file.fidelityLosses.length > 1 ? 'es' : ''}`)
			clack.log.success(`${chalk.bold(file.path)} ${chalk.dim('—')} ${fidelityTag}`)
		}
	}

	// Show fidelity summary
	if (interactive) {
		const lossy = files.filter((f) => !f.fullFidelity)
		if (lossy.length > 0) {
			clack.log.warn(chalk.yellow('Fidelity losses:'))
			for (const file of lossy) {
				for (const loss of file.fidelityLosses) {
					clack.log.message(`  ${chalk.dim(file.path)} → ${loss.field}: ${loss.reason}`)
				}
			}
		}
		clack.outro(`Generated ${files.length} config files for ${chalk.cyan(config.name)}`)
	}
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
  --json             Output generated files as JSON (for piping)
  --dry-run, -n      Preview without writing files
  --out=<dir>        Output directory (default: current directory)
  -h, --help         Show this help

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
