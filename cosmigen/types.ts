import type { ZodType } from 'zod'

/** Metadata extracted from a single Zod schema field */
export type FieldMeta = {
	name: string
	typeName: string
	description?: string
	defaultValue?: unknown
	isOptional: boolean
	isFunction: boolean
	isDate: boolean
	isRegex: boolean
	isSymbol: boolean
	isMap: boolean
	isSet: boolean
	/** For arrays, the element type name */
	elementType?: string
	/** For objects, nested field metadata */
	children?: FieldMeta[]
	/** For enums, the allowed values */
	enumValues?: readonly string[]
	/** For literals, the literal value */
	literalValue?: unknown
}

/** Schema definition provided by the user */
export type ConfigDefinition = {
	/** Module name — used for file naming (e.g., "myapp" → .myapprc, myapp.config.js) */
	name: string
	/** The root Zod object schema */
	schema: ZodType
}

/** A generated configuration file */
export type GeneratedFile = {
	/** Relative file path (e.g., ".myapprc.json") */
	path: string
	/** File content */
	content: string
	/** Format category */
	format: Format
	/** Whether this format has full fidelity for the given schema */
	fullFidelity: boolean
	/** Fields that lose fidelity in this format */
	fidelityLosses: FidelityLoss[]
}

export type FidelityLoss = {
	field: string
	reason: string
}

export type Format =
	| 'config-cjs'
	| 'config-dir-cjs'
	| 'config-dir-js'
	| 'config-dir-json'
	| 'config-dir-mjs'
	| 'config-dir-rc'
	| 'config-dir-ts'
	| 'config-dir-yaml'
	| 'config-js'
	| 'config-mjs'
	| 'config-ts'
	| 'package-json'
	| 'rc-cjs'
	| 'rc-js'
	| 'rc-json'
	| 'rc-mjs'
	| 'rc-ts'
	| 'rc-yaml'
	| 'rc'

export type FormatCategory = 'js-cjs' | 'js-esm' | 'json' | 'ts' | 'yaml'

/** Maps a format to its serialization category */
export const FORMAT_CATEGORIES: Record<Format, FormatCategory> = {
	rc: 'json',
	'rc-json': 'json',
	'rc-yaml': 'yaml',
	'rc-js': 'js-cjs',
	'rc-ts': 'ts',
	'rc-mjs': 'js-esm',
	'rc-cjs': 'js-cjs',
	'config-js': 'js-cjs',
	'config-ts': 'ts',
	'config-mjs': 'js-esm',
	'config-cjs': 'js-cjs',
	'package-json': 'json',
	'config-dir-rc': 'json',
	'config-dir-json': 'json',
	'config-dir-yaml': 'yaml',
	'config-dir-js': 'js-cjs',
	'config-dir-ts': 'ts',
	'config-dir-mjs': 'js-esm',
	'config-dir-cjs': 'js-cjs',
}
