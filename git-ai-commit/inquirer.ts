#!/usr/bin/env bun
import { commit, getStagedDiff, isGitRepo, openEditor, runCLI, tuiHeading } from '@/lib'
import chalk from 'chalk'
import inquirer from 'inquirer'
import ora from 'ora'
import config from './config.json'
import { generate } from './generate'

async function main() {
	console.log(chalk.bold('\ngit-ai-commit') + chalk.dim(' (inquirer)\n'))

	if (!isGitRepo()) {
		console.error(chalk.red('✖ Not inside a git repository.'))
		process.exit(1)
	}

	const diff = getStagedDiff(config.maxDiffChars)

	if (!diff) {
		console.error(chalk.red("✖ No staged changes. Run 'git add' first."))
		process.exit(1)
	}

	let message = ''
	let needsGeneration = true

	// TODO: if more tools adopt this pattern, extract a `runLoop()` helper that
	// contains the no-await-in-loop suppression once so callers never need it.
	while (true) {
		if (needsGeneration) {
			const spinner = ora(`Analyzing staged changes with ${config.model}`).start()

			try {
				// eslint-disable-next-line no-await-in-loop -- intentional: sequential interactive loop
				message = await generate(diff)
				spinner.succeed('Generated commit message')
			} catch {
				spinner.fail('Failed to reach Ollama. Is it running?')
				process.exit(1)
			}
		}

		tuiHeading(message)

		// eslint-disable-next-line no-await-in-loop -- intentional: sequential interactive loop
		const { action } = await inquirer.prompt([
			{
				type: 'list',
				name: 'action',
				message: 'What would you like to do?',
				choices: [
					{ name: 'Commit with this message', value: 'commit' },
					{ name: 'Edit the message (opens $EDITOR)', value: 'edit' },
					{ name: 'Regenerate', value: 'regenerate' },
					new inquirer.Separator(),
					{ name: 'Cancel', value: 'cancel' },
				],
			},
		])

		if (action === 'commit') {
			commit(message)
			console.log(chalk.green('\n✔ Committed.\n'))
			break
		}

		if (action === 'edit') {
			const edited = openEditor(message)
			if (edited) message = edited
			needsGeneration = false
			continue
		}

		if (action === 'cancel') {
			console.log(chalk.dim('\nCancelled.\n'))
			process.exit(0)
		}

		needsGeneration = true
	}
}

runCLI(main)
