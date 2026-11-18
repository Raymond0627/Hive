import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findPath } from './pathfinding'
import { DESKS, isWalkable, nearestWalkable } from './map'

const adjacent = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1

test('walks from a desk to the pantry', () => {
  const from = DESKS.meow.workSpot
  const to = nearestWalkable({ x: 9, y: 30 })
  const path = findPath(from, to)
  assert.ok(path, 'expected a path')
  assert.deepEqual(path[0], from)
  assert.deepEqual(path.at(-1), to)
  assert.ok(path.length > 10)
  for (const cell of path) assert.ok(isWalkable(cell), `blocked cell ${cell.x},${cell.y}`)
  for (let i = 1; i < path.length; i += 1) assert.ok(adjacent(path[i - 1], path[i]))
})

test('walks from the gym to a desk', () => {
  const path = findPath(nearestWalkable({ x: 30, y: 30 }), DESKS.aiz.workSpot)
  assert.ok(path && path.length > 5)
})

test('refuses a blocked target', () => {
  assert.equal(findPath(DESKS.meow.workSpot, { x: 5, y: 7 }), null)
})
