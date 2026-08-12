import { describe, expect, test } from 'bun:test'

import { formatTopTable, toJson, topEntries } from './report.ts'
import { createNode, getSortedChildren, insertEntry } from './tree.ts'

const base = '/home/user/project'

function insert(root: ReturnType<typeof createNode>, path: string, size: number) {
	insertEntry(root, { path: `${base}/${path}`, size, is_dir: false }, base)
}

describe('insertEntry', () => {
	test('propagates size to all ancestors', () => {
		const root = createNode('/')
		insert(root, 'src/a.ts', 200)
		insert(root, 'src/b.ts', 300)

		expect(root.totalSize).toBe(500)
		expect(root.children.get('src')!.totalSize).toBe(500)
	})

	test('invalidates caches along insertion path only', () => {
		const root = createNode('/')
		insert(root, 'src/a.ts', 200)
		insert(root, 'lib/b.ts', 300)

		// Build caches on both branches
		getSortedChildren(root.children.get('src')!)
		getSortedChildren(root.children.get('lib')!)

		// Insert into src — lib's cache should survive
		insert(root, 'src/c.ts', 100)
		expect(root.children.get('lib')!.sortedCache).toBeDefined()
		expect(root.children.get('src')!.sortedCache).toBeUndefined()
	})

	test('handles paths with double slashes', () => {
		const root = createNode('/')
		insertEntry(root, { path: `${base}//src//file.ts`, size: 100, is_dir: false }, base)

		expect(root.children.get('src')!.children.has('file.ts')).toBe(true)
	})
})

describe('getSortedChildren', () => {
	test('caches sorted result by reference', () => {
		const root = createNode('/')
		insert(root, 'small.ts', 100)
		insert(root, 'large.ts', 1000)

		const first = getSortedChildren(root)
		expect(first[0]!.name).toBe('large.ts')
		expect(getSortedChildren(root)).toBe(first)
	})
})

describe('toJson', () => {
	test('prunes below the requested depth', () => {
		const root = createNode('/')
		insert(root, 'src/nested/deep.ts', 100)

		const shallow = toJson(root, 1)
		expect(shallow.children![0]!.name).toBe('src')
		expect(shallow.children![0]!.children).toBeUndefined()

		expect(toJson(root, 2).children![0]!.children![0]!.name).toBe('nested')
	})

	test('reports recursive totals, not own size', () => {
		const root = createNode('/')
		insert(root, 'src/a.ts', 200)
		insert(root, 'src/b.ts', 300)

		expect(toJson(root, 1).children![0]!.size).toBe(500)
	})

	test('marks directories even at the prune boundary', () => {
		const root = createNode('/')
		insert(root, 'src/a.ts', 200)

		expect(toJson(root, 0).isDir).toBe(true)
	})
})

describe('topEntries', () => {
	test('returns the n largest children, descending', () => {
		const root = createNode('/')
		insert(root, 'small.ts', 100)
		insert(root, 'large.ts', 1000)
		insert(root, 'medium.ts', 500)

		expect(topEntries(root, 2).map((entry) => entry.name)).toEqual(['large.ts', 'medium.ts'])
	})

	test('clamps to available children', () => {
		const root = createNode('/')
		insert(root, 'only.ts', 100)

		expect(topEntries(root, 50)).toHaveLength(1)
	})
})

describe('formatTopTable', () => {
	test('suffixes directories with a slash and shows percentages', () => {
		const root = createNode('/')
		insert(root, 'src/a.ts', 750)
		insert(root, 'loose.ts', 250)

		const table = formatTopTable(topEntries(root, 2), root.totalSize)
		expect(table).toContain('src/')
		expect(table).toContain('75%')
		expect(table).toContain('loose.ts')
	})
})
