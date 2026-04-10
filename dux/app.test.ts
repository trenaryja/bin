import { describe, expect, test } from 'bun:test'

import { createNode, getSortedChildren, insertEntry } from './app.tsx'

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
