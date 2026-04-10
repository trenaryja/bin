import type { FieldMeta, Format, GeneratedFile } from './types'
import { FORMAT_CATEGORIES } from './types'
import { analyzeFidelity, exampleValue } from './introspect'

/** Build a plain object of example values (JSON-safe) from field metadata */
function buildExampleObject(fields: FieldMeta[], includeComments = false): Record<string, unknown> {
	const obj: Record<string, unknown> = {}
	for (const field of fields) {
		if (field.isFunction || field.isSymbol || field.isMap || field.isSet) continue
		obj[field.name] = exampleValue(field)
	}
	return obj
}

/** Generate a JSON string with inline comments as // above each field */
function jsonWithComments(fields: FieldMeta[], indent = '\t'): string {
	const renderable = fields.filter((f) => !f.isFunction && !f.isSymbol && !f.isMap && !f.isSet)
	const lines: string[] = ['{']
	for (let i = 0; i < renderable.length; i++) {
		const field = renderable[i]
		const val = JSON.stringify(exampleValue(field))
		const comma = i < renderable.length - 1 ? ',' : ''
		if (field.description) {
			lines.push(`${indent}// ${field.description}`)
		}
		lines.push(`${indent}"${field.name}": ${val}${comma}`)
	}
	lines.push('}')
	return lines.join('\n')
}

/** Generate YAML content from fields */
function yamlContent(fields: FieldMeta[], indent = ''): string {
	const lines: string[] = []
	for (const field of fields) {
		if (field.isFunction || field.isSymbol || field.isMap || field.isSet) continue
		if (field.description) {
			lines.push(`${indent}# ${field.description}`)
		}
		const val = exampleValue(field)
		if (field.children && typeof val === 'object' && val !== null && !Array.isArray(val)) {
			lines.push(`${indent}${field.name}:`)
			lines.push(yamlContent(field.children, indent + '  '))
		} else if (Array.isArray(val)) {
			if (val.length === 0) {
				lines.push(`${indent}${field.name}: []`)
			} else {
				lines.push(`${indent}${field.name}:`)
				for (const item of val) {
					lines.push(`${indent}  - ${yamlScalar(item)}`)
				}
			}
		} else {
			lines.push(`${indent}${field.name}: ${yamlScalar(val)}`)
		}
	}
	return lines.join('\n')
}

function yamlScalar(val: unknown): string {
	if (val === null) return 'null'
	if (val === undefined) return 'null'
	if (typeof val === 'string') {
		if (val === '') return '""'
		if (/[:#\[\]{}&*!|>'"%@`]/.test(val) || val.includes('\n')) return JSON.stringify(val)
		return val
	}
	if (typeof val === 'number' || typeof val === 'boolean') return String(val)
	return JSON.stringify(val)
}

/** Generate a JS function placeholder for function-typed fields */
function jsFunctionPlaceholder(field: FieldMeta, indent: string): string {
	return `() => {\n${indent}\t// ${field.description ?? `${field.name} handler`}\n${indent}}`
}

/** Render a JS value for a field, handling nested objects with complex types */
function jsFieldValue(field: FieldMeta, indent: string): string {
	if (field.isFunction) return jsFunctionPlaceholder(field, indent)
	if (field.isDate) {
		return `new Date(${field.defaultValue ? `'${(field.defaultValue as Date).toISOString()}'` : ''})`
	}
	if (field.isMap) return 'new Map()'
	if (field.isSet) return 'new Set()'

	if (field.children) {
		const inner = field.children
			.map((child) => {
				const comment = child.description ? `${indent}\t// ${child.description}\n` : ''
				return `${comment}${indent}\t${child.name}: ${jsFieldValue(child, indent + '\t')},`
			})
			.join('\n')
		return `{\n${inner}\n${indent}}`
	}

	return JSON.stringify(exampleValue(field))
}

/** Generate JS/TS module content */
function jsModuleContent(fields: FieldMeta[], opts: { esm: boolean; typescript: boolean; moduleName: string }): string {
	const lines: string[] = []
	const hasComplexFields = fields.some((f) => f.isFunction || f.isDate || f.isMap || f.isSet)

	if (opts.typescript) {
		lines.push(`/** @type {import('cosmiconfig').Config} */`)
	}

	// Build the config object
	const configLines: string[] = []
	for (const field of fields) {
		if (field.description) {
			configLines.push(`\t// ${field.description}`)
		}
		configLines.push(`\t${field.name}: ${jsFieldValue(field, '\t')},`)
	}

	const configObj = `{\n${configLines.join('\n')}\n}`

	if (opts.esm) {
		lines.push(`export default ${configObj}`)
	} else {
		lines.push(`module.exports = ${configObj}`)
	}

	return lines.join('\n') + '\n'
}

/** Generate package.json field content */
function packageJsonField(fields: FieldMeta[], moduleName: string): string {
	const obj = buildExampleObject(fields)
	const wrapper = { [moduleName]: obj }
	return JSON.stringify(wrapper, null, '\t')
}

/** Get the file path for a given format and module name */
function formatPath(format: Format, moduleName: string): string {
	switch (format) {
		case 'rc':
			return `.${moduleName}rc`
		case 'rc-json':
			return `.${moduleName}rc.json`
		case 'rc-yaml':
			return `.${moduleName}rc.yaml`
		case 'rc-js':
			return `.${moduleName}rc.js`
		case 'rc-ts':
			return `.${moduleName}rc.ts`
		case 'rc-mjs':
			return `.${moduleName}rc.mjs`
		case 'rc-cjs':
			return `.${moduleName}rc.cjs`
		case 'config-js':
			return `${moduleName}.config.js`
		case 'config-ts':
			return `${moduleName}.config.ts`
		case 'config-mjs':
			return `${moduleName}.config.mjs`
		case 'config-cjs':
			return `${moduleName}.config.cjs`
		case 'package-json':
			return `package.json`
		case 'config-dir-rc':
			return `.config/${moduleName}rc`
		case 'config-dir-json':
			return `.config/${moduleName}rc.json`
		case 'config-dir-yaml':
			return `.config/${moduleName}rc.yaml`
		case 'config-dir-js':
			return `.config/${moduleName}rc.js`
		case 'config-dir-ts':
			return `.config/${moduleName}rc.ts`
		case 'config-dir-mjs':
			return `.config/${moduleName}rc.mjs`
		case 'config-dir-cjs':
			return `.config/${moduleName}rc.cjs`
	}
}

/** Generate a single config file for a given format */
function generateFormat(format: Format, fields: FieldMeta[], moduleName: string): GeneratedFile {
	const category = FORMAT_CATEGORIES[format]
	const fidelityLosses = analyzeFidelity(fields, category)
	const path = formatPath(format, moduleName)

	let content: string

	switch (category) {
		case 'json':
			if (format === 'package-json') {
				content = packageJsonField(fields, moduleName)
			} else {
				content = JSON.stringify(buildExampleObject(fields), null, '\t')
			}
			break
		case 'yaml':
			content = yamlContent(fields)
			break
		case 'js-cjs':
			content = jsModuleContent(fields, { esm: false, typescript: false, moduleName })
			break
		case 'js-esm':
			content = jsModuleContent(fields, { esm: true, typescript: false, moduleName })
			break
		case 'ts':
			content = jsModuleContent(fields, { esm: true, typescript: true, moduleName })
			break
	}

	return {
		path,
		content,
		format,
		fullFidelity: fidelityLosses.length === 0,
		fidelityLosses,
	}
}

/** All cosmiconfig-supported formats */
const ALL_FORMATS: Format[] = [
	'rc',
	'rc-json',
	'rc-yaml',
	'rc-js',
	'rc-ts',
	'rc-mjs',
	'rc-cjs',
	'config-js',
	'config-ts',
	'config-mjs',
	'config-cjs',
	'package-json',
	'config-dir-rc',
	'config-dir-json',
	'config-dir-yaml',
	'config-dir-js',
	'config-dir-ts',
	'config-dir-mjs',
	'config-dir-cjs',
]

/** Generate all cosmiconfig-supported config files from field metadata */
export function generateAll(fields: FieldMeta[], moduleName: string): GeneratedFile[] {
	return ALL_FORMATS.map((format) => generateFormat(format, fields, moduleName))
}

/** Generate only specific formats */
export function generateFormats(fields: FieldMeta[], moduleName: string, formats: Format[]): GeneratedFile[] {
	return formats.map((format) => generateFormat(format, fields, moduleName))
}
