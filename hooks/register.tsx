import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type {
  DiaryEntry,
  DiaryFolder,
  GleisCommit,
  GleisDiary,
  GleisRef,
  GleisReleases,
  GleisReleaseState,
  GleisSnapshot,
  GleisView,
  GleisWorktree,
  ProjectRepo,
  ReleaseItem,
} from '../types'
import {
  baseOf,
  branchesForOtherRepos,
  checkPrompt,
  dropOtherProjects,
  foreignOrigins,
  grepPattern,
  guessRepos,
  otherProjectRepos,
  parseApiReleases,
  parseApiRepoList,
  parseCheckAnswer,
  parseGhReleases,
  parseGhRepoList,
  parseRemotes,
  pickEvidence,
  remoteGithubRepos,
  remoteRepoNames,
  sameRepo,
  withRemotes,
  withVisibility,
} from './ablagen'
import type { OwnerRepo, Remote } from './ablagen'
import {
  ICON_AMBER,
  ICON_BLUE,
  ICON_GREY,
  ICON_TEXT,
  LOG_FORMAT,
  addWorktreeRefs,
  iconSvg,
  ago,
  baseName,
  findMainTip,
  fullDate,
  laneChip,
  laneInfos,
  laneText,
  layout,
  parseLog,
  parseStat,
  parseStatus,
  parseWorktrees,
  pickMainBranch,
  planSlices,
  refText,
  rowEvents,
  samePath,
  shorten,
} from './graph'
import type { IconKind, RowEvent } from './graph'
import {
  COL_GH,
  COL_ORD,
  COL_PC,
  COL_REL,
  diaryEvents,
  ebenenModel,
  ebenenSlices,
  eventKey,
  eventLines,
  parseDiary,
  parseMerges,
  parseTrack,
  releaseEvents,
  remoteLabel,
  withReleases,
} from './ebenen'
import type { DiaryEvent, EbenenRow } from './ebenen'
import { texts } from './i18n'
import type { Lang, Texts } from './i18n'
import { briefText, readBrief } from './kurzfassung'
import type { BriefMode, BriefNewest, BriefRun } from './kurzfassung'
import { pickedFolder, pickerCommand } from './ordnerwahl'
import { spurInfos, spurTips } from './spuren'
import type { SpurInfo } from './spuren'

const PANE = 'git-tracking'
const TITLE = 'Git-Tracking'
/** Fenstertitel mit der Fassung aus plugin.json, z. B. „Git-Tracking 0.5.2“; beim Sitzungsstart gelesen */
let paneTitle = TITLE
const EVERY_MS = 10_000

/** Liest die Fassung aus der eigenen plugin.json; ohne lesbare Fassung bleibt der Titel ohne Nummer */
async function readTitle($: EngineInterface): Promise<string> {
  try {
    const manifest = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)) as { version?: unknown }
    return typeof manifest.version === 'string' && manifest.version ? `${TITLE} ${manifest.version}` : TITLE
  } catch {
    return TITLE
  }
}
/** Git ohne Sperren, mit unveränderten Umlauten in Pfaden und ohne Farben */
const GIT = ['git', '--no-optional-locks', '-c', 'core.quotepath=off', '-c', 'color.ui=never']

// Neues Schild (shape), wenn sich der Aufbau eines gespeicherten Werts ändert.
// snapshot-6: neu remoteRepos (owner/repo je Gegenstelle, für Links)
const snapshot = atom({ plugin: 'git-tracking', key: 'snapshot' } as const, null, { shape: 'snapshot-6' })
const view = atom(
  { plugin: 'git-tracking', key: 'view' } as const,
  // Voreingestellt: Drei Ebenen; der Gleisplan bleibt per Umschalter erreichbar
  { limit: 80, scope: 'all', folder: null, compact: true, mode: 'ebenen', events: 60 },
  // view-5: die eigene Ansicht „releases“ aus 0.7.0 gibt es nicht mehr (jetzt Ebene in den Drei Ebenen)
  { shape: 'view-5' },
)
const selected = atom({ plugin: 'git-tracking', key: 'selected' } as const, null, { shape: 'selected-3' })
const draft = atom({ plugin: 'git-tracking', key: 'draft' } as const, '', { shape: 'draft-1' })
/** Infobox „Spuren“ in den Drei Ebenen aufgeklappt */
const lanesInfo = atom({ plugin: 'git-tracking', key: 'lanesInfo' } as const, false, { shape: 'lanes-info-1' })
/** Sprache der Anzeige: de oder en */
const lang = atom({ plugin: 'git-tracking', key: 'lang' } as const, 'en', { shape: 'lang-1' })
/** Unter diesem Schlüssel merkt sich das Plugin die im Fenster gewählte Sprache */
const LANG_KEY = 'language'

/** Werkzeuge, nach denen sich der Git-Stand geändert haben kann */
const WATCH = new Set(['Bash', 'PowerShell', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

let running: Promise<void> | null = null
let again = false
let soon: Timer | null = null

function emptySnapshot(folder: string, error: string | null): GleisSnapshot {
  return {
    folder,
    root: null,
    error,
    branch: null,
    head: null,
    upstream: null,
    remotes: [],
    ahead: 0,
    behind: 0,
    changed: 0,
    untracked: 0,
    conflicts: 0,
    stashes: 0,
    worktrees: [],
    mainBranch: null,
    branches: [],
    unmerged: [],
    otherRepoBranches: {},
    remoteNames: {},
    remoteRepos: {},
    unpushed: [],
    unpulled: [],
    commits: [],
    hasMore: false,
    textGraph: [],
    diary: null,
  }
}

type Git = (args: string[], cwd: string) => ReturnType<EngineInterface['process']['run']>

const DIARY_FORMAT = '--format=%gD%x1f%H%x1f%gs'
const MERGES_FORMAT = '--format=%H%x1f%P%x1f%ct%x1f%ce%x1f%s'

/**
 * Liest das Tagebuch (reflog) aller Zweige, der GitHub-Zweige und jedes Ordners:
 * wann festgehalten, hochgeladen, abgeholt, umgeschaltet wurde. Nur lesend.
 */
async function readDiary(
  git: Git,
  root: string,
  wts: GleisWorktree[],
  branches: string[],
  remoteRefs: string[],
  hereDirty: number,
  mainBranch: string | null,
  remoteNames: Record<string, string>,
): Promise<GleisDiary> {
  const list = wts.length > 0 ? wts.slice(0, 6) : [{ path: root, branch: null, head: '', isMain: true, isHere: true }]
  const hereIndex = Math.max(0, list.findIndex(w => w.isHere))
  const refs = [
    'HEAD',
    ...branches.map(b => `refs/heads/${b}`),
    ...remoteRefs.filter(r => !r.endsWith('/HEAD')).map(r => `refs/remotes/${r}`),
  ]
  const others = list.map((w, i) => ({ w, i })).filter(x => x.i !== hereIndex)
  // Der Hauptzweig bei GitHub: was dort zusammengeführt wurde, und welche GitHub-Zweige noch nicht
  const mainRemote = mainBranch && remoteRefs.includes(`origin/${mainBranch}`) ? `origin/${mainBranch}` : null
  const [all, track, roots, merges, remoteOpen, ...rest] = await Promise.all([
    git(['log', '-g', '--date=unix', DIARY_FORMAT, '-n4000', ...refs], root),
    // Volle Namen: heißen Zweig und GitHub-Ablage gleich, macht Git aus dem kurzen Namen „heads/x“
    git(['for-each-ref', '--format=%(refname)%09%(objectname)%09%(upstream:short)%09%(upstream:track)', 'refs/heads'], root),
    git(['log', '--all', '--max-parents=0', '--format=%ct'], root),
    mainRemote ? git(['log', '--first-parent', '--merges', '-n200', MERGES_FORMAT, `refs/remotes/${mainRemote}`], root) : null,
    mainRemote
      ? git(['for-each-ref', '--format=%(refname)', `--no-merged=refs/remotes/${mainRemote}`, 'refs/remotes/origin'], root)
      : null,
    ...others.flatMap(({ w }) => [
      git(['log', '-g', '--date=unix', DIARY_FORMAT, '-n1500', 'HEAD'], w.path),
      git(['status', '--porcelain'], w.path),
    ]),
  ])
  let entries = all.exitCode === 0 ? parseDiary(all.stdout, `folder:${hereIndex}`) : []
  if (all.exitCode !== 0) {
    // Ein Zeiger ohne Tagebuch bringt den Sammelaufruf zum Scheitern: dann einzeln lesen
    const single = await Promise.all(refs.map(r => git(['log', '-g', '--date=unix', DIARY_FORMAT, '-n1500', r], root)))
    entries = single.flatMap(s => (s.exitCode === 0 ? parseDiary(s.stdout, `folder:${hereIndex}`) : []))
  }
  const folders: DiaryFolder[] = list.map((w, i) => {
    const k = others.findIndex(o => o.i === i)
    const status = k >= 0 ? rest[2 * k + 1] : undefined
    return {
      path: w.path,
      name: baseName(w.path),
      branch: w.branch,
      isMain: w.isMain,
      dirty: i === hereIndex ? hereDirty : status && status.exitCode === 0 ? lines(status.stdout).length : 0,
    }
  })
  others.forEach(({ i }, k) => {
    const log = rest[2 * k]
    if (log && log.exitCode === 0) entries = entries.concat(parseDiary(log.stdout, `folder:${i}`))
  })
  const times = lines(roots.stdout).map(Number).filter(n => n > 0)
  const mergeOrigins = await readMergeOrigins(git, root, entries, branches, remoteNames)
  return {
    entries,
    folders,
    track: track.exitCode === 0 ? parseTrack(track.stdout) : [],
    remoteBranches: remoteRefs.filter(r => !r.endsWith('/HEAD')),
    oldestCommit: times.length > 0 ? Math.min(...times) : null,
    mainRemote,
    remoteMerges: merges && merges.exitCode === 0 ? parseMerges(merges.stdout) : [],
    unmergedRemote:
      remoteOpen && remoteOpen.exitCode === 0
        ? lines(remoteOpen.stdout)
            .filter(r => r.startsWith('refs/remotes/') && !r.endsWith('/HEAD'))
            .map(r => r.slice(13))
        : [],
    remoteNames,
    mergeOrigins,
  }
}

/** Übernommene Speicherstände je Bereich (vorher..nachher); Speicherstände ändern sich nie, also für die ganze Sitzung gemerkt */
const mergedCommits = new Map<string, string[]>()
/** Höchstens so viele Übernahmen aus gelöschten Zweigen werden nachgeschlagen (die neuesten) */
const MAX_MERGE_ORIGINS = 12

/**
 * Übernahmen (merge) aus Zweigen, die es nicht mehr gibt: Wurden ihre Speicherstände aus einem der
 * heutigen Ordner festgehalten? Jeder Ordner hält im eigenen Tagebuch „commit: …“ fest; steht ein
 * übernommener Speicherstand in keinem davon, kam er aus einem Ordner, den es nicht mehr gibt.
 */
async function readMergeOrigins(
  git: Git,
  root: string,
  entries: DiaryEntry[],
  branches: string[],
  remoteNames: Record<string, string>,
): Promise<Record<string, 'all' | 'some'>> {
  const local = new Set(branches)
  const prefixes = ['origin/', ...Object.keys(remoteNames).map(r => `${r}/`)]
  const committedHere = new Set(entries.filter(e => e.ref.startsWith('folder:') && /^(commit|cherry-pick)/.test(e.msg)).map(e => e.hash))
  const byRef = new Map<string, DiaryEntry[]>()
  for (const e of entries) {
    if (!e.ref.startsWith('heads/')) continue
    byRef.set(e.ref, [...(byRef.get(e.ref) ?? []), e])
  }
  const jobs: { hash: string; prev: string; time: number }[] = []
  for (const list of byRef.values()) {
    list.sort((a, b) => b.time - a.time)
    list.forEach((en, k) => {
      const m = /^merge (\S+): /.exec(en.msg)
      const from = m?.[1]
      const prev = list[k + 1]
      if (!from || !prev || local.has(from) || /^[0-9a-f]{7,40}$/.test(from) || prefixes.some(p => from.startsWith(p))) return
      jobs.push({ hash: en.hash, prev: prev.hash, time: en.time })
    })
  }
  jobs.sort((a, b) => b.time - a.time)
  const out: Record<string, 'all' | 'some'> = {}
  await Promise.all(
    jobs.slice(0, MAX_MERGE_ORIGINS).map(async j => {
      const range = `${j.prev}..${j.hash}`
      let commits = mergedCommits.get(range)
      if (!commits) {
        const r = await git(['rev-list', '--no-merges', '-n', '200', range], root).catch(() => null)
        if (!r || r.exitCode !== 0) return
        commits = lines(r.stdout)
        mergedCommits.set(range, commits)
      }
      const inside = commits.filter(c => committedHere.has(c)).length
      if (commits.length > 0 && inside === 0) out[j.hash] = 'all'
      else if (inside < commits.length) out[j.hash] = 'some'
    }),
  )
  return out
}

const lines = (s: string) =>
  s
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)

async function readGit($: EngineInterface): Promise<GleisSnapshot> {
  const v = await read($, view)
  const folder = v.folder ?? (await $.session.cwd())
  const git = (args: string[], cwd: string) =>
    $.process.run([...GIT, ...args], {
      cwd,
      timeoutMs: 20_000,
    })

  let top
  try {
    top = await git(['rev-parse', '--show-toplevel'], folder)
  } catch (err) {
    return emptySnapshot(folder, `git-start:${String(err)}`)
  }
  if (top.exitCode !== 0) {
    const msg = top.stderr.trim()
    return emptySnapshot(folder, /not a git repository/i.test(msg) ? null : msg || 'git-error')
  }
  const root = top.stdout.trim()
  const range = v.scope === 'all' ? ['--exclude=refs/stash', '--all'] : ['HEAD']
  const surfaces: readonly string[] = await $.session.surfaces().catch(() => [])
  const wantText = surfaces.includes('terminal')

  const [status, log, worktrees, stash, remotes, remotesV, heads, ahead, behind, text] = await Promise.all([
    git(['status', '--porcelain=v2', '--branch'], root),
    git(['log', '--decorate=full', '--date-order', `-n${v.limit + 1}`, `--format=${LOG_FORMAT}`, ...range], root),
    git(['worktree', 'list', '--porcelain'], root),
    git(['stash', 'list', '--format=%h'], root),
    git(['remote'], root),
    git(['remote', '-v'], root),
    // Alle GitHub-Ablagen, nicht nur origin (z. B. eine öffentliche zweite Ablage)
    git(['for-each-ref', '--format=%(refname)%09%(objectname)%09%(upstream)', 'refs/heads', 'refs/remotes'], root),
    // Nur hier (noch nicht hochgeladen) und nur bei GitHub (noch nicht abgeholt)
    git(['rev-list', '--max-count=500', '--branches', '--not', '--remotes'], root),
    git(['rev-list', '--max-count=500', '--remotes', '--not', '--branches'], root),
    wantText
      ? git(['log', '--graph', '--decorate=short', '--date-order', `-n${v.limit}`, '--format=%h%d %s', ...range], root)
      : Promise.resolve(null),
  ])

  const st = parseStatus(status.stdout)
  const wts = parseWorktrees(worktrees.stdout, root)
  let commits = log.exitCode === 0 ? parseLog(log.stdout) : []
  const hasMore = commits.length > v.limit
  if (hasMore) commits = commits.slice(0, v.limit)
  commits = addWorktreeRefs(commits, wts)

  // Hauptzweig und welche Zweige noch nicht zusammengeführt sind
  const refRows = lines(heads.stdout).map(l => {
    const [ref = '', obj = '', up = ''] = l.split('\t')
    return { ref, obj, up }
  })
  const refNames = refRows.map(r => r.ref)
  const branches = refNames.filter(r => r.startsWith('refs/heads/')).map(r => r.slice(11))
  const remoteRefs = refNames.filter(r => r.startsWith('refs/remotes/')).map(r => r.slice(13))
  const mainBranch = pickMainBranch(branches, remoteRefs, st.branch)
  const remoteNames = remotesV.exitCode === 0 ? remoteRepoNames(remotesV.stdout) : {}
  const remoteRepos = remotesV.exitCode === 0 ? remoteGithubRepos(remotesV.stdout) : {}
  const otherRepoBranches = branchesForOtherRepos(refRows, mainBranch, remoteNames)
  let unmerged: string[] = []
  if (mainBranch) {
    const target = branches.includes(mainBranch) ? `refs/heads/${mainBranch}` : `refs/remotes/origin/${mainBranch}`
    const nm = await git(['for-each-ref', '--format=%(refname)', `--no-merged=${target}`, 'refs/heads'], root)
    // Ein Zweig für eine andere Ablage wird absichtlich nie zusammengeführt
    if (nm.exitCode === 0) unmerged = lines(nm.stdout).map(r => r.replace(/^refs\/heads\//, '')).filter(b => !otherRepoBranches[b])
  }

  const remoteList = lines(remotes.stdout)
  const diary =
    v.mode === 'ebenen'
      ? await readDiary(git, root, wts, branches, remoteRefs, st.changed + st.untracked, mainBranch, remoteNames)
      : null
  return {
    folder,
    root,
    error: status.exitCode === 0 ? null : status.stderr.trim() || null,
    branch: st.branch,
    head: st.oid,
    upstream: st.upstream,
    remotes: remoteList,
    ahead: st.ahead,
    behind: st.behind,
    changed: st.changed,
    untracked: st.untracked,
    conflicts: st.conflicts,
    stashes: stash.exitCode === 0 ? stash.stdout.split('\n').filter(s => s.trim()).length : 0,
    worktrees: wts,
    mainBranch,
    branches,
    unmerged,
    otherRepoBranches,
    remoteNames,
    remoteRepos,
    // Ohne GitHub-Ablage liegt alles nur hier; das sagt schon der Kopf, also keine Markierung je Speicherstand
    unpushed: remoteList.length > 0 && ahead.exitCode === 0 ? lines(ahead.stdout) : [],
    unpulled: behind.exitCode === 0 ? lines(behind.stdout) : [],
    commits,
    hasMore,
    textGraph: text && text.exitCode === 0 ? text.stdout.replace(/\r/g, '').split('\n').filter(Boolean) : [],
    diary,
  }
}

/**
 * Liest den Git-Stand neu. Läuft nie doppelt: Wer während des Lesens fragt,
 * wartet auf denselben Durchgang, und der liest danach noch einmal.
 */
function refresh($: EngineInterface): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        const next = await readGit($)
        const prev = await read($, snapshot)
        if (JSON.stringify(prev) !== JSON.stringify(next)) await update($, snapshot, () => next)
      } while (again)
    } catch (err) {
      $.ui.log(`git-tracking: ${String(err)}`, { to: 'debug' })
    } finally {
      running = null
    }
  })()
  return running
}

function refreshSoon($: EngineInterface) {
  soon?.cancel()
  soon = $.clock.after(700, () => void refresh($))
}

async function paneShown($: EngineInterface): Promise<boolean> {
  const panes = await $.ui.panes()
  return panes.some(p => p.id === PANE && p.isPlaced)
}

const toggleScope = (x: GleisView): GleisView => ({ ...x, scope: x.scope === 'all' ? 'current' : 'all' })
const toggleCompact = (x: GleisView): GleisView => ({ ...x, compact: !x.compact })

async function setMode($: EngineInterface, mode: GleisView['mode']): Promise<void> {
  await update($, view, x => ({ ...x, mode }))
  await refresh($)
  if (mode === 'ebenen') void loadReleases($)
}

/** Die Sprache des Systems: unter Windows die Oberflächensprache, sonst LANG */
async function systemLang($: EngineInterface): Promise<Lang> {
  const info = await $.session.info().catch(() => null)
  if (info?.platform === 'windows') {
    const r = await $.process
      .run(['powershell', '-NoProfile', '-NonInteractive', '-Command', '[cultureinfo]::CurrentUICulture.TwoLetterISOLanguageName'], {
        timeoutMs: 8000,
      })
      .catch(() => null)
    const code = r && r.exitCode === 0 ? r.stdout.trim().toLowerCase() : ''
    if (code) return code.startsWith('de') ? 'de' : 'en'
  }
  const env =
    (await $.env.get('LC_ALL').catch(() => undefined)) ||
    (await $.env.get('LC_MESSAGES').catch(() => undefined)) ||
    (await $.env.get('LANG').catch(() => undefined)) ||
    ''
  return /^de/i.test(env) ? 'de' : 'en'
}

/** Sprache: zuletzt im Fenster gewählt, sonst die Einstellung des Plugins, sonst die des Systems */
async function chooseLang($: EngineInterface, configured: unknown): Promise<Lang> {
  const stored = await $.store.get(LANG_KEY).catch(() => undefined)
  if (stored === 'de' || stored === 'en') return stored
  if (configured === 'de' || configured === 'en') return configured
  return systemLang($)
}

async function setLang($: EngineInterface, l: Lang): Promise<void> {
  await $.store.set(LANG_KEY, l).catch(() => undefined)
  await update($, lang, () => l)
}

// ---------------------------------------------------------------- Kurzfassung für Claude

/** Name des Kontext-Blocks, unter dem Claude die Kurzfassung liest */
const BRIEF_BLOCK = 'gitTracking'
/** Höchstens so viele offene Dateien je Ordner nach ihrer Änderungszeit fragen */
const BRIEF_STATS = 60

/** So lange gilt eine beim Sitzungsstart vorgelesene Kurzfassung noch als frisch */
const BRIEF_FRESH_MS = 120_000
/** So lange wartet Claudes erste Nachricht höchstens auf die vorgelesene Kurzfassung */
const BRIEF_WAIT_MS = 8000

type Brief = { text: string; root: string }

/** Beim Sitzungsstart vorgelesen, damit die erste Nachricht nicht auf Git warten muss */
let warmBrief: { folder: string; mode: BriefMode; at: number; brief: Promise<Brief | null> } | null = null

/** Der Ordner, den das Fenster zeigt, und ob es der Ordner der Sitzung ist */
async function shownFolder($: EngineInterface): Promise<{ folder: string; isOwn: boolean }> {
  const cwd = await $.session.cwd()
  const f = (await read($, view)).folder
  return f && !samePath(f, cwd) ? { folder: f, isOwn: false } : { folder: cwd, isOwn: true }
}

function startBrief($: EngineInterface): void {
  warmBrief = null
  void (async () => {
    const { folder, isOwn } = await shownFolder($)
    const at = await $.clock.now()
    const mode: BriefMode = isOwn ? 'start' : 'startShown'
    warmBrief = { folder, mode, at, brief: claudeBrief($, folder, at, mode).catch(() => null) }
  })().catch(() => undefined)
}

/**
 * Die Kurzfassung für den Start einer Unterhaltung: für den Ordner, den das Fenster
 * zeigt – vorgelesen, wenn frisch, sonst jetzt gelesen.
 */
async function currentBrief($: EngineInterface): Promise<string | null> {
  const { folder, isOwn } = await shownFolder($)
  const mode: BriefMode = isOwn ? 'start' : 'startShown'
  const now = await $.clock.now()
  const w = warmBrief
  if (w && w.mode === mode && samePath(w.folder, folder) && now - w.at < BRIEF_FRESH_MS) {
    const b = await Promise.race([w.brief, $.clock.sleep(BRIEF_WAIT_MS).then(() => null)])
    return b?.text ?? null
  }
  return (await claudeBrief($, folder, now, mode))?.text ?? null
}

/**
 * Gibt Claude den Stand des gezeigten Ordners: eine Zeile für das Modell, die mit der
 * nächsten Anfrage mitgeht (für den Nutzer nicht als getippter Text sichtbar).
 */
async function handBrief($: EngineInterface, mode: 'switched' | 'handed'): Promise<{ project: string } | 'none' | 'failed'> {
  const { folder } = await shownFolder($)
  const now = await $.clock.now()
  const b = await claudeBrief($, folder, now, mode).catch(() => null)
  if (!b) return 'none'
  const r = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: b.text }] } }).catch(() => null)
  if (!r || r.deny !== undefined) return 'failed'
  return { project: baseName(b.root) }
}

/** Eine Zeile im Verlauf (nur für den Nutzer) und ein kurzer Hinweis: Claude hat den Stand */
async function noticeHanded($: EngineInterface, project: string): Promise<void> {
  const t = texts(await read($, lang))
  await $.session.append({ message: { type: 'system', content: [{ type: 'text', text: t.handedNotice(project) }] } }).catch(() => null)
  $.ui.toast(t.handedToast(project))
}

/** Knopf „An Claude geben“ */
async function handNow($: EngineInterface): Promise<void> {
  const t = texts(await read($, lang))
  const r = await handBrief($, 'handed')
  if (r === 'none') $.ui.toast(t.nothingToHand)
  else if (r === 'failed') $.ui.toast(t.handFailed)
  else await noticeHanded($, r.project)
}

/** Die Kurzfassung des Git-Stands in einem Ordner; null = kein Git oder (beim Start) nichts auffällig */
async function claudeBrief($: EngineInterface, cwd: string, now: number, mode: BriefMode): Promise<Brief | null> {
  const git: BriefRun = (args, dir) => $.process.run([...GIT, ...args], { cwd: dir, timeoutMs: 8000 })
  const newest: BriefNewest = async (folder, paths) => {
    const base = folder.replace(/[\\/]+$/, '')
    const stats = await Promise.all(
      paths.slice(0, BRIEF_STATS).map(p => $.fs.stat(`${base}/${p.replace(/\/+$/, '')}`).catch(() => null)),
    )
    const times = stats.map(s => s?.mtimeMs ?? 0).filter(ms => ms > 0)
    return times.length > 0 ? Math.max(...times) : null
  }
  const data = await readBrief(git, newest, cwd, now)
  if (!data) return null
  const text = briefText(data, now, texts(await read($, lang)), mode)
  return text ? { text, root: data.here.path } : null
}

// ---------------------------------------------------------------- Anderer Ordner

/** Unter diesem Schlüssel merkt sich das Plugin je Sitzungsordner den zuletzt gewählten Ordner */
const FOLDERS_KEY = 'folders'
const folderKey = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

async function rememberedFolders($: EngineInterface): Promise<Record<string, string>> {
  const v = await $.store.get(FOLDERS_KEY).catch(() => undefined)
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, f] of Object.entries(v as Record<string, unknown>)) if (typeof f === 'string') out[k] = f
  return out
}

async function rememberFolder($: EngineInterface, cwd: string, folder: string | null): Promise<void> {
  const all = await rememberedFolders($)
  if (folder) all[folderKey(cwd)] = folder
  else delete all[folderKey(cwd)]
  await $.store.set(FOLDERS_KEY, all).catch(() => undefined)
}

/**
 * Zeigt einen anderen Ordner (null = den der Sitzung) und merkt ihn sich für diesen
 * Sitzungsordner. Hat er gewechselt und ist `tellClaude` an, bekommt Claude den neuen
 * Stand mit der nächsten Nachricht; dann kommt der Projektname zurück.
 */
async function showFolder($: EngineInterface, folder: string | null, tellClaude: boolean): Promise<string | null> {
  const cwd = await $.session.cwd()
  const next = folder && !samePath(folder, cwd) ? folder : null
  const before = (await read($, view)).folder
  await update($, view, v => ({ ...v, folder: next }))
  await update($, selected, () => null)
  await rememberFolder($, cwd, next)
  const same = before === next || (before !== null && next !== null && samePath(before, next))
  const [, told] = await Promise.all([
    refresh($).then(() => releasesIfShown($)),
    same || !tellClaude ? Promise.resolve(null) : handBrief($, 'switched'),
  ])
  return told && typeof told === 'object' ? told.project : null
}

// ---------------------------------------------------------------- Veröffentlichungen und Betas

const releases = atom(
  { plugin: 'git-tracking', key: 'releases' } as const,
  { data: null, busy: null, error: null } as GleisReleaseState,
  { shape: 'releases-1' },
)
/** Unter diesem Schlüssel merkt sich das Plugin Claudes Prüfung je Projekt (owner/repo der Haupt-Ablage) */
const CHECKED_KEY = 'checkedRepos'
/** So lange gelten gelesene Veröffentlichungen als frisch (danach liest das Plugin von selbst neu) */
const RELEASES_FRESH_MS = 15 * 60_000
/** So viele Ablagen je Projekt werden höchstens gelesen */
const MAX_REPOS = 8
/** Allgemeiner Name gegenüber GitHub, ohne Angaben zum Nutzer */
const GH_HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'git-tracking-plugin' }

type Checked = { repos: ProjectRepo[]; seen: string[]; at: number }
type Fetched = { ok: true; out: string } | { ok: false; reason: string }

let releasesRun: Promise<void> | null = null
let releasesAgain: { check: boolean } | null = null
/** null = noch nicht versucht, false = gh fehlt (dann nur die öffentliche GitHub-Schnittstelle) */
let ghWorks: boolean | null = null
const ownerCache = new Map<string, { at: number; list: OwnerRepo[] | null }>()

async function checkedAll($: EngineInterface): Promise<Record<string, Checked>> {
  const v = await $.store.get(CHECKED_KEY).catch(() => undefined)
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, Checked> = {}
  for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
    const x = c as Partial<Checked> | null
    if (x && Array.isArray(x.repos) && typeof x.at === 'number') {
      out[k] = { repos: x.repos, seen: Array.isArray(x.seen) ? x.seen.filter(s => typeof s === 'string') : [], at: x.at }
    }
  }
  return out
}

async function saveChecked($: EngineInterface, key: string, c: Checked): Promise<void> {
  const all = await checkedAll($)
  all[key.toLowerCase()] = c
  await $.store.set(CHECKED_KEY, all).catch(() => undefined)
}

const firstLine = (s: string) => s.replace(/\r/g, '').split('\n').map(x => x.trim()).find(Boolean) ?? ''

/** gh, wenn es da ist (kennt auch private Ablagen); null = gh fehlt */
async function runGh($: EngineInterface, args: string[]): Promise<Fetched | null> {
  if (ghWorks === false) return null
  try {
    const r = await $.process.run(['gh', ...args], { timeoutMs: 30_000 })
    ghWorks = true
    if (r.exitCode === 0) return { ok: true, out: r.stdout }
    const err = firstLine(r.stderr)
    return { ok: false, reason: /not found|could not resolve/i.test(err) ? 'not-found' : err || `gh ${r.exitCode}` }
  } catch {
    ghWorks = false
    return null
  }
}

/** Die öffentliche GitHub-Schnittstelle, ohne Anmeldung (nur öffentliche Ablagen) */
async function fetchApi($: EngineInterface, path: string): Promise<Fetched> {
  try {
    const r = await $.http.fetch(`https://api.github.com${path}`, { headers: GH_HEADERS })
    if (r.ok) return { ok: true, out: r.text }
    return {
      ok: false,
      reason: r.status === 404 ? 'not-found' : r.status === 403 || r.status === 429 ? 'rate-limit' : `HTTP ${r.status}`,
    }
  } catch {
    return { ok: false, reason: 'offline' }
  }
}

/** Die Ablagen eines Besitzers bei GitHub (für die Vermutung nach Namen), 15 Minuten zwischengespeichert */
async function ownerRepos($: EngineInterface, owner: string, now: number, fresh: boolean): Promise<OwnerRepo[] | null> {
  const c = ownerCache.get(owner.toLowerCase())
  if (c && !fresh && now - c.at < RELEASES_FRESH_MS) return c.list
  let list: OwnerRepo[] | null = null
  const gh = await runGh($, ['repo', 'list', owner, '--limit', '300', '--json', 'name,description,visibility,isArchived'])
  if (gh?.ok) list = parseGhRepoList(gh.out)
  if (!list) {
    const api = await fetchApi($, `/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=pushed`)
    if (api.ok) list = parseApiRepoList(api.out)
  }
  ownerCache.set(owner.toLowerCase(), { at: now, list })
  return list
}

async function repoReleases($: EngineInterface, repo: ProjectRepo): Promise<{ items: ReleaseItem[] } | { reason: string }> {
  const gh = await runGh($, ['release', 'list', '-R', repo.name, '--limit', '100', '--json', 'tagName,name,isPrerelease,isDraft,publishedAt,createdAt'])
  if (gh?.ok) {
    const items = parseGhReleases(gh.out, repo.name, repo.role)
    if (items) return { items }
  }
  if (gh && !gh.ok && gh.reason === 'not-found') return { reason: 'not-found' }
  const api = await fetchApi($, `/repos/${repo.name}/releases?per_page=100`)
  if (api.ok) {
    const items = parseApiReleases(api.out, repo.name, repo.role)
    if (items) return { items }
    return { reason: 'unreadable' }
  }
  return { reason: api.reason }
}

/** Zeilen aus den Projektdateien, die Ablagen des Besitzers nennen (nur festgehaltene Dateien, nur lesend) */
async function evidence($: EngineInterface, root: string, owner: string): Promise<string[]> {
  const r = await $.process
    .run([...GIT, 'grep', '-n', '-I', '-i', '-E', '-e', grepPattern(owner)], { cwd: root, timeoutMs: 60_000 })
    .catch(() => null)
  return r && r.exitCode === 0 ? pickEvidence(r.stdout) : []
}

/** origins der Git-Ordner neben dem Projekt, je übergeordnetem Ordner 15 Minuten gemerkt */
const neighbourCache = new Map<string, { at: number; configs: string[] }>()
/** Höchstens so viele Nachbarordner werden angesehen */
const MAX_NEIGHBOURS = 300

/**
 * Welche Ablagen die Quellcode-Ablage eines anderen Projekts sind: die origin jedes Git-Ordners
 * neben dem Projekt, gelesen aus dessen `.git/config` (ohne Git zu starten, nur lesend).
 */
async function neighbourOrigins($: EngineInterface, root: string, mainName: string, now: number, fresh: boolean): Promise<string[]> {
  const norm = root.replace(/\\/g, '/').replace(/\/+$/, '')
  let parent = norm.slice(0, norm.lastIndexOf('/'))
  if (!parent) return []
  // Laufwerk ohne Ordner (E:): das Wurzelverzeichnis meinen, nicht den aktuellen Ordner des Laufwerks
  if (/^[A-Za-z]:$/.test(parent)) parent = `${parent}/.`
  const own = baseName(norm).toLowerCase()
  let c = neighbourCache.get(parent.toLowerCase())
  if (!c || fresh || now - c.at >= RELEASES_FRESH_MS) {
    const entries = await $.fs.list(parent).catch(() => [])
    const dirs = entries.filter(d => d.kind === 'dir' && d.name.toLowerCase() !== own && !d.name.startsWith('.')).slice(0, MAX_NEIGHBOURS)
    const configs = await Promise.all(dirs.map(d => $.fs.read(`${parent}/${d.name}/.git/config`).catch(() => null)))
    c = { at: now, configs: configs.filter((x): x is string => typeof x === 'string') }
    neighbourCache.set(parent.toLowerCase(), c)
  }
  return foreignOrigins(c.configs, mainName)
}

/** Fragt Claude (kleines Modell, im Hintergrund, nichts im Chat), welche Ablagen dazugehören */
async function askClaude(
  $: EngineInterface,
  root: string,
  remotes: Remote[],
  candidates: ProjectRepo[],
  otherProjects: string[],
  t: Texts,
): Promise<{ repos: ProjectRepo[] } | { error: string }> {
  const owner = remotes[0]!.name.split('/')[0]!
  const lines = await evidence($, root, owner)
  const { system, prompt } = checkPrompt({ project: baseName(root), remotes, candidates, evidence: lines, otherProjects, lang: t.lang })
  let r: Awaited<ReturnType<EngineInterface['model']['complete']>>
  try {
    r = await $.model.complete({ model: 'haiku', system, prompt, maxTokens: 1500, timeoutMs: 90_000 })
  } catch (err) {
    return { error: t.rel.claudeFailed(firstLine(String(err)) || 'refused') }
  }
  if (!r.isAnswered) {
    const status = 'status' in r && typeof r.status === 'number' ? ` ${r.status}` : ''
    return { error: t.rel.claudeFailed(t.rel.reason(String(r.reason)) + status) }
  }
  const repos = parseCheckAnswer(r.text)
  return repos ? { repos } : { error: t.rel.claudeUnclear }
}

/**
 * Liest die Ablagen und Veröffentlichungen des gezeigten Projekts. Ohne `check` nur, wenn
 * nichts Frisches da ist; `check` (Knopf „Projekt aktualisieren“) fragt vorher Claude.
 * Läuft nie doppelt: Ein Knopfdruck während des Lesens läuft danach.
 */
function loadReleases($: EngineInterface, opt: { force?: boolean; check?: boolean } = {}): Promise<void> {
  if (releasesRun) {
    if (opt.force || opt.check) releasesAgain = { check: !!opt.check || !!releasesAgain?.check }
    return releasesRun
  }
  releasesRun = (async () => {
    let cur: { force?: boolean; check?: boolean } | null = opt
    try {
      while (cur) {
        releasesAgain = null
        await readReleases($, cur)
        // Während des Lesens kann ein Knopfdruck releasesAgain gesetzt haben
        const pending = releasesAgain as { check: boolean } | null
        cur = pending ? { force: true, check: pending.check } : null
      }
    } catch (err) {
      $.ui.log(`git-tracking: ${String(err)}`, { to: 'debug' })
      await update($, releases, s => ({ ...s, busy: null, error: String(err) }))
    } finally {
      releasesRun = null
    }
  })()
  return releasesRun
}

async function releasesIfShown($: EngineInterface): Promise<void> {
  // Die Ebene „Veröffentlicht“ gehört zur Drei-Ebenen-Ansicht
  if ((await read($, view)).mode === 'ebenen') await loadReleases($)
}

async function readReleases($: EngineInterface, opt: { force?: boolean; check?: boolean }): Promise<void> {
  const snap = await read($, snapshot)
  const root = snap?.root
  if (!root) return
  const now = await $.clock.now()
  const cur = await read($, releases)
  const rv = await $.process.run([...GIT, 'remote', '-v'], { cwd: root, timeoutMs: 20_000 }).catch(() => null)
  const remotes = rv && rv.exitCode === 0 ? parseRemotes(rv.stdout) : []
  const main = remotes[0]
  if (!main) {
    await update($, releases, () => ({ data: null, busy: null, error: 'no-github' }))
    return
  }
  const key = main.name
  const same = !!cur.data && sameRepo(cur.data.key, key) && samePath(cur.data.root, root)
  if (!opt.force && !opt.check && same && now - cur.data!.fetchedAt < RELEASES_FRESH_MS) return
  const t = texts(await read($, lang))
  await update($, releases, (s): GleisReleaseState => ({
    data: same ? s.data : null,
    busy: opt.check ? 'checking' : 'loading',
    error: null,
  }))

  const [owned, foreign] = await Promise.all([
    ownerRepos($, key.split('/')[0]!, now, !!opt.force),
    neighbourOrigins($, root, key, now, !!opt.force),
  ])
  const guess = guessRepos(remotes, owned, foreign)
  let stored: Checked | null = (await checkedAll($))[key.toLowerCase()] ?? null
  let error: string | null = null
  if (opt.check) {
    const res = await askClaude($, root, remotes, guess, otherProjectRepos(remotes, owned, foreign), t)
    if ('repos' in res) {
      stored = { repos: dropOtherProjects(withRemotes(res.repos, remotes), remotes, foreign), seen: guess.map(g => g.name), at: now }
      await saveChecked($, key, stored)
    } else {
      error = res.error
    }
    await update($, releases, (s): GleisReleaseState => ({ ...s, busy: 'loading' }))
  }
  // Auch eine früher gemerkte Liste kann Ablagen anderer Projekte enthalten: beim Lesen herausfiltern
  const owner = key.split('/')[0]!
  const repos = withVisibility(stored ? dropOtherProjects(withRemotes(stored.repos, remotes), remotes, foreign) : guess, owner, owned)
  const known = (n: string) => repos.some(r => sameRepo(r.name, n)) || (stored?.seen ?? []).some(s => sameRepo(s, n))
  const newRepos = stored ? guess.filter(g => !known(g.name)).map(g => g.name) : []

  const results = await Promise.all(repos.slice(0, MAX_REPOS).map(r => repoReleases($, r)))
  const items: ReleaseItem[] = []
  const failed: GleisReleases['failed'] = []
  results.forEach((res, i) => {
    if ('items' in res) items.push(...res.items)
    else failed.push({ repo: repos[i]!.name, reason: res.reason })
  })
  items.sort((a, b) => b.time - a.time)
  const data: GleisReleases = { key, root, repos, checkedAt: stored?.at ?? null, newRepos, items, failed, fetchedAt: now }
  await update($, releases, () => ({ data, busy: null, error }))
  if (opt.check && !error) $.ui.toast(t.rel.updatedToast(repos.length))
}

let picking = false
/** Nach so langer Zeit gibt das Plugin das Warten auf den Auswahldialog auf (Höchstwert von process.run) */
const PICK_TIMEOUT_MS = 600_000

/** Knopf „Ordner wählen …“: Auswahldialog des Systems, dann den Ordner zeigen */
async function pickFolder($: EngineInterface, tellClaude: boolean): Promise<void> {
  const t = texts(await read($, lang))
  if (picking) {
    $.ui.toast(t.picking)
    return
  }
  const info = await $.session.info().catch(() => null)
  const { folder } = await shownFolder($)
  // Der Dialog beginnt im gerade gezeigten Ordner (Nutzerwunsch 22.11.2026, vorher im übergeordneten)
  const cmd = pickerCommand(info?.platform, t.pickTitle, folder)
  if (!cmd) {
    $.ui.toast(t.noPicker)
    return
  }
  picking = true
  $.ui.toast(t.picking)
  try {
    const r = await $.process.run(cmd.argv, { env: cmd.env, timeoutMs: PICK_TIMEOUT_MS })
    const chosen = pickedFolder(r.stdout)
    if (!chosen) {
      // zenity meldet Abbrechen mit 1 und ohne Text; sonst ist ein Fehlertext ein Fehler
      const err = r.stderr.replace(/#< CLIXML[\s\S]*$/, '').trim()
      if (r.exitCode !== 0 && err) $.ui.toast(t.pickFailed(err.split('\n')[0]!))
      return
    }
    const told = await showFolder($, chosen, tellClaude)
    if (told) await noticeHanded($, told)
  } catch (err) {
    $.ui.toast(t.pickFailed(String(err)))
  } finally {
    picking = false
  }
}

// ---------------------------------------------------------------- Anklicken und Fragen

type Pill = { label: string; bg?: string; fg?: string; dim?: boolean; mono?: boolean }

/**
 * Die Schilder einer Zeile als Text-Schilder. `laneName` steht an der Spitze eines
 * Nebengleises, dessen Zweig keinen eigenen Zeiger mehr hat (z. B. nach dem Zusammenführen).
 */
function pillsFor(
  c: GleisCommit,
  color: number,
  sidings: Set<GleisRef>,
  snap: GleisSnapshot,
  laneName: string | null,
  t: Texts,
): Pill[] {
  const name: Pill[] = laneName ? [{ label: laneName, fg: laneText(color) }] : []
  return name.concat(c.refs.map((r): Pill => {
    switch (r.kind) {
      case 'local':
        return {
          label: `${r.isCurrent ? '▶ ' : ''}${r.name}${r.isSynced ? ' ☁' : ''}${r.inWorktree ? ' 📂' : ''}`,
          bg: laneChip(sidings.has(r) ? 1 : color),
          fg: '#ffffff',
        }
      case 'remote': {
        const name = remoteLabel(r.name, snap.remoteNames, snap.mainBranch)
        return { label: t.atGitHub(name, r.name === snap.upstream ? snap.ahead : 0), fg: 'suggestion' }
      }
      case 'tag':
        return { label: r.name, bg: '#f5c542', fg: '#3d2e00', mono: true }
      case 'detached':
        return { label: t.detachedPill, bg: '#586675', fg: '#ffffff' }
      case 'worktree':
        return { label: `📂 ${r.name}`, dim: true }
    }
  }))
}

/**
 * Klick auf eine Zeile: Details aufklappen (oder wieder zuklappen) und die geänderten Dateien lesen.
 * `row` = welche Zeile der Drei-Ebenen-Ansicht (eventKey); im Gleisplan null.
 */
async function selectCommit(
  $: EngineInterface,
  root: string,
  hash: string,
  t: Texts,
  row: string | null = null,
): Promise<void> {
  const cur = await read($, selected)
  if (cur?.hash === hash && (cur.row ?? null) === row) {
    await update($, selected, () => null)
    return
  }
  await update($, draft, () => '')
  // Gleicher Speicherstand, nur eine andere Zeile: Die Dateien sind schon gelesen, die Karte wandert
  if (cur?.hash === hash) {
    await update($, selected, now => (now && now.hash === hash ? { ...now, row } : now))
    return
  }
  await update($, selected, () => ({ hash, row, files: [], summary: '', loading: true, subject: '', author: '', time: 0 }))
  const shown = await $.process
    .run(
      [...GIT, 'show', '--stat=200,160', '--format=%s%x1f%an%x1f%ct%x1e', '--diff-merges=first-parent', hash],
      { cwd: root, timeoutMs: 20_000 },
    )
    .catch(() => null)
  const out = shown?.exitCode === 0 ? shown.stdout : ''
  const cut = out.indexOf('\x1e')
  const [subject = '', author = '', ct = '0'] = (cut >= 0 ? out.slice(0, cut) : '').split('\x1f')
  const { files, summary } = parseStat(cut >= 0 ? out.slice(cut + 1) : out, t)
  await update($, selected, now =>
    now && now.hash === hash
      ? { ...now, files, summary, loading: false, subject: subject.trim(), author, time: Number(ct) || 0 }
      : now,
  )
}

/** Die Frage mit allem, was Claude zum Speicherstand wissen muss */
function questionText(root: string, c: GleisCommit, question: string, t: Texts): string {
  const refs = c.refs.map(r => refText(r, t)).join(', ')
  return [
    t.questionHead(c.hash.slice(0, 7), baseName(root), root),
    `${t.quoted(c.subject)} – ${c.author}, ${fullDate(c.time)}${refs ? ` · ${refs}` : ''}`,
    t.questionMine(question.trim()),
  ].join('\n')
}

/** Schreibt die Frage unten ins Eingabefeld dieses Chats; abschicken mit Enter bleibt beim Nutzer */
async function askHere($: EngineInterface, root: string, c: GleisCommit, question: string, t: Texts): Promise<void> {
  const text = questionText(root, c, question, t)
  const box = await $.prompt.read().catch(() => null)
  const hasDraft = (box?.text ?? '').trim().length > 0
  const filled = await $.prompt
    .fill(hasDraft ? { text: `\n\n${text}`, mode: 'append' } : { text, mode: 'replace' })
    .catch(() => null)
  if (filled?.isFilled) {
    await update($, draft, () => '')
    $.ui.toast(question.trim() ? t.toastAsked : t.toastAskStart)
  } else {
    $.ui.toast(t.toastNoFill(filled?.refusal === 'dialog'))
  }
}

/** Farben der Ebenen in der Infobox „Spuren“, wie in der Zeichnung: GitHub, PC, Ordner, Veröffentlicht */
const LEVEL_COLORS = [COL_GH, COL_PC, COL_ORD, COL_REL] as const
const INFO_GREY = '#8b949e'

type CopySurface = Parameters<EngineInterface['ui']['copy']>[0]['surface']

/** Kopiert eine Adresse oder einen Pfad und sagt es kurz (nur, wenn die Oberfläche es übernommen hat) */
async function copyText($: EngineInterface, text: string, surface: CopySurface, toast: string): Promise<void> {
  const r = await $.ui.copy({ text, surface }).catch(() => null)
  if (r?.isCopied) $.ui.toast(toast)
}

/** Öffnet einen Ordner im Dateimanager des Systems (Windows: Explorer) */
async function openFolderAt($: EngineInterface, path: string, t: Texts): Promise<void> {
  const p = (await $.session.info().catch(() => null))?.platform
  const argv = p === 'windows' ? ['explorer.exe', path.replace(/\//g, '\\')] : p === 'macos' ? ['open', path] : ['xdg-open', path]
  try {
    // explorer.exe meldet auch bei Erfolg den Rückgabewert 1: nur ein Startfehler ist ein Fehler
    await $.process.run(argv, { timeoutMs: 15_000 })
  } catch (err) {
    $.ui.toast(t.info.openFailed(firstLine(String(err)) || '?'))
  }
}

/** Kopiert die Frage, damit sie in einem neuen Chat des Projekts eingefügt werden kann */
async function copyForNewChat(
  $: EngineInterface,
  root: string,
  c: GleisCommit,
  question: string,
  surface: Parameters<EngineInterface['ui']['copy']>[0]['surface'],
  t: Texts,
): Promise<void> {
  await $.ui.copy({ text: questionText(root, c, question, t), surface })
  $.ui.toast(t.toastCopied(baseName(root)))
}

export const register: Register = (on, options) => {
  /** Kurzfassung für Claude beim Start und beim Ordnerwechsel (der Knopf „An Claude geben“ geht immer) */
  const summaryOn = options.claudeSummary !== 'off'

  on('session.start', async ($, e, next) => {
    const l = await chooseLang($, options.language)
    await update($, lang, () => l)
    const t = texts(l)
    await $.command.register({
      name: 'git-tracking',
      description: t.commandDescription,
      argumentHint: t.commandArg,
    })
    // Zuletzt für diesen Sitzungsordner gewählter Ordner (z. B. Git-Ablage außerhalb des Projekts)
    const cwd = await $.session.cwd()
    const remembered = (await rememberedFolders($))[folderKey(cwd)]
    if (remembered && (await read($, view)).folder === null) await update($, view, v => ({ ...v, folder: remembered }))
    if (summaryOn) startBrief($)
    paneTitle = await readTitle($)
    // Ohne angeschlossene Oberfläche (z. B. claude -p) lehnt ui.open ab – dann eben kein Fenster.
    void refresh($)
      .then(() => $.ui.open({ id: PANE, title: paneTitle }))
      .then(() => releasesIfShown($))
      .catch(() => undefined)
    // Alle 10 s den Git-Stand; Veröffentlichungen nur, wenn sie gezeigt werden und älter als 15 Minuten sind
    $.clock.every(EVERY_MS, () => {
      void paneShown($).then(shown => (shown ? refresh($).then(() => releasesIfShown($)) : undefined))
    })

    return next(e)
  })

  on('command.run', { command: 'git-tracking' }, async ($, e) => {
    const t = texts(await read($, lang))
    const arg = e.args.trim().replace(/^"(.*)"$/, '$1')
    const told = await showFolder($, arg || null, summaryOn)
    const opened = await $.ui.open({ id: PANE, title: paneTitle }).catch(() => null)
    const where = (arg ? t.shows(arg) : t.showsThis) + (told ? t.claudeGetsIt : '')

    return { text: opened?.isPlaced === false ? `${where}${t.paneLater}` : where }
  })

  // Beim Start jeder Unterhaltung (und nach /clear oder dem Zusammenfassen) bekommt Claude
  // die Kurzfassung als Kontext-Block mit – nur wenn etwas auffällig ist.
  on('prompt.context', async ($, e, next) => {
    const res = await next(e)
    if (options.claudeSummary === 'off') return res
    const brief = await currentBrief($).catch(() => null)
    if (!brief) return res
    return { ...res, blocks: [...res.blocks.filter(b => b.name !== BRIEF_BLOCK), { name: BRIEF_BLOCK, text: brief }] }
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (WATCH.has(String(e.tool))) refreshSoon($)

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const snap = await read($, snapshot)
    const v = await read($, view)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Input } = ui
    const isWidget = e.props.placement === 'widget'
    const t = texts(await read($, lang))
    // Zeichen als Grafik; im Terminal (ohne Svg) als Schriftzeichen
    const SvgEl = 'Svg' in ui ? ui.Svg : null
    const icon = (kind: IconKind, color: string, px = 16) =>
      SvgEl ? (
        <SvgEl source={iconSvg(kind, color)} width={px} height={px} alt={t.iconName[kind]} />
      ) : (
        <Text>{ICON_TEXT[kind]}</Text>
      )

    if (!snap) return <Text dimColor>{t.reading}</Text>

    // Ordner wählen, Stand an Claude geben, zurück zum Ordner der Sitzung
    const projectRow = (isOther: boolean, canHand: boolean) => (
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        <Button
          key="ordner-waehlen"
          label={t.pickFolder}
          onPress={() => void $.clock.after(0, () => void pickFolder($, summaryOn))}
        />
        {canHand && <Button key="an-claude" label={t.handToClaude} onPress={() => void handNow($)} />}
        {isOther && (
          <Button key="home" label={t.backToProject} onPress={() => void showFolder($, null, summaryOn)} />
        )}
      </Box>
    )

    if (!snap.root) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text weight="semibold">{t.noGit}</Text>
          <Text dimColor wrap="wrap">
            {snap.error === null
              ? t.noGitFolder(snap.folder)
              : snap.error === 'git-error'
                ? t.gitError
                : snap.error.startsWith('git-start:')
                  ? t.gitStartFailed(snap.error.slice(10))
                  : snap.error}
          </Text>
          {!isWidget && (
            <Text dimColor wrap="wrap">
              {t.otherProjectHint}
            </Text>
          )}
          {!isWidget && projectRow(v.folder !== null, false)}
        </Box>
      )
    }
    const root = snap.root

    // Kopf: Projekt, Gleise, Ampel
    const project = baseName(root)
    const chips: { text: string; color: string; icon?: IconKind; iconColor?: string }[] = []
    if (snap.conflicts > 0) chips.push({ text: t.conflicts(snap.conflicts), color: 'error' })
    if (snap.ahead > 0) {
      chips.push({ text: t.notPushed(snap.ahead), color: 'warning', icon: 'push', iconColor: ICON_AMBER })
    }
    if (snap.behind > 0) {
      chips.push({ text: t.notPulled(snap.behind), color: 'suggestion', icon: 'pull', iconColor: ICON_BLUE })
    }
    const dirty = snap.changed + snap.untracked
    if (dirty > 0) {
      const parts = [
        snap.changed > 0 ? t.filesChanged(snap.changed) : '',
        snap.untracked > 0 ? t.filesNew(snap.untracked) : '',
      ].filter(Boolean)
      chips.push({
        text: t.notCommitted(parts.join(', ')),
        color: 'warning',
        icon: 'work',
        iconColor: ICON_AMBER,
      })
    }
    if (snap.stashes > 0) chips.push({ text: t.stashed(snap.stashes), color: 'subtle' })
    if (snap.branch && !snap.upstream) {
      chips.push({
        text: snap.remotes.length > 0 ? t.neverPushed : t.localOnly,
        color: 'subtle',
      })
    }
    if (chips.length === 0) chips.push({ text: t.allClean, color: 'success' })

    const where = snap.branch
      ? snap.branch === snap.mainBranch
        ? t.onMain(snap.branch)
        : t.onBranch(snap.branch)
      : snap.head
        ? t.detached(snap.head.slice(0, 7))
        : t.noCommitYet
    const main = snap.mainBranch ?? 'main'
    const sideBranches = snap.branches.filter(b => b !== main)
    // Zweige für eine andere GitHub-Ablage (z. B. „oeffentlich“ → git-tracking) zählen nicht als offen
    const forOther = sideBranches.filter(b => snap.otherRepoBranches[b])
    const ownSide = sideBranches.filter(b => !snap.otherRepoBranches[b])
    const otherPart =
      forOther.length > 0 ? t.otherRepoTracks(forOther.length, [...new Set(forOther.map(b => snap.otherRepoBranches[b]!))].join(', ')) : ''
    const trackLine =
      ownSide.length === 0
        ? otherPart
          ? t.mainWith(main, otherPart)
          : t.oneTrack(main)
        : t.tracks(main, ownSide.length, snap.unmerged.length) + (otherPart ? ` · ${otherPart}` : '')
    const header = (
      <Box flexDirection="column">
        <Text>
          <Text weight="semibold">{project}</Text>
          <Text dimColor> · {where}</Text>
        </Text>
        <Text wrap="wrap">🚆 {trackLine}</Text>
        {v.folder !== null && (
          <Text dimColor size="caption" wrap="truncate-start">
            📁 {root}
          </Text>
        )}
        {chips.map(c =>
          c.icon ? (
            <Box flexDirection="row" gap={1} alignItems="center">
              {icon(c.icon, c.iconColor ?? ICON_GREY, 15)}
              <Text color={c.color} wrap="truncate-end">
                {c.text}
              </Text>
            </Box>
          ) : (
            <Text color={c.color} wrap="truncate-end">
              {c.text}
            </Text>
          ),
        )}
      </Box>
    )
    if (isWidget) return header

    const others = snap.worktrees.filter(w => !w.isHere)
    const worktrees =
      others.length > 0 ? (
        <Box flexDirection="column">
          <Text dimColor>{t.worktreesTitle(others.length)}</Text>
          {others.slice(0, 8).map(w => (
            <Text dimColor wrap="truncate-end">
              📂 {baseName(w.path)} → {t.worktreeTarget(w.branch, w.head.slice(0, 7))}
              {w.isMain ? t.mainWorktree : ''}
            </Text>
          ))}
          {others.length > 8 && <Text dimColor>{t.andMore(others.length - 8)}</Text>}
        </Box>
      ) : null

    // Ein Ordner ist gewählt, also nicht der der Sitzung (showFolder setzt ihn sonst auf null)
    const otherFolder = v.folder !== null
    const makeButtons = (moreEbenen: boolean) => (
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        <Button
          key="reload"
          label={t.reload}
          onPress={() => void refresh($).then(() => (v.mode === 'ebenen' ? loadReleases($, { force: true }) : undefined))}
        />
        <Button
          key="compact"
          label={
            v.mode === 'ebenen'
              ? v.compact
                ? t.allEvents
                : t.groupEvents
              : v.compact
                ? t.allCommits
                : t.onlyStops
          }
          onPress={() => void update($, view, toggleCompact)}
        />
        {v.mode === 'plan' && (
          <Button
            key="scope"
            label={v.scope === 'all' ? t.onlyThisBranch : t.allBranches}
            onPress={() => void update($, view, toggleScope).then(() => refresh($))}
          />
        )}
        {v.mode === 'ebenen' && moreEbenen && (
          <Button
            key="more-e"
            label={t.moreDiary}
            onPress={() => void update($, view, x => ({ ...x, events: x.events + 60 }))}
          />
        )}
        {v.mode === 'plan' && snap.hasMore && (
          <Button
            key="more"
            label={t.moreHistory}
            onPress={() => void update($, view, x => ({ ...x, limit: x.limit + 60 })).then(() => refresh($))}
          />
        )}
      </Box>
    )
    const buttons = makeButtons(false)
    const projectButtons = projectRow(otherFolder, true)
    const modeSwitch = (
      <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
        <Button
          key="ansicht-ebenen"
          label={t.modeLevels}
          {...(v.mode === 'ebenen' ? { variant: 'primary' as const } : {})}
          onPress={() => void setMode($, 'ebenen')}
        />
        <Button
          key="ansicht-plan"
          label={t.modePlan}
          {...(v.mode === 'plan' ? { variant: 'primary' as const } : {})}
          onPress={() => void setMode($, 'plan')}
        />
        <Text dimColor>│</Text>
        <Button
          key="sprache-de"
          label="DE"
          {...(t.lang === 'de' ? { variant: 'primary' as const } : {})}
          onPress={() => void setLang($, 'de')}
        />
        <Button
          key="sprache-en"
          label="EN"
          {...(t.lang === 'en' ? { variant: 'primary' as const } : {})}
          onPress={() => void setLang($, 'en')}
        />
      </Box>
    )

    const iconLegend: { kind: IconKind; color: string; text: string }[] = [
      { kind: 'work', color: ICON_AMBER, text: t.iconLegend.work },
      { kind: 'push', color: ICON_AMBER, text: t.iconLegend.push },
      { kind: 'pull', color: ICON_BLUE, text: t.iconLegend.pull },
      { kind: 'merge', color: ICON_GREY, text: t.iconLegend.merge },
      { kind: 'branch', color: ICON_GREY, text: t.iconLegend.branch },
    ]
    const legend = (
      <Box flexDirection="column">
        <Text dimColor size="caption">
          {t.symbolsTitle}
        </Text>
        {iconLegend.map(l => (
          <Box flexDirection="row" gap={1} alignItems="center">
            {icon(l.kind, l.color, 15)}
            <Text dimColor size="caption" wrap="wrap">
              {l.text}
            </Text>
          </Box>
        ))}
        <Text dimColor size="caption" wrap="wrap">
          {t.planLegend}
        </Text>
      </Box>
    )

    if (snap.commits.length === 0) {
      return (
        <Box flexDirection="column" gap={1}>
          {header}
          {projectButtons}
          <Text dimColor>{t.noCommits}</Text>
          {buttons}
        </Box>
      )
    }

    if (e.surface === 'terminal') {
      const room = Math.max(5, e.props.scroll.bodyRows - 8)
      return (
        <Box flexDirection="column" gap={1}>
          {header}
          {projectButtons}
          {worktrees}
          <Box flexDirection="column">
            {snap.textGraph.slice(0, Math.max(room, 40)).map(line => (
              <Text wrap="truncate-end">{line}</Text>
            ))}
          </Box>
          {buttons}
        </Box>
      )
    }

    const { Svg } = $.ui.resolve(e)
    const sel = await read($, selected)
    const question = await read($, draft)
    const now = await $.clock.now()
    const SYM = 5
    // Zeichen mit Erklärung, die beim Darüberfahren aufklappt
    const symbols = (key: string, list: RowEvent[], max = 2) => (
      <Box key={key} width={max > 2 ? SYM + 3 : SYM} flexDirection="row" alignItems="center">
        {list.slice(0, max).map(s => (
          <Box key={`${key}-${s.icon}`}>
            {icon(s.icon, s.color, 16)}
            <Box
              position="absolute"
              top={1}
              left={0}
              width={42}
              display="none"
              hover={{ display: 'flex' }}
              backgroundColor="#1f2328"
              borderStyle="round"
              borderColor="#586675"
              paddingX={1}
            >
              <Text color="#ffffff" wrap="wrap">
                {s.text}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
    )

    const card = (c: GleisCommit) => {
      const details = sel && sel.hash === c.hash ? sel : null
      return (
        <Box key={`karte-${c.hash}`} flexDirection="column" borderStyle="round" paddingX={1} marginY={1}>
          <Text weight="semibold" wrap="wrap">
            {c.subject}
          </Text>
          <Text dimColor wrap="wrap">
            {c.hash.slice(0, 7)} · {c.author} · {fullDate(c.time)}
          </Text>
          {c.refs.length > 0 && (
            <Text dimColor wrap="wrap">
              {c.refs.map(r => refText(r, t)).join(' · ')}
            </Text>
          )}
          {!details || details.loading ? (
            <Text dimColor>{t.readingFiles}</Text>
          ) : (
            <Box flexDirection="column">
              <Text>{details.summary || t.noFileChanges}</Text>
              {details.files.map(f => (
                <Text dimColor wrap="truncate-end">
                  {'  '}
                  {f}
                </Text>
              ))}
            </Box>
          )}
          <Box marginTop={1} flexDirection="column" gap={1}>
            <Input
              key="frage"
              placeholder={t.questionPlaceholder}
              value={question}
              submitLabel={t.submitLabel}
              onInput={text => void update($, draft, () => text)}
              onSubmit={text => void askHere($, root, c, text, t)}
            />
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button
                key="frage-hier"
                variant="primary"
                label={t.askHere}
                onPress={() => void read($, draft).then(text => askHere($, root, c, text, t))}
              />
              <Button
                key="frage-neu"
                label={t.copyForNew}
                onPress={press => void read($, draft).then(text => copyForNewChat($, root, c, text, press.surface, t))}
              />
              <Button key="schliessen" label={t.close} onPress={() => void update($, selected, () => null)} />
            </Box>
          </Box>
        </Box>
      )
    }

    // ------------------------------------------------ Drei Ebenen: GitHub | PC | Ordner
    if (v.mode === 'ebenen') {
      const diary = snap.diary
      if (!diary) {
        return (
          <Box flexDirection="column" gap={1}>
            {header}
            {projectButtons}
            {modeSwitch}
            <Text dimColor>{t.readingDiary}</Text>
          </Box>
        )
      }
      // Vierte Ebene: Veröffentlichungen und Betas aus den GitHub-Ablagen des Projekts, nach Zeit einsortiert
      const rs = await read($, releases)
      const relData = rs.data && samePath(rs.data.root, root) ? rs.data : null
      const evs = withReleases(diaryEvents(diary, snap.branches), relData ? releaseEvents(relData.items) : [])
      const model = ebenenModel(evs, diary, {
        mainBranch: snap.mainBranch,
        branches: snap.branches,
        current: snap.branch,
        unmerged: snap.unmerged,
        limit: v.events,
        compact: v.compact,
        t,
      })
      // Was jetzt offen ist: in Arbeit (Ordner), nicht hochgeladen (PC), abzuholen (GitHub)
      const unpushedSet = new Set(snap.unpushed)
      const status = new Map<string, IconKind>()
      const working: string[] = []
      const toPush: string[] = []
      const toPull: string[] = []
      diary.folders.forEach((f, i) => {
        if (f.dirty > 0) {
          status.set(`f:${i}`, 'work')
          working.push(`${f.isMain ? t.mainFolder : f.name}: ${t.dirtyFiles(f.dirty)}`)
        }
      })
      for (const tr of diary.track) {
        const never = !tr.upstream && snap.remotes.length > 0 && unpushedSet.has(tr.tip)
        if (tr.ahead > 0 || never) {
          status.set(`b:${tr.branch}`, 'push')
          toPush.push(never ? t.neverPushedBranch(tr.branch) : `${tr.branch}: ${tr.ahead}`)
        }
        if (tr.behind > 0 && tr.upstream) {
          status.set(`r:${tr.upstream}`, 'pull')
          toPull.push(`${tr.branch}: ${tr.behind}`)
        }
      }
      // Die angeklickte Zeile; ohne passende Zeile (im Gleisplan gewählt, oder die Zeile ist
      // inzwischen verschwunden) die erste mit diesem Speicherstand
      const isEvent = (r: EbenenRow): r is Extract<EbenenRow, { kind: 'event' }> => r.kind === 'event'
      let selRow = sel?.row ? model.rows.findIndex(r => isEvent(r) && eventKey(r.ev) === sel.row) : -1
      if (selRow < 0 && sel) selRow = model.rows.findIndex(r => isEvent(r) && r.ev.hash === sel.hash)
      // Angaben zu jeder Spur: Hinweis beim Darüberfahren über den Namen und Infobox „Spuren“
      const infos = spurInfos({
        lanes: model.lanes,
        diary,
        mainBranch: snap.mainBranch,
        unmerged: snap.unmerged,
        otherRepoBranches: snap.otherRepoBranches,
        remoteRepos: snap.remoteRepos ?? {},
        commits: snap.commits,
        unpushed: snap.unpushed,
        hasRemotes: snap.remotes.length > 0,
        repos: relData?.repos ?? [],
        releases: relData?.items ?? [],
        now,
        t,
      })
      const drawing = ebenenSlices(model, {
        status,
        selectedRow: selRow >= 0 ? selRow : null,
        mainBranch: snap.mainBranch,
        t,
        tips: spurTips(infos, t),
      })
      const projectBase = relData ? baseOf(relData.key.slice(relData.key.indexOf('/') + 1)) : null
      const textCols = Math.max(20, e.props.bodyColumns - Math.ceil(drawing.width / 7.5) - SYM - 3)
      const folderName = (i: number | null) =>
        i === null
          ? t.folderGeneric
          : i < 0
            ? t.aFormerFolder
            : diary.folders[i]?.isMain
              ? t.mainFolder
              : (diary.folders[i]?.name ?? t.folderGeneric)
      const nowSymbols: RowEvent[] = []
      if (working.length > 0) {
        nowSymbols.push({ icon: 'work', color: ICON_AMBER, text: t.nowWorkTip(working.join(' · ')) })
      }
      if (toPush.length > 0) {
        nowSymbols.push({ icon: 'push', color: ICON_AMBER, text: t.nowPushTip(toPush.join(' · ')) })
      }
      if (toPull.length > 0) {
        nowSymbols.push({ icon: 'pull', color: ICON_BLUE, text: t.nowPullTip(toPull.join(' · ')) })
      }
      const nowText =
        nowSymbols.length === 0
          ? snap.remotes.length > 0
            ? t.nowAll
            : t.nowAllLocal
          : [
              working.length > 0 ? t.nowWork : '',
              toPush.length > 0 ? t.nowPush : '',
              toPull.length > 0 ? t.nowPull : '',
            ]
              .filter(Boolean)
              .join(' · ')

      const infoOpen = await read($, lanesInfo)
      const platform = infoOpen ? (await $.session.info().catch(() => null))?.platform : undefined
      const LinkEl = 'Link' in ui ? ui.Link : null
      // Infobox „Spuren“: jede gezeichnete Spur mit vollem Namen, Stand, Links und Knöpfen, nach Ebenen
      const lanesBox = (list: SpurInfo[]) => (
        <Box key="spuren-box" flexDirection="column" borderStyle="round" paddingX={1} marginY={1}>
          <Text weight="semibold">{t.info.title}</Text>
          {([3, 0, 1, 2] as const)
            .filter(c => list.some(x => x.col === c))
            .map(c => (
              <Box key={`spuren-ebene-${c}`} flexDirection="column" marginTop={1}>
                <Text color={LEVEL_COLORS[c]} weight="semibold" size="caption">
                  {t.levelTitles[c]}
                </Text>
                {list
                  .filter(x => x.col === c)
                  .map(x => (
                    <Box key={`spur-${x.key}`} flexDirection="column">
                      <Text wrap="wrap">
                        <Text color={x.grey ? INFO_GREY : LEVEL_COLORS[c]}>{'● '}</Text>
                        <Text weight="semibold">{x.name}</Text>
                        <Text dimColor>{` · ${x.what}`}</Text>
                      </Text>
                      {x.facts.length > 0 && (
                        <Box paddingLeft={2}>
                          <Text dimColor size="caption" wrap="wrap">
                            {x.facts.join(' · ')}
                          </Text>
                        </Box>
                      )}
                      {x.path && (
                        <Box paddingLeft={2}>
                          <Text dimColor size="caption" wrap="wrap">
                            {x.path}
                          </Text>
                        </Box>
                      )}
                      {(x.links.length > 0 || x.path) && (
                        <Box flexDirection="row" gap={1} flexWrap="wrap" paddingLeft={2}>
                          {LinkEl &&
                            x.links.map(l => (
                              <Text size="caption">
                                <LinkEl href={l.href}>{l.label}</LinkEl>
                              </Text>
                            ))}
                          {x.links.length > 0 && (
                            <Button
                              key={`spur-adresse-${x.key}`}
                              plain
                              dimColor
                              label={t.info.copyUrl}
                              onPress={press => void copyText($, x.links[0]!.href, press.surface, t.info.urlCopied)}
                            />
                          )}
                          {x.path && (
                            <Button
                              key={`spur-oeffnen-${x.key}`}
                              plain
                              dimColor
                              label={platform === 'windows' ? t.info.explorer : t.info.openFolder}
                              onPress={() => void openFolderAt($, x.path!, t)}
                            />
                          )}
                          {x.path && (
                            <Button
                              key={`spur-pfad-${x.key}`}
                              plain
                              dimColor
                              label={t.info.copyPath}
                              onPress={press => void copyText($, x.path!, press.surface, t.info.pathCopied)}
                            />
                          )}
                        </Box>
                      )}
                    </Box>
                  ))}
              </Box>
            ))}
          <Box marginTop={1}>
            <Button key="spuren-schliessen" label={t.close} onPress={() => void update($, lanesInfo, () => false)} />
          </Box>
        </Box>
      )
      const out: ReturnType<typeof Box>[] = [
        <Box key="ebenen-kopf" flexDirection="row" alignItems="flex-end">
          {/* Bedienbar gezeichnet, damit die Hinweise auf Spurnamen und Spaltentiteln beim Darüberfahren erscheinen */}
          <Svg
            source={drawing.header.svg}
            width={drawing.width}
            height={drawing.header.height}
            alt={t.levelTitles.join(' · ')}
            isInteractive
          />
          <Box width={SYM} />
          <Box flexDirection="column" flexShrink={1} gap={1}>
            <Text dimColor size="caption" wrap="wrap">
              {t.diaryLine}
            </Text>
            <Button key="spuren" plain dimColor={!infoOpen} label={t.info.button} onPress={() => void update($, lanesInfo, x => !x)} />
          </Box>
        </Box>,
      ]
      if (infoOpen) out.push(lanesBox(infos))
      model.rows.forEach((row, i) => {
        const sl = drawing.rows[i]!
        const slice = <Svg source={sl.svg} width={drawing.width} height={sl.height} alt={t.modeLevels} />
        if (row.kind === 'now') {
          out.push(
            <Box key="ebenen-jetzt" flexDirection="row" alignItems="center">
              {slice}
              {symbols('zeichen-jetzt', nowSymbols, 3)}
              <Box flexDirection="column">
                <Text weight="semibold">{t.now}</Text>
                <Text color={nowSymbols.length > 0 ? 'warning' : 'success'} size="caption" wrap="truncate-end">
                  {shorten(nowText, Math.round(textCols * 1.15))}
                </Text>
              </Box>
            </Box>,
          )
          return
        }
        if (row.kind === 'gap') {
          const first = row.events[0]
          out.push(
            <Box key={`ebenen-luecke-${i}`} flexDirection="row" alignItems="center">
              {slice}
              <Box width={SYM} />
              <Button
                key={`luecke-e${i}`}
                plain
                dimColor
                onPress={() => void update($, view, x => ({ ...x, compact: false }))}
              >
                {t.gapEvents(row.events.length, !!first?.pushed)}
              </Button>
            </Box>,
          )
          return
        }
        if (row.kind === 'tail') {
          out.push(
            <Box key="ebenen-ende" flexDirection="row" alignItems="center">
              {slice}
              <Box width={SYM} />
              {row.more ? (
                <Button
                  key="ebenen-mehr"
                  plain
                  dimColor
                  onPress={() => void update($, view, x => ({ ...x, events: x.events + 60 }))}
                >
                  {t.olderEvents}
                </Button>
              ) : (
                <Text dimColor size="caption" wrap="truncate-end">
                  {row.older ? t.olderThanDiary : t.diaryStart}
                </Text>
              )}
            </Box>,
          )
          return
        }
        const ev: DiaryEvent = row.ev
        const { title, detail } = eventLines(ev, folderName, snap.mainBranch, t, diary.remoteNames, projectBase)
        const marks: RowEvent[] = []
        const about = detail ? `${title} – ${detail}` : title
        if (ev.kind === 'merge') marks.push({ icon: 'merge', color: ICON_GREY, text: about })
        if (ev.kind === 'remotemerge') marks.push({ icon: 'merge', color: ICON_BLUE, text: about })
        if (ev.kind === 'create') marks.push({ icon: 'branch', color: ICON_GREY, text: about })
        const date = ago(ev.time, now, t)
        out.push(
          <Box key={`ereignis-zeile-${i}`} flexDirection="row" alignItems="center">
            {slice}
            {symbols(`zeichen-e${i}`, marks)}
            <Box flexDirection="column">
              {ev.kind === 'release' ? (
                // Eine Veröffentlichung hat keinen eigenen Speicherstand zum Aufklappen
                <Text key={`ereignis-${i}`} color={COL_REL} wrap="truncate-end">
                  {shorten(title, textCols)}
                </Text>
              ) : (
                <Button key={`ereignis-${i}`} plain onPress={() => void selectCommit($, root, ev.hash, t, eventKey(ev))}>
                  {shorten(title, textCols)}
                </Button>
              )}
              <Text dimColor size="caption" wrap="truncate-end">
                {shorten(detail ? `${date} · ${detail}` : date, Math.round(textCols * 1.15))}
              </Text>
            </Box>
          </Box>,
        )
        if (sel && i === selRow) {
          const known = snap.commits.find(c => c.hash === ev.hash)
          out.push(
            card(
              known ?? {
                hash: ev.hash,
                parents: [],
                refs: [],
                subject: sel.subject || ev.subject || '—',
                author: sel.author,
                time: sel.time || ev.time,
              },
            ),
          )
        }
      })

      const ebenenLegend = (
        <Box flexDirection="column">
          <Text dimColor size="caption">
            {t.arrowsTitle}
          </Text>
          <Text size="caption" wrap="wrap">
            <Text color={COL_PC} weight="bold">
              {'◀···▶ '}
            </Text>
            <Text dimColor>{t.arrowYellow}</Text>
          </Text>
          <Text size="caption" wrap="wrap">
            <Text color={COL_ORD} weight="bold">
              {'◀···▶ '}
            </Text>
            <Text dimColor>{t.arrowGreen}</Text>
          </Text>
          {model.lanes.some(l => l.col === 3) && (
            <Text size="caption" wrap="wrap">
              <Text color={COL_REL} weight="bold">
                {'◀···● '}
              </Text>
              <Text dimColor>{t.rel.legend}</Text>
            </Text>
          )}
          {iconLegend.slice(0, 3).map(l => (
            <Box flexDirection="row" gap={1} alignItems="center">
              {icon(l.kind, l.color, 15)}
              <Text dimColor size="caption" wrap="wrap">
                {l.text}
              </Text>
            </Box>
          ))}
          <Text dimColor size="caption" wrap="wrap">
            {t.levelsLegend}
            {model.hidden > 0 ? t.hiddenEvents(model.hidden) : ''}
          </Text>
        </Box>
      )

      // Unter der Ansicht: welche GitHub-Ablagen dazugehören, und der Knopf, der Claude fragt
      const r = t.rel
      const busyText = rs.busy === 'checking' ? r.checking : rs.busy === 'loading' ? r.loading : null
      const ablagen =
        relData || (busyText && rs.error !== 'no-github') ? (
          <Box key="ablagen" flexDirection="column">
            {relData && (
              <Text size="caption" wrap="wrap">
                <Text dimColor>{`${r.reposTitle}: `}</Text>
                {relData.repos.map(x => `${x.name.slice(x.name.indexOf('/') + 1)} (${r.role[x.role]})`).join(', ')}
              </Text>
            )}
            {relData && (
              <Text dimColor size="caption" wrap="wrap">
                {relData.checkedAt !== null ? r.checked(ago(Math.floor(relData.checkedAt / 1000), now, t)) : r.guessed}
              </Text>
            )}
            {relData?.newRepos.length ? (
              <Text color="warning" size="caption" wrap="wrap">
                {r.newRepos(relData.newRepos)}
              </Text>
            ) : null}
            {relData?.failed.map(f => (
              <Text color="warning" size="caption" wrap="wrap">
                {r.failedRepo(f.repo, r.reason(f.reason))}
              </Text>
            ))}
            {busyText && (
              <Text dimColor size="caption" wrap="wrap">
                {busyText}
              </Text>
            )}
            {rs.error && rs.error !== 'no-github' && (
              <Text color="warning" size="caption" wrap="wrap">
                {rs.error}
              </Text>
            )}
          </Box>
        ) : null
      const ebenenButtons = makeButtons(model.hasMore)

      return (
        <Box flexDirection="column" gap={1}>
          {header}
          {projectButtons}
          {modeSwitch}
          <Box flexDirection="column" gap={0}>
            {out}
          </Box>
          {ebenenLegend}
          {ablagen}
          {relData ? (
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              {ebenenButtons}
              <Button
                key="projekt-aktualisieren"
                label={r.update}
                onPress={() => {
                  if (rs.busy === 'checking') $.ui.toast(r.busy)
                  else void loadReleases($, { check: true, force: true })
                }}
              />
            </Box>
          ) : (
            ebenenButtons
          )}
        </Box>
      )
    }

    // Steht der Hauptzweig hier nur zurück, beginnt das Hauptgleis beim GitHub-Stand (Abzuholendes oben)
    const preferRemote = snap.branch === snap.mainBranch && snap.behind > 0 && snap.ahead === 0
    const lay = layout(snap.commits, findMainTip(snap.commits, snap.mainBranch, snap.head, preferRemote))
    const unpushed = new Set(snap.unpushed)
    const unpulled = new Set(snap.unpulled)
    const infos = laneInfos(snap.commits, lay, snap.mainBranch, t)
    const events = rowEvents(snap.commits, lay, infos, unpushed, unpulled, t)
    const plan = planSlices(snap.commits, lay, {
      head: snap.head,
      mainBranch: snap.mainBranch,
      compact: v.compact,
      unmerged: snap.unmerged,
      selected: sel?.hash ?? null,
      unpushed,
      unpulled,
      dirty: dirty > 0,
    })
    // Platz für den Text neben Gleisbild und Zeichen, in Zeichen; lieber knapp, damit keine Zeile umbricht
    const laneCells = Math.ceil(plan.width / 7.5)
    const textCols = Math.max(24, e.props.bodyColumns - laneCells - SYM - 6)

    const lanesShown = [...infos.values()].sort((a, b) => a.id - b.id)
    const colorLegend = (
      <Box flexDirection="column">
        <Text dimColor size="caption">
          {t.colorTitle}
        </Text>
        {lanesShown.slice(0, 8).map(l => (
          <Text size="caption" wrap="truncate-end">
            <Text color={laneText(l.color)} weight="bold">
              ━━{' '}
            </Text>
            {l.name || (l.id === 0 ? t.laneMain : t.laneUnnamed)}
            <Text dimColor>
              {l.id === 0 ? t.laneIsMain : l.merged ? t.laneMerged : t.laneUnmerged}
            </Text>
          </Text>
        ))}
        {lanesShown.length > 8 && (
          <Text dimColor size="caption">
            {t.andMore(lanesShown.length - 8)}
          </Text>
        )}
      </Box>
    )

    const rows: ReturnType<typeof Box>[] = []
    for (const sr of plan.rows) {
      const slice = <Svg source={sr.svg} width={plan.width} height={sr.height} alt={t.modePlan} />
      if (sr.kind === 'tail') {
        rows.push(<Box flexDirection="row">{slice}</Box>)
        continue
      }
      if (sr.kind === 'work') {
        const parts = [
          snap.changed > 0 ? t.filesChanged(snap.changed) : '',
          snap.untracked > 0 ? t.filesNew(snap.untracked) : '',
        ].filter(Boolean)
        rows.push(
          <Box key="zeile-arbeit" flexDirection="row" alignItems="center">
            {slice}
            {symbols('zeichen-arbeit', [
              {
                icon: 'work',
                color: ICON_AMBER,
                text: t.workTip,
              },
            ])}
            <Text color="warning" wrap="truncate-end">
              {shorten(t.workRow(parts.join(', ')), textCols)}
            </Text>
          </Box>,
        )
        continue
      }
      if (sr.kind === 'gap') {
        rows.push(
          <Box key={`luecke-${sr.first}`} flexDirection="row" alignItems="center">
            {slice}
            <Box width={SYM} />
            {sr.count > 1 && (
              <Button
                key={`luecke-${sr.first}`}
                plain
                dimColor
                onPress={() => void update($, view, x => ({ ...x, compact: false }))}
              >
                {t.gapRow(sr.count)}
              </Button>
            )}
          </Box>,
        )
        continue
      }
      const c = snap.commits[sr.row]!
      const color = lay.colors[sr.row] ?? 0
      const date = ago(c.time, now, t)
      const info = infos.get(lay.ids[sr.row] ?? 0)
      const laneName =
        info && info.id !== 0 && info.top === sr.row && info.name && !c.refs.some(r => r.kind === 'local')
          ? info.name
          : null
      const pills = pillsFor(c, color, new Set(sr.sidings), snap, laneName, t)
      const shown = pills.slice(0, 3)
      const pillChars = shown.reduce((n, p) => n + [...p.label].length + 3, 0) + (pills.length > 3 ? 4 : 0)
      const subject = shorten(c.subject, Math.max(8, textCols - pillChars - date.length - 2))
      const isHead = c.hash === snap.head
      rows.push(
        <Box key={`zeile-${c.hash}`} flexDirection="row" alignItems="center">
          {slice}
          {symbols(`zeichen-${c.hash}`, events[sr.row] ?? [])}
          <Button key={`halt-${c.hash}`} plain onPress={() => void selectCommit($, root, c.hash, t)}>
            {shown.map(p =>
              p.bg ? (
                <Text backgroundColor={p.bg} color={p.fg} weight="semibold" mono={p.mono}>
                  {` ${p.label} `}
                </Text>
              ) : (
                <Text color={p.fg} dimColor={p.dim} weight="semibold">
                  {p.label}
                </Text>
              ),
            )}
            {pills.length > 3 ? <Text dimColor>{` +${pills.length - 3}`}</Text> : ''}
            {shown.length > 0 ? ' ' : ''}
            <Text weight={isHead ? 'bold' : 'regular'}>{subject}</Text>
            <Text dimColor>{`  ${date}`}</Text>
          </Button>
        </Box>,
      )
      if (sel?.hash === c.hash) rows.push(card(c))
    }

    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {projectButtons}
        {modeSwitch}
        {worktrees}
        <Box flexDirection="column" gap={0}>
          {rows}
        </Box>
        {colorLegend}
        {legend}
        {buttons}
      </Box>
    )
  })
}
