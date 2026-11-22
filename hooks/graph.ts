// Reines Rechnen ohne $: Git-Ausgaben lesen, Gleise verteilen, den Gleisplan als SVG zeichnen.
// Dadurch lässt sich diese Datei auch außerhalb von Claude Code prüfen.
import type { GleisCommit, GleisRef, GleisWorktree } from '../types'
import type { Texts } from './i18n'

const US = '\x1f'
const RS = '\x1e'

/** Format für git log: Hash, Eltern, Zeiger, Betreff, Autor, Zeit */
export const LOG_FORMAT = '%H%x1f%P%x1f%D%x1f%s%x1f%an%x1f%ct%x1e'

const clean = (s: string) => s.replace(/[\x00-\x1f\x7f]/g, ' ')

export function parseLog(stdout: string): GleisCommit[] {
  return stdout
    .split(RS)
    .map(s => s.replace(/^\s+/, ''))
    .filter(Boolean)
    .map(rec => {
      const [hash = '', parents = '', deco = '', subject = '', author = '', time = '0'] = rec.split(US)
      return {
        hash: hash.trim(),
        parents: parents.split(' ').filter(Boolean),
        refs: parseDecoration(deco),
        subject: clean(subject),
        author: clean(author),
        time: Number(time.trim()) || 0,
      }
    })
    .filter(c => c.hash.length > 0)
}

const ref = (kind: GleisRef['kind'], name: string, isCurrent = false): GleisRef => ({
  kind,
  name,
  isCurrent,
  isSynced: false,
  inWorktree: false,
})

/** Liest %D mit --decorate=full, z. B. "HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1" */
export function parseDecoration(deco: string): GleisRef[] {
  const refs: GleisRef[] = []
  const add = (full: string, isCurrent: boolean) => {
    const r = full.startsWith('tag: ') ? full.slice(5) : full
    if (r.startsWith('refs/heads/')) refs.push(ref('local', r.slice(11), isCurrent))
    else if (r.startsWith('refs/remotes/')) {
      const name = r.slice(13)
      if (!name.endsWith('/HEAD')) refs.push(ref('remote', name))
    } else if (r.startsWith('refs/tags/')) refs.push(ref('tag', r.slice(10)))
  }
  for (const raw of deco.split(',').map(s => s.trim()).filter(Boolean)) {
    if (raw.startsWith('HEAD -> ')) add(raw.slice(8), true)
    else if (raw === 'HEAD') refs.push(ref('detached', 'HEAD', true))
    else add(raw, false)
  }
  // Lokaler Zweig und gleichnamiger GitHub-Zweig auf demselben Stand: ein Schild mit Wolke
  for (const local of refs.filter(r => r.kind === 'local')) {
    const i = refs.findIndex(r => r.kind === 'remote' && r.name.split('/').slice(1).join('/') === local.name)
    if (i >= 0) {
      local.isSynced = true
      refs.splice(i, 1)
    }
  }
  return sortRefs(refs)
}

const ORDER = { detached: 0, local: 1, remote: 2, worktree: 3, tag: 4 }
const sortRefs = (refs: GleisRef[]) =>
  refs.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || ORDER[a.kind] - ORDER[b.kind])

export type Status = {
  oid: string | null
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  changed: number
  untracked: number
  conflicts: number
}

/** Liest git status --porcelain=v2 --branch */
export function parseStatus(out: string): Status {
  const s: Status = { oid: null, branch: null, upstream: null, ahead: 0, behind: 0, changed: 0, untracked: 0, conflicts: 0 }
  for (const raw of out.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('# branch.oid ')) {
      const v = line.slice(13).trim()
      s.oid = v === '(initial)' ? null : v
    } else if (line.startsWith('# branch.head ')) {
      const v = line.slice(14).trim()
      s.branch = v === '(detached)' ? null : v
    } else if (line.startsWith('# branch.upstream ')) {
      s.upstream = line.slice(18).trim()
    } else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      if (m) {
        s.ahead = Number(m[1])
        s.behind = Number(m[2])
      }
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) s.changed++
    else if (line.startsWith('u ')) s.conflicts++
    else if (line.startsWith('? ')) s.untracked++
  }
  return s
}

export const samePath = (a: string, b: string) => {
  const n = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return n(a) === n(b)
}

export const baseName = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || p

/** Liest git worktree list --porcelain */
export function parseWorktrees(out: string, here: string): GleisWorktree[] {
  const list: GleisWorktree[] = []
  for (const block of out.replace(/\r/g, '').split('\n\n')) {
    let path = ''
    let head = ''
    let branch: string | null = null
    let bare = false
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice(9)
      else if (line.startsWith('HEAD ')) head = line.slice(5)
      else if (line.startsWith('branch ')) branch = line.slice(7).replace(/^refs\/heads\//, '')
      else if (line === 'bare') bare = true
    }
    if (!path) continue
    if (!bare) list.push({ path, head, branch, isMain: list.length === 0, isHere: samePath(path, here) })
  }
  return list
}

/**
 * Zeigt an den Speicherständen, wo die anderen Arbeitsverzeichnisse stehen.
 * Gehört ein Verzeichnis sichtbar zu einem Zweig am selben Stand, bekommt der Zweig
 * ein 📂, sonst gibt es ein eigenes Schild.
 */
export function addWorktreeRefs(commits: GleisCommit[], worktrees: GleisWorktree[]): GleisCommit[] {
  const others = worktrees.filter(w => !w.isHere)
  if (others.length === 0) return commits
  return commits.map(c => {
    const here = others.filter(w => w.head === c.hash)
    if (here.length === 0) return c
    const refs = c.refs.map(r => ({ ...r }))
    for (const w of here) {
      const name = baseName(w.path)
      const local = refs.find(
        r => r.kind === 'local' && (r.name === w.branch || r.name === name || r.name.endsWith(`/${name}`)),
      )
      if (local) local.inWorktree = true
      else refs.push({ ...ref('worktree', name) })
    }
    return { ...c, refs: sortRefs(refs) }
  })
}

/** Wählt den Hauptzweig: main, sonst master, sonst der aktuelle Zweig, sonst der erste */
export function pickMainBranch(branches: string[], remoteRefs: string[], current: string | null): string | null {
  for (const name of ['main', 'master']) {
    if (branches.includes(name) || remoteRefs.includes(`origin/${name}`)) return name
  }
  return current ?? branches[0] ?? null
}

/**
 * Der Speicherstand, an dem der Hauptzweig steht: lokal, sonst in der GitHub-Ablage, sonst HEAD.
 * Mit `preferRemote` (lokal nur zurück, nicht abgewichen) beginnt das Hauptgleis beim GitHub-Stand,
 * damit noch nicht abgeholte Speicherstände oben auf dem Hauptgleis liegen.
 */
export function findMainTip(
  commits: GleisCommit[],
  mainBranch: string | null,
  head: string | null,
  preferRemote = false,
): string | null {
  if (mainBranch) {
    const local = commits.find(c => c.refs.some(r => r.kind === 'local' && r.name === mainBranch))
    const remote = commits.find(c => c.refs.some(r => r.kind === 'remote' && r.name === `origin/${mainBranch}`))
    if (preferRemote && remote) return remote.hash
    if (local) return local.hash
    if (remote) return remote.hash
  }
  return head ?? commits[0]?.hash ?? null
}

// ---------------------------------------------------------------- Gleise

/** Eine Verbindung von (from, row) nach (to, row + 1) */
export type Line = { row: number; from: number; to: number; color: number }

export type Layout = {
  /** Gleis je Speicherstand */
  cols: number[]
  /** Farbe je Speicherstand (0 = Hauptgleis) */
  colors: number[]
  /** Kennung des Zweig-Gleises je Speicherstand (0 = Hauptzweig) */
  ids: number[]
  /** Wie viele Nachfolger jeder Speicherstand im gezeigten Ausschnitt hat */
  children: number[]
  lines: Line[]
  /** Gleise, die unter dem letzten gezeigten Speicherstand weiterlaufen */
  tails: Line[]
  /** Breite in Gleisen */
  lanes: number
}

const sideColor = (n: number) => 1 + ((n - 1) % 7)
export const colorOfId = (id: number) => (id === 0 ? 0 : sideColor(id))

/**
 * Verteilt die Speicherstände (neueste zuerst, Kinder vor Eltern) auf Gleise.
 * Der Hauptzweig (erste Eltern ab `mainTip`) liegt immer auf Gleis 0, alle anderen
 * Zweige bekommen Nebengleise daneben.
 */
export function layout(commits: GleisCommit[], mainTip: string | null): Layout {
  const index = new Map(commits.map((c, i) => [c.hash, i]))
  const main = new Set<string>()
  let h: string | null = mainTip
  while (h && index.has(h) && !main.has(h)) {
    main.add(h)
    h = commits[index.get(h)!]!.parents[0] ?? null
  }
  const reserve = main.size > 0 ? 1 : 0

  const childCount = new Map<string, number>()
  for (const c of commits) for (const p of c.parents) childCount.set(p, (childCount.get(p) ?? 0) + 1)

  type Lane = { hash: string; id: number } | null
  const lanes: Lane[] = reserve ? [null] : []
  const cols: number[] = []
  const colors: number[] = []
  const ids: number[] = []
  const lines: Line[] = []
  let pending: Line[] = []
  let nextSide = 1
  let width = reserve
  const free = () => {
    for (let i = reserve; i < lanes.length; i++) if (!lanes[i]) return i
    return Math.max(lanes.length, reserve)
  }

  commits.forEach((c, row) => {
    const hits: number[] = []
    lanes.forEach((l, k) => {
      if (l && l.hash === c.hash) hits.push(k)
    })
    let col: number
    let id: number
    if (main.has(c.hash)) {
      col = 0
      id = 0
    } else if (hits.length > 0) {
      col = hits[0]!
      id = lanes[col]!.id
    } else {
      col = free()
      id = nextSide++
    }
    const color = colorOfId(id)
    // Gleise, die auf diesen Stand gewartet haben, laufen hier zusammen
    for (const ln of pending) if (hits.includes(ln.to)) ln.to = col
    lines.push(...pending)
    for (const k of hits) lanes[k] = null
    cols.push(col)
    colors.push(color)
    ids.push(id)

    const next: Line[] = []
    lanes.forEach((l, k) => {
      if (l) next.push({ row, from: k, to: k, color: colorOfId(l.id) })
    })
    c.parents.forEach((p, i) => {
      if (i === 0) {
        lanes[col] = { hash: p, id }
        next.push({ row, from: col, to: col, color })
        return
      }
      const k = lanes.findIndex(l => l?.hash === p)
      if (k >= 0) {
        next.push({ row, from: col, to: k, color: colorOfId(lanes[k]!.id) })
        return
      }
      const n = free()
      // Holt ein Seitenzweig den Hauptzweig herein, behält das Hilfsgleis die Farbe des Seitenzweigs
      const lane = { hash: p, id: main.has(p) && id !== 0 ? id : nextSide++ }
      lanes[n] = lane
      next.push({ row, from: col, to: n, color: colorOfId(lane.id) })
    })
    pending = next
    width = Math.max(width, lanes.length, col + 1)
    while (lanes.length > reserve && lanes[lanes.length - 1] === null) lanes.pop()
  })

  return {
    cols,
    colors,
    ids,
    children: commits.map(c => childCount.get(c.hash) ?? 0),
    lines,
    tails: pending,
    lanes: width,
  }
}

/** Liest aus „Merge branch 'x' into y“ oder „Merge pull request #2 from a/x“, welcher Zweig wohin kam */
export function parseMergeSubject(s: string): { from: string; into: string | null } | null {
  let m = /^Merge (?:remote-tracking )?branch '([^']+)'(?: of \S+)?(?: into '?([^'\s]+)'?)?/.exec(s)
  if (m) return { from: m[1]!.replace(/^origin\//, ''), into: m[2] ?? null }
  m = /^Merge pull request #\d+ from [^/\s]+\/(\S+)/.exec(s)
  if (m) return { from: m[1]!, into: null }
  return null
}

/** Name und Zustand eines Gleises (Zweigs) im gezeigten Ausschnitt */
export type LaneInfo = {
  id: number
  color: number
  /** Zweigname; leer, wenn er sich nicht ermitteln lässt */
  name: string
  /** Läuft das Gleis oben in einen anderen Zweig zurück? */
  merged: boolean
  /** Oberste (neueste) Zeile des Gleises */
  top: number
}

/** Benennt jedes Gleis: nach dem Zweig an seiner Spitze, sonst nach dem Text der Zusammenführung */
export function laneInfos(commits: GleisCommit[], lay: Layout, mainBranch: string | null, t: Texts): Map<number, LaneInfo> {
  const index = new Map(commits.map((c, i) => [c.hash, i]))
  const infos = new Map<number, LaneInfo>()
  commits.forEach((c, r) => {
    const id = lay.ids[r] ?? 0
    let info = infos.get(id)
    if (!info) {
      info = { id, color: colorOfId(id), name: id === 0 ? (mainBranch ?? '') : '', merged: (lay.children[r] ?? 0) > 0, top: r }
      infos.set(id, info)
      if (id !== 0) {
        const local = c.refs.find(x => x.kind === 'local')
        const remote = c.refs.find(x => x.kind === 'remote')
        info.name = local?.name ?? remote?.name.replace(/^origin\//, '') ?? ''
      }
    }
  })
  commits.forEach((c, r) => {
    if (c.parents.length < 2) return
    const m = parseMergeSubject(c.subject)
    if (!m) return
    const own = infos.get(lay.ids[r] ?? 0)
    if (own && !own.name && m.into) own.name = m.into
    const pr = index.get(c.parents[1]!)
    const other = pr === undefined ? undefined : infos.get(lay.ids[pr] ?? 0)
    // „Merge branch 'main' into x“ auf einem Nebengleis: das ist eine frühere Linie des Hauptzweigs
    if (other && !other.name) other.name = m.from === mainBranch && other.id !== 0 ? t.formerLine(m.from) : m.from
  })
  return infos
}

/** Die Zeichen neben den Haltepunkten */
export type IconKind = 'merge' | 'branch' | 'work' | 'push' | 'pull'

/** Ein Zeichen mit Erklärung neben einem Haltepunkt; color ist eine Farbe (#rrggbb) */
export type RowEvent = { icon: IconKind; color: string; text: string }

/** Farben der Zeichen: Bernstein = hier ist noch etwas zu tun, Blau = wartet bei GitHub */
export const ICON_AMBER = '#d9901a'
export const ICON_BLUE = '#3b8eea'
export const ICON_GREY = '#8b949e'

/** Ersatz für Oberflächen ohne Grafik (Terminal) */
export const ICON_TEXT: Record<IconKind, string> = { merge: '⤵', branch: '⤴', work: '🔧', push: '✉', pull: '🔄' }

/**
 * Zeichen als kleine Grafik (24×24):
 * merge = zwei Pfeilschwänze verschmelzen zu einem Pfeil nach oben,
 * branch = ein gemeinsamer Anfang teilt sich in zwei Pfeile nach oben,
 * work = Schraubenschlüssel (in Arbeit), push = geschlossener Briefumschlag,
 * pull = Aktualisieren (zwei Halbkreis-Pfeile): neuerer Stand bei GitHub.
 */
export function iconSvg(kind: IconKind, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${iconBody(kind, color)}</svg>`
}

/** Das Innere eines Zeichens (Raster 24×24), auch zum Einbetten in größere Grafiken */
export function iconBody(kind: IconKind, color: string): string {
  const line =`fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"`
  let body = ''
  switch (kind) {
    case 'merge':
      body =
        `<path ${line} d="M5 22 C5 16 12 16 12 11 M19 22 C19 16 12 16 12 11 M12 11 V4"/>` +
        `<path ${line} d="M7 8.5 L12 3.5 L17 8.5"/>`
      break
    case 'branch':
      body =
        `<path ${line} d="M12 22 V15 C12 11 6 11 6 5 M12 15 C12 11 18 11 18 5"/>` +
        `<path ${line} d="M2.8 8 L6 4 L9.2 8 M14.8 8 L18 4 L21.2 8"/>`
      break
    case 'work':
      body =
        // Maul weit offen (100°), gerade Kanten, damit es auch klein nicht wie eine Nadel aussieht
        `<path fill="none" stroke="${color}" stroke-width="3.4" stroke-linecap="butt" d="M20.58 8.84 A5 5 0 1 1 15.16 3.42"/>` +
        `<path fill="none" stroke="${color}" stroke-width="3.8" stroke-linecap="round" d="M12.06 11.94 L3.6 20.4"/>`
      break
    case 'push':
      body =
        `<rect x="2.5" y="5.5" width="19" height="13.5" rx="2" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2.2"/>` +
        `<path fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" d="M3.2 6.5 L12 13.2 L20.8 6.5"/>`
      break
    case 'pull':
      // Aktualisieren: zwei Halbkreis-Pfeile
      body =
        `<path fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" d="M4.61 10.7 A7.5 7.5 0 0 1 19.24 10.06 M19.39 13.3 A7.5 7.5 0 0 1 4.76 13.94"/>` +
        `<path fill="${color}" d="M20.07 13.15 L22.01 8.8 L16.21 10.36 Z M3.93 10.85 L1.99 15.2 L7.79 13.64 Z"/>`
      break
  }
  return body
}

/** Für Text und Zeichen: kräftige Mitteltöne, auf hellem und dunklem Grund lesbar */
export const LANE_TEXT = ['#4d7cf0', '#e0782f', '#2f9e63', '#9a6ae0', '#1fa3ae', '#e0554c', '#b3a12a', '#d4589c']
export const laneText = (color: number) => LANE_TEXT[color % LANE_TEXT.length]!

/** Was an einem Speicherstand passiert ist oder fehlt: zusammengeführt, abgezweigt, hochladen/abholen fehlt */
export function rowEvents(
  commits: GleisCommit[],
  lay: Layout,
  infos: Map<number, LaneInfo>,
  unpushed: Set<string>,
  unpulled: Set<string>,
  t: Texts,
): RowEvent[][] {
  const index = new Map(commits.map((c, i) => [c.hash, i]))
  // Ein Zweig beginnt dort, wo ein Nachfolger über seine erste Elternverbindung weitergeht;
  // die zweite Elternverbindung ist eine Zusammenführung, kein Abzweig.
  const childRows = new Map<number, number[]>()
  commits.forEach((c, r) => {
    const pr = c.parents[0] === undefined ? undefined : index.get(c.parents[0])
    if (pr !== undefined) childRows.set(pr, [...(childRows.get(pr) ?? []), r])
  })
  const nameOf = (id: number) => {
    const n = infos.get(id)?.name
    return n ? t.quoted(n) : id === 0 ? t.theMain : t.unnamedBranch
  }
  return commits.map((c, r) => {
    const out: RowEvent[] = []
    const id = lay.ids[r] ?? 0
    if (c.parents.length > 1) {
      const pr = index.get(c.parents[1]!)
      const from = pr === undefined ? t.otherBranch : nameOf(lay.ids[pr] ?? 0)
      out.push({
        icon: 'merge',
        color: laneText(pr === undefined ? 1 : (lay.colors[pr] ?? 1)),
        text: t.mergeTip(from, nameOf(id)),
      })
    }
    const branchedIds = [...new Set((childRows.get(r) ?? []).map(k => lay.ids[k] ?? 0))].filter(x => x !== id)
    if (branchedIds.length > 0) {
      out.push({
        icon: 'branch',
        color: laneText(colorOfId(branchedIds[0]!)),
        text: t.branchTip(branchedIds.map(nameOf)),
      })
    }
    if (unpushed.has(c.hash)) {
      out.push({
        icon: 'push',
        color: ICON_AMBER,
        text: t.pushTip,
      })
    }
    if (unpulled.has(c.hash)) {
      out.push({
        icon: 'pull',
        color: ICON_BLUE,
        text: t.pullTip,
      })
    }
    return out
  })
}

/** Eine Zeile des Plans: ein Haltepunkt oder eine zusammengefasste gerade Strecke */
export type PlanRow =
  | { kind: 'commit'; row: number }
  | { kind: 'gap'; first: number; last: number; count: number; lanes: number[] }

/**
 * Fasst gerade Strecken zusammen: Speicherstände ohne Schild, ohne Abzweig, ohne
 * Zusammenführung und ohne offenes Hochladen/Abholen werden zu „… n Speicherstände“.
 */
export function planRows(
  commits: GleisCommit[],
  lay: Layout,
  compact: boolean,
  head: string | null,
  keep: Set<string> = new Set(),
): PlanRow[] {
  const n = commits.length
  const isStop = (i: number) => {
    const c = commits[i]!
    return (
      !compact ||
      i === 0 ||
      i === n - 1 ||
      c.hash === head ||
      keep.has(c.hash) ||
      c.refs.length > 0 ||
      c.parents.length !== 1 ||
      lay.children[i] !== 1
    )
  }
  const rows: PlanRow[] = []
  let i = 0
  while (i < n) {
    if (isStop(i)) {
      rows.push({ kind: 'commit', row: i })
      i++
      continue
    }
    let j = i
    while (j + 1 < n && !isStop(j + 1)) j++
    const lanes = [...new Set(lay.cols.slice(i, j + 1))]
    rows.push({ kind: 'gap', first: i, last: j, count: j - i + 1, lanes })
    i = j + 1
  }
  return rows
}

// ---------------------------------------------------------------- Zeichnen

/** Gleisfarben hell/dunkel; 0 = Hauptgleis (wie auf der Seite „Projekt-Gleisplan“) */
const PALETTE: [string, string][] = [
  ['#2449a6', '#88a7ff'],
  ['#c0561a', '#f09a5c'],
  ['#22784a', '#62c891'],
  ['#7b4bc4', '#b58cf0'],
  ['#0f7c86', '#4fc3cf'],
  ['#b3261e', '#f2857c'],
  ['#7a6a00', '#d6c25a'],
  ['#b0367a', '#ef8cc4'],
]

/** Schildfarbe eines Gleises für Text-Schilder (dunkel genug für weiße Schrift) */
export const laneChip = (color: number) => PALETTE[color % PALETTE.length]![0]

/** "vor 5 Min.", "gestern", "12.10.26" */
export function ago(time: number, now: number, t: Texts): string {
  const s = Math.max(0, Math.floor(now / 1000) - time)
  if (s < 60) return t.ago.now
  if (s < 3600) return t.ago.min(Math.floor(s / 60))
  if (s < 86400) return t.ago.hours(Math.floor(s / 3600))
  if (s < 2 * 86400) return t.ago.yesterday
  if (s < 14 * 86400) return t.ago.days(Math.floor(s / 86400))
  const d = new Date(time * 1000)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`
}

export function fullDate(time: number): string {
  const d = new Date(time * 1000)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`
}

export function refText(r: GleisRef, t: Texts): string {
  switch (r.kind) {
    case 'local':
      return t.refLocal(r.name, r.isCurrent, r.isSynced)
    case 'remote':
      return t.refRemote(r.name)
    case 'tag':
      return t.refTag(r.name)
    case 'detached':
      return t.refDetached
    case 'worktree':
      return t.refWorktree(r.name)
  }
}

/** Liest git show --stat: geänderte Dateien und eine deutsche Zusammenfassung */
export function parseStat(out: string, t: Texts): { files: string[]; summary: string } {
  const files: string[] = []
  let summary = ''
  for (const raw of out.replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) continue
    const bar = raw.lastIndexOf('|')
    if (bar > 0) {
      const path = raw.slice(0, bar).trim()
      const amount = raw.slice(bar + 1).trim().split(/\s+/)[0] ?? ''
      files.push(amount === 'Bin' ? `${path} (${t.binary})` : `${path} (${amount})`)
      continue
    }
    const m = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(raw)
    if (m) summary = t.stat(Number(m[1]), m[2] ?? '0', m[3] ?? '0')
  }
  const more = files.length - 12
  return { files: files.slice(0, 12), summary: more > 0 ? `${summary} · ${t.moreFiles(more)}` : summary }
}

/** Kürzt einen Text auf höchstens `max` Zeichen */
export function shorten(s: string, max: number): string {
  const chars = [...s]
  if (chars.length <= max) return s
  return max <= 1 ? '' : chars.slice(0, max - 1).join('') + '…'
}

/** Eine Zeile des Plans mit ihrem Gleisstück als kleine SVG-Grafik */
export type SliceRow =
  | { kind: 'work'; svg: string; height: number }
  | { kind: 'commit'; row: number; svg: string; height: number; sidings: GleisRef[] }
  | { kind: 'gap'; first: number; last: number; count: number; svg: string; height: number }
  | { kind: 'tail'; svg: string; height: number }

export type SliceOptions = {
  head: string | null
  mainBranch: string | null
  compact: boolean
  /** Zweige, die noch nicht im Hauptzweig stecken */
  unmerged: string[]
  /** Angeklickter Speicherstand */
  selected: string | null
  /** Nur auf diesem PC festgehalten (noch nicht hochgeladen) */
  unpushed: Set<string>
  /** Nur bei GitHub (noch nicht abgeholt) */
  unpulled: Set<string>
  /** Im Ordner gibt es Änderungen, die noch nicht festgehalten sind */
  dirty: boolean
}

export type SlicePlan = { rows: SliceRow[]; width: number }

export const ROW_H = 36
const WORK_H = 32
const GAP_H = 30
const DOT_H = 14
const TAIL_H = 16

type Pt = [number, number]

/** Der Teil eines Gleises zwischen den Höhen y0 und y1 */
function clip(pts: Pt[], y0: number, y1: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i]!
    const [bx, by] = pts[i + 1]!
    const lo = Math.max(ay, y0)
    const hi = Math.min(by, y1)
    if (hi < lo) continue
    const at = (y: number): Pt => (by === ay ? [ax, y] : [ax + ((bx - ax) * (y - ay)) / (by - ay), y])
    const p = at(lo)
    const last = out[out.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
    out.push(at(hi))
  }
  return out
}

const CSS = [
  '.t{fill:none;stroke-linejoin:round}.st{fill:#ffffff}.ink{fill:#15212c}.ki{stroke:#15212c}.kw{stroke:#b07800}',
  ...PALETTE.map(([l], i) => `.k${i}{stroke:${l}}.f${i}{fill:${l}}`),
  '@media (prefers-color-scheme: dark){.st{fill:#1f2328}.ink{fill:#e4eaf0}.ki{stroke:#e4eaf0}.kw{stroke:#e5b74c}',
  ...PALETTE.map(([, d], i) => `.k${i}{stroke:${d}}.f${i}{fill:${d}}`),
  '}',
].join('')

/**
 * Zerlegt den Gleisplan in Zeilen: je Haltepunkt (oder zusammengefasster Strecke)
 * ein Gleisstück als SVG, das genau an die Stücke darüber und darunter anschließt.
 * Schrägen liegen immer ganz innerhalb einer Zeile, damit an den Zeilengrenzen
 * nur senkrechte Gleise aufeinandertreffen und keine Lücken sichtbar werden.
 * Der Text der Zeile kommt nicht in die Grafik, er wird daneben als echter,
 * anklickbarer Text gezeichnet.
 */
export function planSlices(commits: GleisCommit[], lay: Layout, opt: SliceOptions): SlicePlan {
  const PAD = 18
  const keep = new Set([...opt.unpushed, ...opt.unpulled].filter(h => commits.some(c => c.hash === h)))
  const rows = planRows(commits, lay, opt.compact, opt.head, keep)
  const byRow = new Map<number, Line[]>()
  for (const ln of lay.lines) byRow.set(ln.row, [...(byRow.get(ln.row) ?? []), ln])

  // Abstellgleise: Zweige oder Arbeitsverzeichnisse mitten auf einem Gleis (ohne eigene Speicherstände)
  const laneFree = (r: number, lane: number) =>
    ![...(byRow.get(r - 1) ?? []), ...(byRow.get(r) ?? [])].some(l => l.from === lane || l.to === lane)
  const ownBranch = (r: number) => {
    const col = lay.cols[r] ?? 0
    if (col === 0) return opt.mainBranch
    return commits[r]!.refs.find(x => x.kind === 'local')?.name ?? null
  }
  const sidings = new Map<number, GleisRef[]>()
  let widest = Math.max(1, lay.lanes)
  for (const pr of rows) {
    if (pr.kind !== 'commit') continue
    const r = pr.row
    const own = ownBranch(r)
    const list = commits[r]!.refs.filter(x => (x.kind === 'local' && x.name !== own) || x.kind === 'worktree')
    const lane = (lay.cols[r] ?? 0) + 1
    if (list.length > 0 && laneFree(r, lane)) {
      sidings.set(r, list)
      widest = Math.max(widest, lane + 1)
    }
  }

  const laneW = widest <= 4 ? 22 : widest <= 8 ? 17 : 12
  const x = (col: number) => PAD + col * laneW
  const W = PAD * 2 + (widest - 1) * laneW

  const heights = rows.map(pr => (pr.kind === 'commit' ? ROW_H : pr.count === 1 ? DOT_H : GAP_H))
  const tops: number[] = []
  let acc = 0
  for (const h of heights) {
    tops.push(acc)
    acc += h
  }
  const center = (i: number) => tops[i]! + heights[i]! / 2
  const lastOf = (pr: PlanRow) => (pr.kind === 'commit' ? pr.row : pr.last)

  // Alle Gleisverbindungen zwischen zwei Planzeilen, in Gesamtkoordinaten
  type Seg = { pts: Pt[]; color: number }
  const segs: Seg[] = []
  rows.forEach((pr, i) => {
    if (i + 1 >= rows.length) return
    const station = pr.kind === 'commit' ? (lay.cols[pr.row] ?? 0) : -1
    for (const ln of byRow.get(lastOf(pr)) ?? []) {
      const x1 = x(ln.from)
      const x2 = x(ln.to)
      const y1 = center(i)
      const y2 = center(i + 1)
      let pts: Pt[]
      if (x1 === x2) pts = [
        [x1, y1],
        [x2, y2],
      ]
      else if (ln.from === station) {
        // Verlässt den Haltepunkt: Schräge in dessen unterer Hälfte
        const yb = y1 + heights[i]! / 2 - 3
        pts = [
          [x1, y1],
          [x2, yb],
          [x2, y2],
        ]
      } else {
        // Läuft in den nächsten Haltepunkt: Schräge in dessen oberer Hälfte
        const ya = y2 - heights[i + 1]! / 2 + 3
        pts = [
          [x1, y1],
          [x1, ya],
          [x2, y2],
        ]
      }
      segs.push({ pts, color: ln.color })
    }
  })
  segs.sort((a, b) => Number(a.color === 0) - Number(b.color === 0))

  const svgOf = (h: number, body: string[]) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}"><style>${CSS}</style>${body.join('')}</svg>`
  const pathOf = (pts: Pt[], dy: number) =>
    pts.map(([px, py], k) => `${k === 0 ? 'M' : 'L'}${px.toFixed(1)} ${(py - dy).toFixed(1)}`).join('')
  const width = (color: number) => (color === 0 ? 6 : 4.5)
  const buffer = (bx: number, by: number) => `<rect class="ink" x="${bx - 7}" y="${by - 2.5}" width="14" height="5" rx="1"/>`

  const headRow = commits.findIndex(c => c.hash === opt.head)
  const headCol = headRow >= 0 ? (lay.cols[headRow] ?? 0) : 0
  const headOnTop = rows[0]?.kind === 'commit' && rows[0].row === headRow

  const out: SliceRow[] = rows.map((pr, i) => {
    const top = tops[i]!
    const h = heights[i]!
    const cy = h / 2
    const body: string[] = []
    for (const s of segs) {
      const part = clip(s.pts, top, top + h)
      if (part.length >= 2) body.push(`<path class="t k${s.color}" stroke-width="${width(s.color)}" d="${pathOf(part, top)}"/>`)
    }

    if (pr.kind === 'gap') {
      const dots = pr.count === 1 ? [0] : [-6, 0, 6]
      for (const lane of pr.lanes) for (const d of dots) body.push(`<circle class="st" cx="${x(lane)}" cy="${cy + d}" r="1.6"/>`)
      return { kind: 'gap', first: pr.first, last: pr.last, count: pr.count, svg: svgOf(h, body), height: h }
    }

    const r = pr.row
    const c = commits[r]!
    const col = lay.cols[r] ?? 0
    const color = lay.colors[r] ?? 0
    const cx = x(col)
    // Gestrichelte Verbindung von „noch nicht festgehalten“ oben herunter zum aktuellen Stand
    if (i === 0 && opt.dirty && headOnTop) {
      body.push(`<path class="t kw" stroke-width="3" stroke-dasharray="3 3" d="M${cx} 0V${cy}"/>`)
    }
    const list = sidings.get(r) ?? []
    if (list.length > 0) {
      // Steckt der Zweig schon im Hauptzweig: gestrichelter Stummel ohne Prellbock
      const open = list.some(x2 => x2.kind === 'local' && opt.unmerged.includes(x2.name))
      const sx = x(col + 1)
      body.push(
        `<path class="t k1" stroke-width="3.5" stroke-linecap="round"${open ? '' : ' stroke-dasharray="3 3"'} d="M${cx} ${cy}L${sx} ${cy - laneW * 0.55}V${cy - 12}"/>`,
        open ? buffer(sx, cy - 13) : `<circle class="st k1" cx="${sx}" cy="${cy - 12}" r="2.5" stroke-width="2"/>`,
      )
    }
    if (col !== 0 && lay.children[r] === 0) {
      body.push(`<path class="t k${color}" stroke-width="4.5" d="M${cx} ${cy}V${cy - 12}"/>`, buffer(cx, cy - 13))
    }
    if (c.hash === opt.selected) body.push(`<circle class="t ki" cx="${cx}" cy="${cy}" r="12.5" stroke-width="2"/>`)
    // Gestrichelter Ring = nur auf diesem PC, gepunkteter Ring = nur bei GitHub
    const dash = opt.unpushed.has(c.hash) ? ' stroke-dasharray="3.2 2.4"' : opt.unpulled.has(c.hash) ? ' stroke-dasharray="1.2 2.4"' : ''
    if (c.hash === opt.head) {
      body.push(
        `<circle class="st ki" cx="${cx}" cy="${cy}" r="9" stroke-width="4"${dash}/>`,
        `<circle class="f${color}" cx="${cx}" cy="${cy}" r="3.5"/>`,
      )
    } else {
      body.push(
        `<circle class="st k${color}" cx="${cx}" cy="${cy}" r="${c.parents.length > 1 ? 6.5 : 5.5}" stroke-width="3.2"${dash}/>`,
      )
    }
    return { kind: 'commit', row: r, svg: svgOf(h, body), height: h, sidings: list }
  })

  if (opt.dirty && rows.length > 0) {
    // Oberste Zeile: was im Ordner geändert, aber noch nicht festgehalten ist
    const cx = x(headCol)
    const cy = WORK_H / 2
    const body = [
      headOnTop ? `<path class="t kw" stroke-width="3" stroke-dasharray="3 3" d="M${cx} ${cy}V${WORK_H}"/>` : '',
      `<circle class="st kw" cx="${cx}" cy="${cy}" r="7" stroke-width="3" stroke-dasharray="3 2.4"/>`,
    ]
    out.unshift({ kind: 'work', svg: svgOf(WORK_H, body), height: WORK_H })
  }

  if (lay.tails.length > 0 && rows.length > 0) {
    const body = lay.tails.map(
      ln =>
        `<path class="t k${ln.color}" stroke-width="${width(ln.color)}" stroke-linecap="round" stroke-dasharray="1 6" d="M${x(ln.from)} 0V${TAIL_H}"/>`,
    )
    out.push({ kind: 'tail', svg: svgOf(TAIL_H, body), height: TAIL_H })
  }
  return { rows: out, width: W }
}
