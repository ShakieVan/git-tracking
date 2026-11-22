/**
 * Kurzfassung für Claude: ein paar Zeilen Text mit dem Git-Stand des Projekts,
 * die beim Start einer Unterhaltung in Claudes Kontext kommen (prompt.context).
 * Sie ergänzt, was Claude Code selbst schon mitgibt (aktueller Zweig, geänderte
 * Dateien, letzte Speicherstände): andere Zweige und ob sie zusammengeführt sind,
 * andere Arbeitsverzeichnisse, wann offene Änderungen zuletzt bearbeitet wurden,
 * was noch nicht hochgeladen ist und was das Tagebuch (reflog) über den Ordner sagt.
 * Nur lesend; ist nichts auffällig, gibt es keine Kurzfassung.
 */
import { ago, fullDate, parseStatus, parseWorktrees, pickMainBranch, samePath } from './graph'
import { classify, parseDiary } from './ebenen'
import type { EventKind } from './ebenen'
import type { Texts } from './i18n'

export type BriefRun = (
  args: string[],
  cwd: string,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>
/** Neueste Änderungszeit (ms seit 1970) der Dateien, Pfade relativ zum Ordner; null = unbekannt */
export type BriefNewest = (folder: string, paths: string[]) => Promise<number | null>

export type BriefFolder = {
  path: string
  branch: string | null
  head: string | null
  isMain: boolean
  changed: number
  untracked: number
  conflicts: number
  /** Neueste Änderungszeit der offenen Dateien, Sekunden seit 1970 */
  newest: number | null
}

export type BriefBranch = {
  name: string
  merged: boolean
  hasUpstream: boolean
  /** noch nicht hochgeladen (gegenüber dem eigenen GitHub-Zweig) */
  ahead: number
  /** Ohne GitHub-Zweig: Speicherstände, die in keinem GitHub-Zweig stecken (null = nicht gezählt) */
  onlyHere: number | null
  /** Zeit des letzten Speicherstands, Sekunden seit 1970 */
  time: number
  /** Arbeitsverzeichnis, in dem der Zweig steht (Anzeige-Pfad) */
  folder: string | null
}

export type BriefData = {
  here: BriefFolder & { upstream: string | null; ahead: number; behind: number }
  mainPath: string
  mainBranch: string | null
  remote: string | null
  /** Speicherstände auf allen Zweigen, die nur hier liegen */
  unpushed: number
  stashes: number
  /** Lokale Zweige außer dem Hauptzweig */
  branches: BriefBranch[]
  /** Zweige bei GitHub außer dem Hauptzweig (ohne Remote-Namen) */
  remoteBranches: { name: string; merged: boolean; hasLocal: boolean }[]
  /** Die anderen Arbeitsverzeichnisse der Ablage */
  others: BriefFolder[]
  /** Letzte Git-Aktion in diesem Ordner laut Tagebuch */
  last: { kind: EventKind; subject: string; from?: string; to?: string; time: number } | null
  /** Wie oft der Hauptordner in den letzten SWITCH_DAYS Tagen zwischen Zweigen umgeschaltet wurde */
  switches: number
}

export const SWITCH_DAYS = 14
const SWITCH_MIN = 3
const MAX_FOLDERS = 6
const MAX_NAMES = 8
const DIARY_FORMAT = '--format=%gD%x1f%H%x1f%gs'

const lines = (s: string) =>
  s
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)

/** Pfade der offenen Dateien aus `git status --porcelain=v2` (relativ zum Ordner) */
export function statusPaths(out: string): string[] {
  const paths: string[] = []
  // Vor dem Pfad stehen bei 1 acht, bei 2 neun, bei u zehn Felder
  const skip: Record<string, number> = { '1': 8, '2': 9, u: 10 }
  for (const raw of out.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('? ')) {
      paths.push(line.slice(2))
      continue
    }
    const n = skip[line[0] ?? '']
    if (n === undefined || line[1] !== ' ') continue
    const parts = line.split(' ')
    if (parts.length <= n) continue
    paths.push(parts.slice(n).join(' ').split('\t')[0]!)
  }
  return paths.map(p => p.replace(/^"(.*)"$/, '$1')).filter(Boolean)
}

/** Ein Pfad zum Zeigen: innerhalb der Ablage relativ, sonst vollständig */
export function showPath(path: string, root: string): string {
  const n = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const a = n(path)
  const r = n(root)
  return a.toLowerCase().startsWith(`${r.toLowerCase()}/`) ? a.slice(r.length + 1) : a
}

/**
 * Liest den Git-Stand für die Kurzfassung; null = kein Git-Projekt.
 * Zwei Runden paralleler Git-Aufrufe: Schon das Starten von Git kann unter Windows
 * eine Sekunde dauern, darum laufen alle Aufrufe einer Runde gleichzeitig (und die
 * erste Runde im Ordner der Sitzung, Git findet die Ablage von dort selbst).
 */
export async function readBrief(git: BriefRun, newest: BriefNewest, cwd: string, nowMs: number): Promise<BriefData | null> {
  const [top, status, worktrees, refs, stash, remotes, unpushed, diary] = await Promise.all([
    git(['rev-parse', '--show-toplevel'], cwd),
    git(['status', '--porcelain=v2', '--branch'], cwd),
    git(['worktree', 'list', '--porcelain'], cwd),
    git(
      ['for-each-ref', '--format=%(refname)%09%(upstream:short)%09%(upstream:track)%09%(committerdate:unix)', 'refs/heads', 'refs/remotes'],
      cwd,
    ),
    git(['stash', 'list', '--format=%h'], cwd),
    git(['remote'], cwd),
    git(['rev-list', '--count', '--branches', '--not', '--remotes'], cwd),
    git(['log', '-g', '--date=unix', DIARY_FORMAT, '-n300', 'HEAD'], cwd),
  ])
  if (top.exitCode !== 0 || status.exitCode !== 0) return null
  const root = top.stdout.trim()
  if (!root) return null

  const st = parseStatus(status.stdout)
  const wts = parseWorktrees(worktrees.exitCode === 0 ? worktrees.stdout : '', root)
  const mainWt = wts.find(w => w.isMain)
  const mainPath = mainWt?.path ?? root
  const remoteList = remotes.exitCode === 0 ? lines(remotes.stdout) : []
  const remote = remoteList.includes('origin') ? 'origin' : (remoteList[0] ?? null)

  type RefRow = { ref: string; upstream: string; track: string; time: number }
  const rows: RefRow[] = (refs.exitCode === 0 ? lines(refs.stdout) : []).map(l => {
    const [ref = '', upstream = '', track = '', time = '0'] = l.split('\t')
    return { ref, upstream, track, time: Number(time) || 0 }
  })
  const local = rows.filter(r => r.ref.startsWith('refs/heads/'))
  const localNames = local.map(r => r.ref.slice(11))
  const remoteRows = remote
    ? rows.filter(r => r.ref.startsWith(`refs/remotes/${remote}/`) && !r.ref.endsWith('/HEAD'))
    : []
  const remoteShort = remoteRows.map(r => r.ref.slice(13))
  const mainBranch = pickMainBranch(localNames, remote === 'origin' ? remoteShort : [], st.branch)
  const target =
    mainBranch && localNames.includes(mainBranch)
      ? `refs/heads/${mainBranch}`
      : mainBranch && remote && remoteShort.includes(`${remote}/${mainBranch}`)
        ? `refs/remotes/${remote}/${mainBranch}`
        : null

  const others = wts.filter(w => !samePath(w.path, root)).slice(0, MAX_FOLDERS)
  const isMainHere = samePath(mainPath, root)
  // Zweige ohne eigenen GitHub-Zweig: stecken ihre Speicherstände trotzdem in einem (z. B. unter anderem Namen)?
  const noUpstream = remote
    ? local
        .filter(r => r.ref.slice(11) !== mainBranch && (r.upstream === '' || /gone/.test(r.track)))
        .slice(0, MAX_NAMES)
        .map(r => r.ref)
    : []
  const [merged, otherStatus, mainDiary, hereNewest, ...onlyHereCounts] = await Promise.all([
    target
      ? git(['for-each-ref', '--format=%(refname)', `--merged=${target}`, 'refs/heads', 'refs/remotes'], root)
      : Promise.resolve(null),
    Promise.all(others.map(w => git(['status', '--porcelain=v2', '--branch'], w.path).catch(() => null))),
    isMainHere ? Promise.resolve(diary) : git(['log', '-g', '--date=unix', DIARY_FORMAT, '-n300', 'HEAD'], mainPath),
    st.changed + st.untracked + st.conflicts > 0 ? newest(root, statusPaths(status.stdout)) : Promise.resolve(null),
    ...noUpstream.map(ref => git(['rev-list', '--count', ref, '--not', '--remotes'], root).catch(() => null)),
  ])
  const onlyHere = new Map<string, number>()
  noUpstream.forEach((ref, i) => {
    const r = onlyHereCounts[i]
    if (r && typeof r === 'object' && 'exitCode' in r && r.exitCode === 0) onlyHere.set(ref, Number(r.stdout.trim()) || 0)
  })
  const mergedSet = new Set(merged && merged.exitCode === 0 ? lines(merged.stdout) : [])

  const otherFolders: BriefFolder[] = await Promise.all(
    others.map(async (w, i) => {
      const s = otherStatus[i]
      const ok = s && s.exitCode === 0
      const ost = parseStatus(ok ? s.stdout : '')
      const dirty = ost.changed + ost.untracked + ost.conflicts
      const ms = ok && dirty > 0 ? await newest(w.path, statusPaths(s.stdout)) : null
      return {
        path: w.path,
        branch: w.branch,
        head: w.head || null,
        isMain: w.isMain,
        changed: ost.changed,
        untracked: ost.untracked,
        conflicts: ost.conflicts,
        newest: ms === null ? null : Math.floor(ms / 1000),
      }
    }),
  )

  const branches: BriefBranch[] = local
    .filter(r => r.ref.slice(11) !== mainBranch)
    .map(r => {
      const name = r.ref.slice(11)
      const wt = wts.find(w => w.branch === name && !samePath(w.path, root))
      return {
        name,
        merged: mergedSet.has(r.ref),
        hasUpstream: r.upstream !== '' && !/gone/.test(r.track),
        ahead: Number(/ahead (\d+)/.exec(r.track)?.[1] ?? 0),
        onlyHere: onlyHere.get(r.ref) ?? null,
        time: r.time,
        folder: wt ? showPath(wt.path, mainPath) : null,
      }
    })
  const remoteBranches = remoteRows
    .map(r => ({ name: r.ref.slice(14 + (remote?.length ?? 0)), ref: r.ref }))
    .filter(r => r.name !== mainBranch)
    .map(r => ({ name: r.name, merged: mergedSet.has(r.ref), hasLocal: localNames.includes(r.name) }))

  // Tagebuch: letzte Aktion hier und Umschalten im Hauptordner
  const lastOf = (out: string) => {
    for (const e of parseDiary(out, 'folder:0')) {
      const c = classify(e.msg, false)
      if (c) return { ...c, time: e.time }
    }
    return null
  }
  const since = Math.floor(nowMs / 1000) - SWITCH_DAYS * 86400
  const switches =
    mainDiary && mainDiary.exitCode === 0
      ? parseDiary(mainDiary.stdout, 'folder:0').filter(e => {
          if (e.time < since) return false
          const c = classify(e.msg, false)
          return c?.kind === 'checkout' && c.from !== c.to
        }).length
      : 0

  return {
    here: {
      path: root,
      branch: st.branch,
      head: st.oid,
      isMain: isMainHere,
      changed: st.changed,
      untracked: st.untracked,
      conflicts: st.conflicts,
      newest: hereNewest === null ? null : Math.floor(hereNewest / 1000),
      upstream: st.upstream,
      ahead: st.ahead,
      behind: st.behind,
    },
    mainPath,
    mainBranch,
    remote,
    unpushed: remote && unpushed.exitCode === 0 ? Number(unpushed.stdout.trim()) || 0 : 0,
    stashes: stash.exitCode === 0 ? lines(stash.stdout).length : 0,
    branches,
    remoteBranches,
    others: otherFolders,
    last: diary.exitCode === 0 ? lastOf(diary.stdout) : null,
    switches,
  }
}

/** Gibt es etwas, das Claude über den eingebauten Git-Stand hinaus wissen sollte? */
export function isNotable(d: BriefData): boolean {
  const h = d.here
  return (
    h.changed + h.untracked + h.conflicts > 0 ||
    h.branch === null ||
    d.unpushed > 0 ||
    h.ahead > 0 ||
    h.behind > 0 ||
    (d.remote !== null && h.branch !== null && h.upstream === null) ||
    d.branches.length > 0 ||
    d.remoteBranches.length > 0 ||
    d.others.length > 0 ||
    d.stashes > 0 ||
    d.switches >= SWITCH_MIN
  )
}

/** Die Kurzfassung als Text; null, wenn nichts auffällig ist */
export function briefText(d: BriefData, nowMs: number, t: Texts): string | null {
  if (!isNotable(d)) return null
  const b = t.brief
  const nowS = Math.floor(nowMs / 1000)
  const recent = (s: number) => nowS - s < 14 * 86400
  const when = (s: number) => (recent(s) ? `${ago(s, nowMs, t)} (${fullDate(s)})` : b.on(fullDate(s)))
  const whenShort = (s: number) => (recent(s) ? ago(s, nowMs, t) : b.on(fullDate(s).slice(0, 10)))
  const names = (list: string[]) =>
    list.length > MAX_NAMES ? `${list.slice(0, MAX_NAMES).join(', ')} ${b.andMore(list.length - MAX_NAMES)}` : list.join(', ')
  const main = d.mainBranch ?? 'main'
  const where = (f: { branch: string | null; head: string | null }) =>
    f.branch === null ? b.detached((f.head ?? '').slice(0, 7)) : f.branch === main ? b.onMain(f.branch) : b.onBranch(f.branch)
  const work = (f: BriefFolder) => {
    const parts = [f.changed > 0 ? b.changed(f.changed) : '', f.untracked > 0 ? b.untracked(f.untracked) : ''].filter(Boolean)
    if (f.conflicts > 0) parts.unshift(b.conflicts(f.conflicts))
    return parts.length === 0 ? b.clean : b.dirty(parts.join(', '), f.newest === null ? null : when(f.newest))
  }

  const h = d.here
  const out: string[] = [b.head(fullDate(nowS))]
  out.push(h.isMain ? b.folderMain(h.path, where(h)) : b.folderLinked(h.path, d.mainPath, where(h)))
  out.push(b.hereWork(work(h)))
  if (d.last) out.push(b.last(b.action(d.last), when(d.last.time)))

  // Hochladen und Abholen
  if (d.remote === null) out.push(b.noRemote)
  else {
    if (h.branch !== null && h.upstream === null) out.push(b.neverPushed(h.branch))
    const ahead = Math.max(d.unpushed, h.ahead)
    if (ahead > 0) out.push(b.unpushed(ahead))
    if (h.behind > 0) out.push(b.unpulled(h.behind, h.upstream ?? `${d.remote}/${main}`))
    if (ahead === 0 && h.behind === 0 && h.upstream !== null) out.push(b.synced)
  }

  // Entwicklungszweige
  if (d.branches.length > 0) {
    const open = d.branches.filter(x => !x.merged)
    const done = d.branches.filter(x => x.merged).map(x => x.name)
    const openText = open.map(x =>
      b.openBranch(x.name, [
        x.folder ? b.inFolder(x.folder) : '',
        d.remote === null
          ? ''
          : x.hasUpstream
            ? x.ahead > 0
              ? b.notPushed(x.ahead)
              : ''
            : x.onlyHere === null || x.onlyHere > 0
              ? b.onlyHere(x.onlyHere)
              : b.pushedElsewhere,
        x.time > 0 ? b.lastCommit(whenShort(x.time)) : '',
      ].filter(Boolean)),
    )
    out.push(b.branches(main, d.branches.length, open.length === 0 ? null : openText.join(', '), done.length === 0 ? null : names(done), open.length === 0))
  }
  if (d.remoteBranches.length > 0 && d.remote) {
    const done = d.remoteBranches.filter(x => x.merged).map(x => x.name)
    const onlyThere = d.remoteBranches.filter(x => !x.merged && !x.hasLocal).map(x => x.name)
    const rest = d.remoteBranches.length - done.length - onlyThere.length
    out.push(b.remoteBranches(d.remote, main, d.remoteBranches.length, done.length > 0 ? names(done) : null, onlyThere.length > 0 ? names(onlyThere) : null, rest))
  }
  if (d.stashes > 0) out.push(b.stashes(d.stashes))

  // Andere Ordner und Umschalten
  if (d.others.length > 0) {
    out.push(b.othersTitle(d.others.length))
    for (const f of d.others) {
      out.push(`  · ${showPath(f.path, d.mainPath)}${f.isMain ? b.mainMark : ''} – ${where(f)}: ${work(f)}`)
    }
  }
  if (d.switches >= SWITCH_MIN) out.push(b.switches(d.switches, SWITCH_DAYS, d.others.length === 0))
  else if (d.others.length === 0 && (d.branches.length > 0 || h.changed + h.untracked > 0)) out.push(b.noOthers)

  return out.join('\n')
}
