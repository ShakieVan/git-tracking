/**
 * Drei-Ebenen-Ansicht: GitHub | Ablage auf dem PC | Ordner, Zeit nach oben.
 * Grundlage ist das Git-Tagebuch (reflog): Es hält fest, wann festgehalten,
 * hochgeladen, abgeholt, umgeschaltet oder zurückgesetzt wurde – auf diesem PC,
 * meist für die letzten etwa 90 Tage. Reine Logik, kein `$`.
 */
import type { DiaryEntry, DiaryFolder, DiaryMerge, DiaryTrack, GleisDiary } from '../types'
import { iconBody, parseMergeSubject } from './graph'
import type { IconKind } from './graph'
import type { Texts } from './i18n'

// ---------------------------------------------------------------- Einlesen

/** Liest `git log -g --date=unix --format=%gD%x1f%H%x1f%gs`; HEAD gehört zum Ordner `headRef` */
export function parseDiary(stdout: string, headRef: string): DiaryEntry[] {
  const out: DiaryEntry[] = []
  for (const line of stdout.replace(/\r/g, '').split('\n')) {
    const [sel, hash, msg] = line.split('\x1f')
    if (!sel || !hash || msg === undefined) continue
    const m = /^(.*)@\{(\d+)\}$/.exec(sel)
    if (!m) continue
    let ref = m[1]!
    if (ref === 'HEAD') ref = headRef
    else if (ref.startsWith('refs/heads/')) ref = `heads/${ref.slice(11)}`
    else if (ref.startsWith('refs/remotes/')) ref = `remotes/${ref.slice(13)}`
    else continue
    out.push({ ref, hash, time: Number(m[2]), msg })
  }
  return out
}

/** Liest `git for-each-ref --format=%(refname)%09%(objectname)%09%(upstream:short)%09%(upstream:track) refs/heads` */
export function parseTrack(stdout: string): DiaryTrack[] {
  const out: DiaryTrack[] = []
  for (const line of stdout.replace(/\r/g, '').split('\n')) {
    if (!line.trim()) continue
    const [ref, tip, upstream, track] = line.split('\t')
    const branch = ref?.replace(/^refs\/heads\//, '')
    if (!branch) continue
    const gone = /gone/.test(track ?? '')
    out.push({
      branch,
      tip: tip ?? '',
      upstream: upstream && !gone ? upstream : null,
      ahead: Number(/ahead (\d+)/.exec(track ?? '')?.[1] ?? 0),
      behind: Number(/behind (\d+)/.exec(track ?? '')?.[1] ?? 0),
    })
  }
  return out
}

/** Liest `git log --first-parent --merges --format=%H%x1f%P%x1f%ct%x1f%s <GitHub-Hauptzweig>` */
export function parseMerges(stdout: string): DiaryMerge[] {
  const out: DiaryMerge[] = []
  for (const line of stdout.replace(/\r/g, '').split('\n')) {
    const [hash, parents, time, subject] = line.split('\x1f')
    if (!hash || !parents || !time) continue
    out.push({ hash, parents: parents.split(' ').filter(Boolean), time: Number(time), subject: subject ?? '' })
  }
  return out
}

// ---------------------------------------------------------------- Ereignisse

export type EventKind =
  | 'commit'
  | 'amend'
  | 'merge'
  | 'pull'
  | 'checkout'
  | 'reset'
  | 'rebase'
  | 'create'
  | 'clone'
  | 'push'
  | 'fetch'
  /** Bei GitHub (Änderungsvorschlag) oder auf einem anderen Rechner zusammengeführt; erst nach dem Abholen bekannt */
  | 'remotemerge'
  | 'other'

type Classified = { kind: EventKind; subject: string; from?: string; to?: string; initial?: boolean }

/** Was ein Tagebuch-Eintrag bedeutet; null = überspringen (Zwischenschritte, Umbenennungen) */
export function classify(msg: string, isRemote: boolean): Classified | null {
  if (isRemote) {
    if (/^update by push/.test(msg)) return { kind: 'push', subject: '' }
    if (/^(fetch|pull)/.test(msg)) return { kind: 'fetch', subject: '' }
    if (/^clone/.test(msg)) return { kind: 'clone', subject: '' }
    return null
  }
  let r: RegExpExecArray | null
  if ((r = /^commit \(initial\): (.*)$/.exec(msg))) return { kind: 'commit', subject: r[1]!, initial: true }
  if ((r = /^commit \(amend\): (.*)$/.exec(msg))) return { kind: 'amend', subject: r[1]! }
  if ((r = /^commit(?: \([^)]*\))?: (.*)$/.exec(msg))) return { kind: 'commit', subject: r[1]! }
  if ((r = /^cherry-pick: (.*)$/.exec(msg))) return { kind: 'commit', subject: r[1]! }
  if ((r = /^merge (\S+): (.*)$/.exec(msg))) return { kind: 'merge', subject: r[2]!, from: r[1]! }
  if (/^pull\b.*\((start|pick|continue|abort)\)/.test(msg)) return null
  if ((r = /^pull\b[^:]*: (.*)$/.exec(msg))) return { kind: 'pull', subject: r[1]! }
  if ((r = /^checkout: moving from (\S+) to (\S+)/.exec(msg))) return { kind: 'checkout', subject: '', from: r[1]!, to: r[2]! }
  if ((r = /^reset: moving to (.+)$/.exec(msg))) return { kind: 'reset', subject: '', to: r[1]! }
  if (/^rebase\b.*\(finish\)/.test(msg)) return { kind: 'rebase', subject: '' }
  if (/^rebase/.test(msg)) return null
  if ((r = /^branch: Created from (.+)$/.exec(msg))) return { kind: 'create', subject: '', from: r[1]! }
  if (/^branch: renamed/i.test(msg)) return null
  if (/^clone/.test(msg)) return { kind: 'clone', subject: '' }
  return { kind: 'other', subject: msg }
}

/** Ein Ereignis = eine Zeile der Drei-Ebenen-Ansicht */
export type DiaryEvent = {
  kind: EventKind
  time: number
  hash: string
  subject: string
  initial: boolean
  /** Zweig auf dem PC */
  branch: string | null
  /** Zweig bei GitHub, z. B. origin/main */
  remote: string | null
  /** Ordner (Index in diary.folders); -1 = ein früherer Ordner, den es nicht mehr gibt */
  folder: number | null
  /** Zusammenführen: woher; Abzweigen: wovon; Umschalten: von welchem Zweig */
  from: string | null
  /** Welche Spur hier beginnt */
  creates: ('branch' | 'remote' | 'folder')[]
  /** Gleich danach hochgeladen nach (z. B. origin/main) */
  pushed: string | null
  /** Bei GitHub zusammengeführt: Nummer des Änderungsvorschlags (pull request) */
  pr: number | null
}

/** Bei GitHub zusammengeführt: der Zweig, mit GitHub-Ablage davor (origin/x), wenn dieser PC ihn noch kennt */
function remoteSource(ev: DiaryEvent): { name: string; lane: string | null } | null {
  if (ev.kind !== 'remotemerge' || !ev.from) return null
  const prefix = ev.remote ? ev.remote.slice(0, ev.remote.indexOf('/') + 1) : ''
  return prefix && ev.from.startsWith(prefix)
    ? { name: ev.from.slice(prefix.length), lane: `r:${ev.from}` }
    : { name: ev.from, lane: null }
}

/**
 * Kennung einer Zeile, die auch nach dem nächsten Einlesen gleich bleibt. Der Speicherstand
 * allein reicht nicht: Abzweigen, Umschalten, Abholen usw. zeigen oft auf denselben.
 */
export function eventKey(ev: DiaryEvent): string {
  return [ev.kind, ev.time, ev.hash, ev.branch ?? '', ev.remote ?? '', ev.folder ?? ''].join('|')
}

const isHash = (s: string) => /^[0-9a-f]{7,40}$/.test(s)
const WORK = new Set<EventKind>(['commit', 'amend', 'merge', 'pull'])

function mk(c: Classified, en: DiaryEntry, part: Partial<DiaryEvent>): DiaryEvent {
  return {
    kind: c.kind,
    time: en.time,
    hash: en.hash,
    subject: c.subject,
    initial: !!c.initial,
    branch: null,
    remote: null,
    folder: null,
    from: c.from ?? null,
    creates: [],
    pushed: null,
    pr: null,
    ...part,
  }
}

/**
 * Zusammenführungen auf dem GitHub-Hauptzweig, die nicht auf diesem PC entstanden sind
 * (Änderungsvorschlag auf der Webseite, anderer Rechner). Das Tagebuch kennt davon nur das
 * Abholen; die Speicherstände selbst verraten, was zusammengeführt wurde.
 */
export function remoteMergeEvents(diary: GleisDiary): DiaryEvent[] {
  const target = diary.mainRemote
  if (!target || diary.remoteMerges.length === 0 || diary.entries.length === 0) return []
  const start = Math.min(...diary.entries.map(e => e.time))
  const remote = target.slice(0, target.indexOf('/'))
  const mainName = target.slice(remote.length + 1)
  // Hier entstanden: echtes Zusammenführen im Tagebuch eines Zweigs oder Ordners, oder von hier hochgeladen
  const madeHere = new Set<string>()
  const byHash = new Map<string, DiaryEntry[]>()
  for (const e of diary.entries) {
    const here = e.ref.startsWith('remotes/') ? /^update by push/.test(e.msg) : /: Merge made by|^commit \(merge\)/.test(e.msg)
    if (here) madeHere.add(e.hash)
    const list = byHash.get(e.hash)
    if (list) list.push(e)
    else byHash.set(e.hash, [e])
  }
  const out: DiaryEvent[] = []
  for (const m of diary.remoteMerges) {
    if (m.time < start - 60 || m.parents.length < 2 || madeHere.has(m.hash)) continue
    // Welcher Zweig: aus dem Betreff, sonst aus dem Tagebuch (wer stand auf dem zweiten Elternteil)
    let branch = parseMergeSubject(m.subject)?.from ?? null
    if (!branch) {
      const seen = byHash.get(m.parents[1]!) ?? []
      const hit = seen.find(e => e.ref.startsWith('remotes/')) ?? seen.find(e => e.ref.startsWith('heads/'))
      if (hit) branch = hit.ref.startsWith('heads/') ? hit.ref.slice(6) : hit.ref.slice(hit.ref.indexOf('/', 8) + 1)
    }
    // „Merge branch 'main' of …“: ein anderer Rechner hat nur seinen Stand mit GitHub vereint
    if (branch === mainName) continue
    const pr = /^Merge pull request #(\d+)/.exec(m.subject)
    // Nur ein GitHub-Zweig, den dieser PC noch kennt, bekommt eine Spur; sonst bleibt nur der Name
    const known = branch !== null && diary.remoteBranches.includes(`${remote}/${branch}`)
    out.push({
      kind: 'remotemerge',
      time: m.time,
      hash: m.hash,
      subject: m.subject,
      initial: false,
      branch: null,
      remote: target,
      folder: null,
      from: known ? `${remote}/${branch}` : branch,
      creates: [],
      pushed: null,
      pr: pr ? Number(pr[1]) : null,
    })
  }
  return out
}

/** Macht aus allen Tagebüchern eine Liste von Ereignissen, neueste zuerst */
export function diaryEvents(diary: GleisDiary, branches: string[]): DiaryEvent[] {
  const local = new Set(branches)
  const byRef = new Map<string, DiaryEntry[]>()
  for (const e of diary.entries) {
    const list = byRef.get(e.ref)
    if (list) list.push(e)
    else byRef.set(e.ref, [e])
  }
  for (const list of byRef.values()) list.sort((a, b) => b.time - a.time)

  const events: DiaryEvent[] = []
  const fromBranches: DiaryEvent[] = []
  const remoteClones: DiaryEvent[] = []

  // 1. Zweige auf dem PC
  for (const [ref, list] of byRef) {
    if (!ref.startsWith('heads/')) continue
    const b = ref.slice(6)
    list.forEach((en, k) => {
      const c = classify(en.msg, false)
      if (!c || c.kind === 'checkout') return
      const prev = list[k + 1]
      if (prev && prev.hash === en.hash && c.kind !== 'create') return
      const ev = mk(c, en, { branch: b })
      if (!prev && (c.kind === 'create' || c.kind === 'clone' || c.initial)) ev.creates.push('branch')
      if (c.kind === 'merge' && c.from?.startsWith('origin/')) ev.remote = c.from
      events.push(ev)
      fromBranches.push(ev)
    })
  }

  // 2. Zweige bei GitHub (so, wie dieser PC sie gesehen hat)
  for (const [ref, list] of byRef) {
    if (!ref.startsWith('remotes/')) continue
    const r = ref.slice(8)
    if (r.endsWith('/HEAD')) continue
    const short = r.slice(r.indexOf('/') + 1)
    list.forEach((en, k) => {
      const c = classify(en.msg, true)
      if (!c) return
      const prev = list[k + 1]
      if (prev && prev.hash === en.hash) return
      const ev = mk(c, en, { remote: r, branch: local.has(short) ? short : null })
      if (!prev) ev.creates.push('remote')
      if (c.kind === 'clone') remoteClones.push(ev)
      else events.push(ev)
    })
  }
  for (const rc of remoteClones) {
    const bc = fromBranches.find(b => b.kind === 'clone' && Math.abs(b.time - rc.time) <= 5)
    if (bc) {
      bc.remote = rc.remote
      bc.creates.push('remote')
    } else {
      events.push({ ...rc, kind: 'fetch' })
    }
  }

  // 3. Ordner: Umschalten, und wer was festgehalten hat
  for (const [ref, list] of byRef) {
    if (!ref.startsWith('folder:')) continue
    const fi = Number(ref.slice(7))
    const folder: DiaryFolder | undefined = diary.folders[fi]
    const asc = [...list].reverse()
    const mine: DiaryEvent[] = []
    let cur: string | null = null
    asc.forEach((en, k) => {
      let c = classify(en.msg, false)
      if (!c) return
      const first = k === 0
      const prev = asc[k - 1]
      // Der erste Eintrag eines zusätzlichen Ordners ist sein Anlegen
      if (first && folder && !folder.isMain && !WORK.has(c.kind) && c.kind !== 'clone') c = { kind: 'checkout', subject: '' }
      const born = first && (!folder || !folder.isMain || c.kind === 'clone' || !!c.initial)
      if (c.kind === 'checkout') {
        if (c.to) cur = isHash(c.to) || c.to.startsWith('origin/') ? null : c.to
        if (!first && prev && prev.hash === en.hash && c.from === c.to) return
        const ev = mk(c, en, { branch: cur, folder: fi, from: c.from ?? null })
        if (born) ev.creates.push('folder')
        events.push(ev)
        mine.push(ev)
        return
      }
      if (!first && prev && prev.hash === en.hash) return
      const kind = c.kind
      const match = fromBranches.find(
        b => b.folder === null && b.hash === en.hash && b.kind === kind && Math.abs(b.time - en.time) <= 5,
      )
      if (match) {
        match.folder = fi
        if (match.branch) cur = match.branch
        if (born) match.creates.push('folder')
        mine.push(match)
        return
      }
      const ev = mk(c, en, { branch: cur, folder: fi })
      if (born) ev.creates.push('folder')
      events.push(ev)
      mine.push(ev)
    })
    // Angelegt, ohne dass ein Zweig bekannt war: den nächsten bekannten nehmen
    const birth = mine[0]
    if (birth && birth.kind === 'checkout' && !birth.branch) {
      birth.branch = mine.find(x => x.branch)?.branch ?? folder?.branch ?? null
    }
  }

  // 4. Festgehalten in einem Ordner, den es nicht mehr gibt (z. B. eine beendete Claude-Sitzung)
  for (const ev of fromBranches) if (ev.folder === null && WORK.has(ev.kind)) ev.folder = -1

  // 5. Abholen und einarbeiten: welcher GitHub-Zweig
  const upstream = new Map(diary.track.map(t => [t.branch, t.upstream]))
  for (const ev of events) {
    if (ev.kind === 'pull' && !ev.remote && ev.branch) {
      const up = upstream.get(ev.branch) ?? `origin/${ev.branch}`
      ev.remote = diary.remoteBranches.includes(up) ? up : null
    }
  }

  // 5b. Bei GitHub oder woanders zusammengeführt (steht in keinem Tagebuch dieses PCs)
  events.push(...remoteMergeEvents(diary))

  // 6. Sortieren; Hochladen gleich nach dem Festhalten in dieselbe Zeile. In derselben Sekunde
  // kommt das Anlegen eines Zweigs zuerst (unten), sonst reicht seine Spur über den Anfang hinaus
  const rank = (e: DiaryEvent) => (e.kind === 'push' || e.kind === 'fetch' ? 0 : e.kind === 'create' ? 2 : 1)
  events.sort((a, b) => b.time - a.time || rank(a) - rank(b))
  const out: DiaryEvent[] = []
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!
    const n = events[i + 1]
    if (
      e.kind === 'push' &&
      n &&
      (n.kind === 'commit' || n.kind === 'amend' || n.kind === 'merge') &&
      n.hash === e.hash &&
      !n.pushed &&
      e.time - n.time <= 900
    ) {
      n.pushed = e.remote
      if (e.creates.includes('remote')) n.creates.push('remote')
      continue
    }
    out.push(e)
  }
  return out
}

// ---------------------------------------------------------------- Spuren und Zeilen

export type EbenenLane = {
  /** r:origin/x (GitHub), b:x (PC), f:n (Ordner; f:-1 = frühere Ordner) */
  key: string
  col: 0 | 1 | 2
  name: string
  /** Gibt es jetzt noch */
  exists: boolean
  /** Gibt es noch, aber nichts ist offen (zusammengeführt, hochgeladen, in keinem Ordner): endet am letzten Ereignis */
  idle: boolean
  /** Oberste und unterste Zeile, in der die Spur zu sehen ist */
  top: number
  bottom: number
}

export type EbenenRow =
  | { kind: 'now' }
  | { kind: 'event'; ev: DiaryEvent }
  | { kind: 'gap'; events: DiaryEvent[] }
  | { kind: 'tail'; more: boolean; older: boolean }

export type EbenenModel = {
  lanes: EbenenLane[]
  rows: EbenenRow[]
  /** Ereignisse auf Zweigen, für die kein Platz war */
  hidden: number
  /** Ältere Ereignisse gibt es noch */
  hasMore: boolean
}

export type ModelOptions = {
  mainBranch: string | null
  branches: string[]
  current: string | null
  /** Lokale Zweige, die noch nicht in den Hauptzweig zusammengeführt sind */
  unmerged: string[]
  limit: number
  compact: boolean
  t: Texts
}

/** Woher ein neuer Zweig kommt */
function sourceKey(ev: DiaryEvent, main: string | null): string | null {
  const f = ev.from
  if (!f) return null
  if (f.startsWith('origin/')) return `r:${f}`
  if (f === 'HEAD' || isHash(f) || f === ev.branch) return main && main !== ev.branch ? `b:${main}` : null
  return `b:${f}`
}

/** Die Spur, die in diesem Ereignis in eine andere mündet (Zusammenführen), sonst null */
export function mergedLane(ev: DiaryEvent): string | null {
  if (ev.kind === 'remotemerge') return remoteSource(ev)?.lane ?? null
  if (ev.kind === 'merge' && ev.from && !ev.from.startsWith('origin/') && !isHash(ev.from) && ev.from !== ev.branch) {
    return `b:${ev.from}`
  }
  return null
}

/**
 * Spuren, auf denen noch etwas offen ist; sie reichen bis „Jetzt“. Alle anderen enden an
 * ihrem letzten Ereignis. Ohne Hauptzweig lässt sich das nicht beurteilen: dann sind alle offen.
 */
function openLanes(diary: GleisDiary, opt: ModelOptions): (key: string) => boolean {
  const main = opt.mainBranch
  const open = new Set<string>()
  if (main) open.add(`b:${main}`)
  if (diary.mainRemote) open.add(`r:${diary.mainRemote}`)
  if (opt.current) open.add(`b:${opt.current}`)
  for (const f of diary.folders) if (f.branch) open.add(`b:${f.branch}`)
  for (const b of opt.unmerged) open.add(`b:${b}`)
  for (const r of diary.unmergedRemote) open.add(`r:${r}`)
  for (const tr of diary.track) {
    if (tr.ahead > 0 || tr.behind > 0) {
      open.add(`b:${tr.branch}`)
      if (tr.upstream) open.add(`r:${tr.upstream}`)
    }
  }
  return key => {
    if (key.startsWith('f:')) return true
    if (key.startsWith('r:')) return !diary.mainRemote || open.has(key)
    return !main || open.has(key)
  }
}

/** Die Spuren, die ein Ereignis berührt, und die, zu der es gehört */
export function laneKeysOf(ev: DiaryEvent, main: string | null): { keys: string[]; primary: string | null } {
  const keys: string[] = []
  const b = ev.branch ? `b:${ev.branch}` : null
  const r = ev.remote ? `r:${ev.remote}` : null
  const f = ev.folder !== null ? `f:${ev.folder}` : null
  if (b) keys.push(b)
  if (r) keys.push(r)
  if (ev.pushed) keys.push(`r:${ev.pushed}`)
  if (f) keys.push(f)
  const merged = mergedLane(ev)
  if (merged) keys.push(merged)
  if (ev.kind === 'create') {
    const s = sourceKey(ev, main)
    if (s) keys.push(s)
  }
  const primary =
    ev.kind === 'push' || ev.kind === 'fetch' || ev.kind === 'remotemerge' ? r : ev.kind === 'checkout' ? f : b ?? f ?? r
  return { keys: [...new Set(keys)], primary }
}

/** Wählt die Spuren (höchstens 4 | 5 | 4), bildet die Zeilen und wie weit jede Spur reicht */
export function ebenenModel(events: DiaryEvent[], diary: GleisDiary, opt: ModelOptions): EbenenModel {
  const main = opt.mainBranch
  const lastSeen = new Map<string, number>()
  for (const ev of events) {
    for (const k of laneKeysOf(ev, main).keys) if (!lastSeen.has(k)) lastSeen.set(k, ev.time)
  }
  const byRecency = (prefix: string) =>
    [...lastSeen.keys()].filter(k => k.startsWith(prefix)).sort((a, b) => lastSeen.get(b)! - lastSeen.get(a)!)
  const pick = (forced: (string | null)[], rest: string[], cap: number) =>
    [...new Set([...forced.filter((x): x is string => !!x), ...rest])].slice(0, cap)

  const remoteMain = main ? `origin/${main}` : null
  const gh = pick(
    [remoteMain && (diary.remoteBranches.includes(remoteMain) || lastSeen.has(`r:${remoteMain}`)) ? `r:${remoteMain}` : null],
    byRecency('r:'),
    4,
  )
  const pc = pick(
    [main && opt.branches.includes(main) ? `b:${main}` : null, opt.current ? `b:${opt.current}` : null],
    byRecency('b:'),
    5,
  )
  const existingFolders = diary.folders.map((_, i) => `f:${i}`)
  const usedFolders = byRecency('f:').filter(k => k !== 'f:-1')
  const fo = pick(existingFolders.slice(0, 3), usedFolders, lastSeen.has('f:-1') ? 3 : 4)
  if (lastSeen.has('f:-1')) fo.push('f:-1')

  const visible = new Set([...gh, ...pc, ...fo])
  const shown = events.filter(ev => {
    const p = laneKeysOf(ev, main).primary
    return p !== null && visible.has(p)
  })
  const hidden = events.length - shown.length
  const win = shown.slice(0, Math.max(1, opt.limit))
  const hasMore = shown.length > win.length

  // Zeilen; im zusammenfassenden Modus werden Läufe gleicher Festhalte-Ereignisse zu „… n weitere“
  const rows: EbenenRow[] = [{ kind: 'now' }]
  const sig = (e: DiaryEvent) =>
    e.kind === 'commit' && !e.initial && e.creates.length === 0 ? `${e.branch}|${e.folder}|${e.pushed ?? ''}` : null
  for (let i = 0; i < win.length; ) {
    const e = win[i]!
    const s = sig(e)
    let j = i + 1
    if (opt.compact && s) while (j < win.length && sig(win[j]!) === s) j++
    rows.push({ kind: 'event', ev: e })
    if (j - i >= 3) {
      rows.push({ kind: 'gap', events: win.slice(i + 1, j) })
    } else {
      for (let k = i + 1; k < j; k++) rows.push({ kind: 'event', ev: win[k]! })
    }
    i = j
  }
  const oldestShown = win[win.length - 1]?.time ?? Infinity
  const oldestDiary = events[events.length - 1]?.time ?? Infinity
  const older = diary.oldestCommit !== null && diary.oldestCommit < Math.min(oldestShown, oldestDiary) - 60
  rows.push({ kind: 'tail', more: hasMore, older })
  const tail = rows.length - 1

  // Wie weit jede Spur reicht
  const touched = new Map<string, number[]>()
  const born = new Map<string, number>()
  rows.forEach((row, r) => {
    const evs = row.kind === 'event' ? [row.ev] : row.kind === 'gap' ? row.events : []
    for (const ev of evs) {
      for (const k of laneKeysOf(ev, main).keys) {
        if (!visible.has(k)) continue
        const list = touched.get(k)
        if (list) list.push(r)
        else touched.set(k, [r])
      }
      for (const c of ev.creates) {
        const k =
          c === 'branch' ? `b:${ev.branch}` : c === 'remote' ? `r:${ev.pushed ?? ev.remote}` : `f:${ev.folder}`
        born.set(k, Math.max(born.get(k) ?? 0, r))
      }
    }
  })
  const folderName = (i: number) =>
    i < 0 ? opt.t.formerFolders : diary.folders[i]?.isMain ? opt.t.mainFolder : (diary.folders[i]?.name ?? opt.t.folderGeneric)
  const isOpen = openLanes(diary, opt)
  const lanes: EbenenLane[] = []
  for (const key of [...gh, ...pc, ...fo]) {
    const t = touched.get(key) ?? []
    const id = key.slice(2)
    const col: 0 | 1 | 2 = key.startsWith('r:') ? 0 : key.startsWith('b:') ? 1 : 2
    const exists =
      col === 0 ? diary.remoteBranches.includes(id) : col === 1 ? opt.branches.includes(id) : Number(id) >= 0
    const idle = exists && !isOpen(key)
    // Ohne Ereignis im gezeigten Ausschnitt gibt es nichts zu zeichnen, außer die Spur reicht bis „Jetzt“
    if ((!exists || idle) && t.length === 0) continue
    const maxT = t.length > 0 ? Math.max(...t) : 0
    const cr = born.get(key)
    const top = exists && !idle ? 0 : Math.min(...t)
    // Eine Spur, die es nicht mehr gibt, beginnt beim ältesten bekannten Ereignis (ihr Anlegen steht in keinem Tagebuch mehr)
    const bottom = key === 'f:-1' || !exists ? maxT : cr !== undefined && cr >= maxT ? cr : tail
    const name = col === 0 ? id.slice(id.indexOf('/') + 1) : col === 1 ? id : folderName(Number(id))
    lanes.push({ key, col, name, exists, idle, top, bottom: Math.max(top, bottom) })
  }
  return { lanes, rows, hidden, hasMore }
}

// ---------------------------------------------------------------- Zeichnen

export const COL_GH = '#3b8eea'
export const COL_PC = '#e0a028'
export const COL_ORD = '#5fa83a'
const GREY = '#8b949e'
const RED = '#e0554c'
const COLS = [COL_GH, COL_PC, COL_ORD]
const BANDS = ['rgba(59,142,234,0.08)', 'rgba(224,160,40,0.09)', 'rgba(95,168,58,0.09)']
const FONT = "font-family=\"Segoe UI, system-ui, sans-serif\""
const CSS = '.st{fill:#ffffff}@media (prefers-color-scheme: dark){.st{fill:#1f2328}}'

const H_NOW = 32
const H_EVENT = 36
const H_GAP = 24
const H_TAIL = 16
const LANE = 16
const PADC = 11
const MINW = 44

export type EbenenSlice = { svg: string; height: number }
export type EbenenDrawing = { width: number; header: EbenenSlice; rows: EbenenSlice[] }

export type DrawOptions = {
  /** Zeichen am oberen Ende einer Spur: work (Ordner), push (PC), pull (GitHub) */
  status: Map<string, IconKind>
  /** Angeklickte Zeile (Index in model.rows): bekommt den Kreis */
  selectedRow: number | null
  mainBranch: string | null
  t: Texts
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const cut = (s: string, n: number) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join('') + '…')

/** Zerlegt die Drei-Ebenen-Ansicht in Zeilen-Grafiken, die nahtlos aneinander passen */
export function ebenenSlices(model: EbenenModel, opt: DrawOptions): EbenenDrawing {
  // Spalten und Spuren
  const colStart: number[] = []
  const colW: number[] = []
  const xs = new Map<string, number>()
  let x = 2
  for (const c of [0, 1, 2] as const) {
    const lanes = model.lanes.filter(l => l.col === c)
    const natural = 2 * PADC + Math.max(0, lanes.length - 1) * LANE
    const w = Math.max(MINW, natural)
    colStart.push(x)
    colW.push(w)
    const off = (w - natural) / 2
    lanes.forEach((l, i) => xs.set(l.key, x + off + PADC + i * LANE))
    x += w
  }
  const width = Math.ceil(x + 2)
  const X = (key: string | null) => (key ? xs.get(key) : undefined)

  const frame = (h: number, body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" ${FONT}><style>${CSS}</style>` +
    [0, 1, 2].map(c => `<rect x="${colStart[c]}" y="0" width="${colW[c]}" height="${h}" fill="${BANDS[c]}"/>`).join('') +
    [1, 2]
      .map(
        c =>
          `<line x1="${colStart[c]}" y1="0" x2="${colStart[c]}" y2="${h}" stroke="${GREY}" stroke-opacity="0.55" stroke-width="1.5" stroke-dasharray="2 2"/>`,
      )
      .join('') +
    body +
    '</svg>'

  // Kopf: Spaltennamen und senkrechte Spurnamen
  const names = model.lanes.map(l => cut(l.name, 14))
  const longest = Math.max(4, ...names.map(n => [...n].length))
  const headH = Math.ceil((22 + longest * 6.4 + 6) / 4) * 4
  const titles = opt.t.levelTitles
    .map(
      (t, c) =>
        `<text x="${colStart[c]! + colW[c]! / 2}" y="13" text-anchor="middle" font-size="11.5" font-weight="600" fill="${COLS[c]}">${t}</text>`,
    )
    .join('')
  const laneNames = model.lanes
    .map((l, i) => {
      const lx = xs.get(l.key)!
      const color = l.key === 'f:-1' ? GREY : COLS[l.col]
      return `<text transform="translate(${lx + 4} ${headH - 4}) rotate(-90)" font-size="11" fill="${color}">${esc(names[i]!)}</text>`
    })
    .join('')
  const header = { svg: frame(headH, titles + laneNames), height: headH }

  const line = (x1: number, y1: number, x2: number, y2: number, color: string, extra = '') =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3" stroke-linecap="butt" ${extra}/>`
  const dot = (cx: number, cy: number, color: string) => `<circle cx="${cx}" cy="${cy}" r="4.3" fill="${color}"/>`
  const ring = (cx: number, cy: number, color: string) =>
    `<circle class="st" cx="${cx}" cy="${cy}" r="3.8" stroke="${color}" stroke-width="2"/>`
  /** Gepunkteter Pfeil von x1 nach x2 */
  const arrow = (x1: number | undefined, x2: number | undefined, y: number, color: string) => {
    if (x1 === undefined || x2 === undefined) return ''
    const dir = Math.sign(x2 - x1)
    if (!dir) return ''
    const tip = x2 - dir * 4.5
    const start = x1 + dir * 5
    if (dir * (tip - start) < 8) return ''
    return (
      `<line x1="${start}" y1="${y}" x2="${tip - dir * 5}" y2="${y}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1 4"/>` +
      `<path d="M${tip} ${y} L${tip - dir * 6} ${y - 3.6} L${tip - dir * 6} ${y + 3.6} Z" fill="${color}"/>`
    )
  }
  /** Verworfen: grauer gestrichelter Stummel nach rechts oben */
  const dropped = (cx: number, cy: number) =>
    `<path d="M${cx} ${cy} L${cx + 9} ${cy - 8}" fill="none" stroke="${GREY}" stroke-width="2" stroke-dasharray="3 2"/>` +
    `<circle class="st" cx="${cx + 10}" cy="${cy - 9}" r="2.6" stroke="${GREY}" stroke-width="1.5"/>`
  const icon = (kind: IconKind, cx: number, cy: number, color: string, size = 15) =>
    `<svg x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" viewBox="0 0 24 24">${iconBody(kind, color)}</svg>`

  /** Welche Spur in Zeile r in eine andere mündet (Zusammenführen) */
  const mergedAt = model.rows.map(row => (row.kind === 'event' ? mergedLane(row.ev) : null))

  /** Die Spuren, die durch Zeile r laufen */
  const lanesThrough = (r: number, h: number, yc: number, fade: boolean) =>
    model.lanes
      .map(l => {
        if (r < l.top || r > l.bottom) return ''
        const lx = xs.get(l.key)!
        const color = l.key === 'f:-1' ? GREY : COLS[l.col]!
        const dash = l.key === 'f:-1' ? 'stroke-dasharray="4 4"' : fade ? 'stroke-dasharray="2 3" stroke-opacity="0.6"' : ''
        // Mündet die Spur an ihrem oberen Ende in eine andere, ist die Schräge dorthin ihr Ende
        const intoOther = r === l.top && r > 0 && mergedAt[r] === l.key
        const end = intoOther ? h - 3 : yc
        const y1 = r === l.top ? (r === 0 ? h / 2 + 7 : end) : 0
        const y2 = r === l.bottom ? yc : h
        let s = y2 > y1 ? line(lx, y1, lx, y2, color, dash) : ''
        if (r === l.top && r > 0 && l.key !== 'f:-1') {
          if (!l.exists) {
            s += `<path d="M${lx - 3.5} ${end - 12.5} L${lx + 3.5} ${end - 5.5} M${lx + 3.5} ${end - 12.5} L${lx - 3.5} ${end - 5.5}" stroke="${RED}" stroke-width="2" stroke-linecap="round"/>`
          } else if (l.idle && !intoOther) {
            // Nichts mehr offen: die Linie läuft nach oben aus
            s += line(lx, Math.max(1, end - 15), lx, end, color, 'stroke-dasharray="2 3" stroke-opacity="0.45"')
          }
        }
        return s
      })
      .join('')

  const rows: EbenenSlice[] = model.rows.map((row, r) => {
    if (row.kind === 'now') {
      const h = H_NOW
      let body = lanesThrough(r, h, h / 2, false)
      for (const l of model.lanes) {
        if (l.top !== 0) continue
        const lx = xs.get(l.key)!
        const st = opt.status.get(l.key)
        if (st) {
          const color = st === 'pull' ? COL_GH : COL_PC
          body += icon(st, lx, h / 2, color)
        } else {
          body += ring(lx, h / 2 + 3, l.key === 'f:-1' ? GREY : COLS[l.col]!)
        }
      }
      return { svg: frame(h, body), height: h }
    }
    if (row.kind === 'gap') return { svg: frame(H_GAP, lanesThrough(r, H_GAP, H_GAP / 2, false)), height: H_GAP }
    if (row.kind === 'tail') return { svg: frame(H_TAIL, lanesThrough(r, H_TAIL, 0, true)), height: H_TAIL }

    const h = H_EVENT
    const yc = h / 2
    const ev = row.ev
    const b = ev.branch ? `b:${ev.branch}` : null
    const xb = X(b)
    const xr = X(ev.remote ? `r:${ev.remote}` : null)
    const xp = X(ev.pushed ? `r:${ev.pushed}` : null)
    const xf = X(ev.folder !== null ? `f:${ev.folder}` : null)
    const pcEdge = colStart[1]! + 4
    let under = ''
    let over = ''
    switch (ev.kind) {
      case 'commit':
      case 'amend':
      case 'merge': {
        if (ev.kind === 'merge' && ev.from) {
          const src = X(`b:${ev.from}`)
          if (src !== undefined && xb !== undefined && src !== xb) {
            under += `<path d="M${src} ${h} L${src} ${h - 3} L${xb} ${yc}" fill="none" stroke="${COL_PC}" stroke-width="3" stroke-linejoin="round"/>`
          }
          if (ev.from.startsWith('origin/')) over += arrow(xr, xb ?? pcEdge, yc, COL_PC)
        }
        over += arrow(xf, xb, yc, COL_ORD)
        if (xp !== undefined) over += arrow(xb, xp, yc, COL_PC) + dot(xp, yc, COL_GH)
        if (ev.kind === 'amend' && xb !== undefined) over += dropped(xb, yc)
        if (xb !== undefined) over += dot(xb, yc, COL_PC)
        break
      }
      case 'push':
        over += arrow(xb ?? pcEdge, xr, yc, COL_PC)
        if (xr !== undefined) over += dot(xr, yc, COL_GH)
        if (xb !== undefined) over += dot(xb, yc, COL_PC)
        break
      case 'fetch':
        over += arrow(xr, xb ?? pcEdge, yc, COL_PC)
        if (xr !== undefined) over += dot(xr, yc, COL_GH)
        if (xb !== undefined) over += ring(xb, yc, COL_PC)
        break
      case 'remotemerge': {
        const src = X(mergedLane(ev))
        if (src !== undefined && xr !== undefined && src !== xr) {
          under += `<path d="M${src} ${h} L${src} ${h - 3} L${xr} ${yc}" fill="none" stroke="${COL_GH}" stroke-width="3" stroke-linejoin="round"/>`
        }
        if (xr !== undefined) over += dot(xr, yc, COL_GH)
        break
      }
      case 'pull':
        over += arrow(xr, xb, yc, COL_PC) + arrow(xb, xf, yc, COL_ORD)
        if (xr !== undefined) over += ring(xr, yc, COL_GH)
        if (xb !== undefined) over += dot(xb, yc, COL_PC)
        break
      case 'checkout':
        over += arrow(xb ?? pcEdge, xf, yc, COL_ORD)
        if (xb !== undefined) over += ring(xb, yc, COL_PC)
        if (xf !== undefined && ev.creates.includes('folder')) over += ring(xf, yc, COL_ORD)
        break
      case 'reset':
      case 'rebase':
        over += arrow(xb, xf, yc, COL_ORD)
        if (xb !== undefined) over += dropped(xb, yc) + dot(xb, yc, COL_PC)
        break
      case 'create': {
        const s = sourceKey(ev, opt.mainBranch)
        const sx = X(s)
        if (s?.startsWith('r:')) over += arrow(sx, xb, yc, COL_PC)
        else if (sx !== undefined && xb !== undefined && sx !== xb) {
          under += `<path d="M${sx} ${h} L${sx} ${h - 3} L${xb} ${yc}" fill="none" stroke="${COL_PC}" stroke-width="3" stroke-linejoin="round"/>`
        }
        if (xb !== undefined) over += ring(xb, yc, COL_PC)
        break
      }
      case 'clone':
        over += arrow(xr, xb, yc, COL_PC) + arrow(xb, xf, yc, COL_ORD)
        if (xr !== undefined) over += dot(xr, yc, COL_GH)
        if (xb !== undefined) over += dot(xb, yc, COL_PC)
        break
      case 'other':
        if (xb !== undefined) over += dot(xb, yc, GREY)
        break
    }
    if (r === opt.selectedRow) {
      const sx = xb ?? xr ?? xf
      if (sx !== undefined) over += `<circle cx="${sx}" cy="${yc}" r="8.5" fill="none" stroke="${GREY}" stroke-width="1.5"/>`
    }
    return { svg: frame(h, under + lanesThrough(r, h, yc, false) + over), height: h }
  })

  return { width, header, rows }
}

// ---------------------------------------------------------------- Text

/** Text zu einem Ereignis: oben was passiert ist, darunter (klein) der Betreff oder Näheres */
export function eventLines(
  ev: DiaryEvent,
  folderName: (i: number | null) => string,
  main: string | null,
  t: Texts,
): { title: string; detail: string } {
  const e = t.ev
  const b = ev.branch ?? e.noBranch
  // Der Zweig steht (außer beim Hauptzweig) vorn in der zweiten Zeile
  const sub = (x: string) => (ev.branch && ev.branch !== main ? (x ? `${ev.branch}: ${x}` : ev.branch) : x)
  const short = (r: string | null) => (r ? r.slice(r.indexOf('/') + 1) : '?')
  switch (ev.kind) {
    case 'commit':
      if (ev.initial) return { title: e.initial, detail: sub(ev.subject) }
      return { title: ev.pushed ? e.committedPushed : e.committed, detail: sub(ev.subject) }
    case 'amend':
      return { title: e.amended + (ev.pushed ? e.pushedSuffix : ''), detail: sub(ev.subject) }
    case 'merge':
      if (ev.from?.startsWith('origin/')) return { title: e.mergedRemote, detail: sub(e.fromGitHub(short(ev.from))) }
      return { title: e.mergedInto(b) + (ev.pushed ? e.pushedSuffix : ''), detail: e.mergedFrom(ev.from ?? '?') }
    case 'pull':
      return { title: e.pulled, detail: sub(ev.subject) }
    case 'push':
      return { title: e.pushed(ev.branch ?? short(ev.remote)), detail: '' }
    case 'fetch':
      return { title: e.fetched(short(ev.remote)), detail: ev.branch ? '' : e.fetchedNoLocal }
    case 'remotemerge': {
      const source = remoteSource(ev)
      const parts = [source ? e.mergedFrom(source.name) : '', ev.pr !== null ? e.pullRequest(ev.pr) : e.elsewhereHint]
      return {
        title: ev.pr !== null ? e.mergedOnGitHub(short(ev.remote)) : e.mergedElsewhere(short(ev.remote)),
        detail: parts.filter(Boolean).join(' · '),
      }
    }
    case 'checkout':
      if (ev.creates.includes('folder') && ev.folder !== null && ev.folder > 0) {
        return { title: e.folderCreated(folderName(ev.folder)), detail: ev.branch ? e.withBranch(ev.branch) : '' }
      }
      return {
        title: e.folderTakes(folderName(ev.folder), ev.branch),
        detail: ev.from && ev.from !== ev.branch ? e.before(isHash(ev.from) ? ev.from.slice(0, 7) : ev.from) : '',
      }
    case 'reset':
      return { title: e.reset, detail: sub(e.resetDetail) }
    case 'rebase':
      return { title: e.rebase, detail: sub(e.rebaseDetail) }
    case 'create':
      return { title: e.newBranch(b), detail: ev.from && !isHash(ev.from) && ev.from !== 'HEAD' ? e.fromSource(ev.from) : '' }
    case 'clone':
      return { title: e.cloned, detail: sub('') }
    case 'other':
      return { title: b, detail: ev.subject }
  }
}
