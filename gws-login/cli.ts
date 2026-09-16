#!/usr/bin/env bun
import { cancel, isCancel, log, multiselect, text } from '@clack/prompts'
import { runCLI } from '@/lib'
import * as R from 'remeda'
import { accountDir, clearTokenCache, ensureClient, invalidScopes, knownAccounts, run, SCOPES, status } from './core'

const USAGE = `Usage: gws-login [<email>...] [--all] [--print-scopes]

Logs each account's gws config dir (~/.config/gws-accounts/<email>) in with every scope any tool
needs, so no tool ever asks again. No arguments on a TTY -> pick accounts interactively.

Options:
  --all            Every account that already has a config dir
  --print-scopes   Print the scope list, one per line, and exit
  -h, --help       Show this help`

const usageError = (message: string) => {
	console.error(`error: ${message}\n\n${USAGE}`)
	process.exit(2)
}

const pickAccounts = async () => {
	const known = knownAccounts()
	const NEW = '+ another account'
	const picked = await multiselect({
		message: 'Log in which accounts?',
		options: [...known.map((email) => ({ value: email, label: email })), { value: NEW, label: NEW }],
		initialValues: known,
	})

	if (isCancel(picked)) {
		cancel('Cancelled.')
		process.exit(0)
	}

	if (!picked.includes(NEW)) return picked
	const added = await text({
		message: 'Email address',
		validate: (value) => (value?.includes('@') ? undefined : 'Not an email'),
	})
	return isCancel(added) ? picked.filter((email) => email !== NEW) : [...picked.filter((email) => email !== NEW), added]
}

const loginAccount = async (email: string) => {
	const dir = accountDir(email)
	const clientFile = ensureClient(dir)
	const invalid = await invalidScopes(clientFile, SCOPES)
	if (invalid.length) log.warn(`Google no longer accepts, skipping: ${invalid.join(', ')}`)
	const requested = SCOPES.filter((scope) => !invalid.includes(scope))

	log.step(`${email} — sign in as ${email}, tick "Select all", then Continue`)
	if ((await run(dir, ['auth', 'login', '--scopes', requested.join(',')], 'inherit').exited) !== 0)
		throw new Error(`${email}: gws auth login failed`)

	const granted = await status(dir)

	if (granted.user !== email) {
		await run(dir, ['auth', 'logout'], 'pipe').exited
		throw new Error(
			`${email}: browser signed in as ${granted.user ?? 'nobody'} — credentials cleared, rerun signed in as ${email}`,
		)
	}

	clearTokenCache(dir)
	const missing = R.difference(requested, granted.scopes ?? [])
	if (missing.length) throw new Error(`${email}: consent left out ${missing.join(', ')} — rerun and tick "Select all"`)
	log.success(`${email}: ${granted.scopes?.length ?? 0} scopes`)
}

async function main() {
	const args = process.argv.slice(2)
	if (args.includes('-h') || args.includes('--help')) return console.log(USAGE)
	if (args.includes('--print-scopes')) return console.log(SCOPES.join('\n'))
	const unknown = args.filter((arg) => arg.startsWith('-') && arg !== '--all')
	if (unknown.length) return usageError(`unknown flag: ${unknown.join(' ')}`)

	const named = args.filter((arg) => !arg.startsWith('-'))
	const accounts = args.includes('--all')
		? R.unique([...knownAccounts(), ...named])
		: named.length || !process.stdin.isTTY
			? named
			: await pickAccounts()
	if (!accounts.length) return usageError('name an account, or pass --all')

	const failures: string[] = []
	for (const email of accounts)
		await loginAccount(email).catch((error: Error) => {
			log.error(error.message)
			failures.push(email)
		})
	if (failures.length) process.exit(1)
}

runCLI(main)
