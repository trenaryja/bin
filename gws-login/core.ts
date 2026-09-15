import { copyFileSync, existsSync, readdirSync, rmSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import * as R from 'remeda'

const AUTH = 'https://www.googleapis.com/auth/'

// One login per account must serve every tool sharing its config dir: `gws auth login` REPLACES the
// scope set, so a narrower login strips another tool's access. `--full` is not full — it omits
// contacts and gmail.settings.basic, the only scope filters.create accepts.
// Broad scopes only; a narrower sibling adds a consent row and no access. Deliberately absent:
// https://mail.google.com/ (its one addition over gmail.modify is permanent delete, so no tool on
// these accounts can destroy mail) and gmail.metadata (restricts, never extends, what a grant can do).
// Also absent, measured on consumer accounts: Workspace-only scopes (Chat, Keep, Admin, Groups,
// Classroom). keep, chat.import and chat.app.* block the consent screen (Error 400 invalid_scope); with
// those gone the group shows, then fails at Continue ("Something went wrong"). The probe passes all of it.
export const SCOPES = [
	'openid',
	...[
		'userinfo.email',
		'userinfo.profile',
		'gmail.modify',
		'gmail.settings.basic',
		'gmail.settings.sharing',
		'contacts',
		'contacts.other.readonly',
		'directory.readonly',
		'user.addresses.read',
		'user.birthday.read',
		'user.emails.read',
		'user.gender.read',
		'user.organization.read',
		'user.phonenumbers.read',
		'drive',
		'drive.appdata',
		'drive.apps.readonly',
		'drive.scripts',
		'documents',
		'spreadsheets',
		'presentations',
		'forms',
		'forms.body',
		'forms.responses.readonly',
		'calendar',
		'tasks',
		'meetings.space.created',
		'meetings.space.readonly',
		'meetings.space.settings',
		'script.projects',
		'script.deployments',
		'script.processes',
		'script.metrics',
		'cloud-platform',
		'pubsub',
	].map((name) => AUTH + name),
]

export const ACCOUNTS_ROOT = join(homedir(), '.config', 'gws-accounts')

// The address becomes a path segment; anything but a bare address could walk out of the root.
export const accountDir = (email: string) => {
	if (!/^[^\s/@]+@[^\s/@]+$/.test(email) || !email.split('@')[1]?.includes('.'))
		throw new Error(`not an email address: ${email}`)
	return join(ACCOUNTS_ROOT, email)
}

const hasCredentials = (dir: string) =>
	['credentials.enc', 'credentials.json'].some((name) => existsSync(join(dir, name)))

export const knownAccounts = () =>
	existsSync(ACCOUNTS_ROOT)
		? readdirSync(ACCOUNTS_ROOT)
				.filter((name) => hasCredentials(join(ACCOUNTS_ROOT, name)))
				.sort()
		: []

// gws looks for the OAuth client only in the dir it is pointed at, so a new account's dir fails
// with "No OAuth client configured" until a client file is there. Any existing dir's client serves.
export const ensureClient = (dir: string) => {
	const target = join(dir, 'client_secret.json')
	if (existsSync(target)) return target
	const source = [
		...readdirSync(ACCOUNTS_ROOT).map((name) => join(ACCOUNTS_ROOT, name)),
		join(homedir(), '.config', 'gws'),
	]
		.map((candidate) => join(candidate, 'client_secret.json'))
		.find(existsSync)
	if (!source) throw new Error('no OAuth client on this machine — run `gws auth setup` first')
	copyFileSync(source, target)
	return target
}

const clientId = async (clientFile: string) => {
	const config: Record<string, { client_id: string }> = await Bun.file(clientFile).json()
	const client = R.values(config)[0]
	if (!client) throw new Error(`${clientFile} holds no OAuth client`)
	return client.client_id
}

// Google rejects a malformed scope before sign-in and names it: the authorize endpoint redirects to
// an error page whose authError param is a protobuf carrying "invalid=[...]". Checking here keeps a
// typo from costing a browser round trip. Sends only the client id, which every auth URL carries.
export const invalidScopes = async (clientFile: string, scopes: string[]) => {
	const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
	url.search = new URLSearchParams({
		client_id: await clientId(clientFile),
		redirect_uri: 'http://localhost',
		response_type: 'code',
		scope: scopes.join(' '),
	}).toString()
	const response = await fetch(url, { redirect: 'manual' })
	const authError = new URL(response.headers.get('location') ?? '', url).searchParams.get('authError')
	if (!authError) return []
	const invalid = /invalid=\[([^\]]*)\]/.exec(Buffer.from(authError, 'base64url').toString('latin1'))
	if (!invalid) throw new Error(`Google refused the authorize request: ${authError}`)
	return invalid[1]?.split(', ') ?? []
}

export type Status = { user?: string; scopes?: string[] }

export const run = (dir: string, argv: string[], stdio: 'inherit' | 'pipe') =>
	Bun.spawn(['gws', ...argv], {
		env: { ...process.env, GOOGLE_WORKSPACE_CLI_CONFIG_DIR: dir },
		stdin: stdio,
		stdout: stdio,
		stderr: stdio,
	})

export const status = async (dir: string): Promise<Status> =>
	JSON.parse(await new Response(run(dir, ['auth', 'status'], 'pipe').stdout).text())

// A fresh login leaves the old access token cached, still carrying the old scopes until it expires.
export const clearTokenCache = (dir: string) => rmSync(join(dir, 'token_cache.json'), { force: true })
