import { randomId } from '../lib/id'

export interface PaneSpec {
  id: string
  title: string
}

export interface LeafNode {
  type: 'leaf'
  pane: PaneSpec
}

export interface SplitNode {
  type: 'split'
  id: string
  direction: 'row' | 'column'
  ratio: number
  first: PaneNode
  second: PaneNode
}

export type PaneNode = LeafNode | SplitNode

export function newPane(title = 'Shell'): PaneSpec {
  return { id: randomId(), title }
}

export function updatePaneTitle(node: PaneNode, paneId: string, title: string): PaneNode {
  if (node.type === 'leaf') {
    return node.pane.id === paneId ? { ...node, pane: { ...node.pane, title } } : node
  }
  return {
    ...node,
    first: updatePaneTitle(node.first, paneId, title),
    second: updatePaneTitle(node.second, paneId, title),
  }
}

export function paneTitleOf(node: PaneNode, paneId: string): string | null {
  if (node.type === 'leaf') return node.pane.id === paneId ? node.pane.title : null
  return paneTitleOf(node.first, paneId) ?? paneTitleOf(node.second, paneId)
}

export function collectPanes(node: PaneNode): PaneSpec[] {
  if (node.type === 'leaf') return [node.pane]
  return [...collectPanes(node.first), ...collectPanes(node.second)]
}

export function splitPane(node: PaneNode, targetPaneId: string, pane: PaneSpec, direction: 'row' | 'column'): PaneNode {
  if (node.type === 'leaf') {
    if (node.pane.id !== targetPaneId) return node
    return {
      type: 'split',
      id: randomId(),
      direction,
      ratio: 0.5,
      first: node,
      second: { type: 'leaf', pane },
    }
  }
  return {
    ...node,
    first: splitPane(node.first, targetPaneId, pane, direction),
    second: splitPane(node.second, targetPaneId, pane, direction),
  }
}

export function removePane(node: PaneNode, paneId: string): PaneNode | null {
  if (node.type === 'leaf') return node.pane.id === paneId ? null : node
  const first = removePane(node.first, paneId)
  const second = removePane(node.second, paneId)
  if (!first && !second) return null
  if (!first) return second
  if (!second) return first
  return { ...node, first, second }
}

export function setSplitRatio(node: PaneNode, splitId: string, ratio: number): PaneNode {
  if (node.type === 'leaf') return node
  if (node.id === splitId) return { ...node, ratio }
  return {
    ...node,
    first: setSplitRatio(node.first, splitId, ratio),
    second: setSplitRatio(node.second, splitId, ratio),
  }
}


export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface PaneLayout {
  pane: PaneSpec
  rect: Rect
}

export interface DividerLayout {
  splitId: string
  direction: 'row' | 'column'
  ratio: number
  rect: Rect
}

export function layoutPanes(
  node: PaneNode,
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 },
  panes: PaneLayout[] = [],
  dividers: DividerLayout[] = [],
): { panes: PaneLayout[]; dividers: DividerLayout[] } {
  if (node.type === 'leaf') {
    panes.push({ pane: node.pane, rect })
    return { panes, dividers }
  }
  if (node.direction === 'row') {
    const w = rect.w * node.ratio
    dividers.push({
      splitId: node.id,
      direction: 'row',
      ratio: node.ratio,
      rect: { x: rect.x + w, y: rect.y, w: 0, h: rect.h },
    })
    layoutPanes(node.first, { x: rect.x, y: rect.y, w, h: rect.h }, panes, dividers)
    layoutPanes(node.second, { x: rect.x + w, y: rect.y, w: rect.w - w, h: rect.h }, panes, dividers)
  } else {
    const h = rect.h * node.ratio
    dividers.push({
      splitId: node.id,
      direction: 'column',
      ratio: node.ratio,
      rect: { x: rect.x, y: rect.y + h, w: rect.w, h: 0 },
    })
    layoutPanes(node.first, { x: rect.x, y: rect.y, w: rect.w, h }, panes, dividers)
    layoutPanes(node.second, { x: rect.x, y: rect.y + h, w: rect.w, h: rect.h - h }, panes, dividers)
  }
  return { panes, dividers }
}
