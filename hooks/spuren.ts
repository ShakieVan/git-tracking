/**
 * Angaben zu jeder Spur der Drei-Ebenen-Ansicht: für den Hinweis beim Darüberfahren über den
 * Spurnamen und für die Infobox „Spuren“ (voller Name, was es ist, Stand, Links). Nur reine
 * Funktionen; gelesen wird in register.tsx.
 */
import type { GleisCommit, GleisDiary, ProjectRepo, ReleaseItem } from '../types'
import { sameRepo } from './ablagen'
import type { EbenenLane } from './ebenen'
import { ago } from './graph'
import type { Texts } from './i18n'

export type SpurLink = { label: string; href: string }

export type SpurInfo = {
  /** Schlüssel der Spur (r:…, b:…, f:…, v:…); „deleted“ = die gemeinsame Spur aller gelöschten Zweige */
  key: string
  /** 0 = GitHub, 1 = PC, 2 = Ordner, 3 = Veröffentlicht */
  col: 0 | 1 | 2 | 3
  /** Voller Name, wie die Spur heißt */
  name: string
  /** Was es ist, z. B. „Zweig main der Ablage Tester/Spiel“ */
  what: string
  /** Stand, je eine kurze Angabe */
  facts: string[]
  /** Links zu GitHub, der erste ist der wichtigste (den kopiert „Adresse kopieren“) */
  links: SpurLink[]
  /** Pfad eines Ordners, sonst null */
  path: string | null
  /** Grau gezeichnet (gelöscht, frühere Ordner) */
  grey: boolean
}

export type SpurInput = {
  lanes: EbenenLane[]
  diary: GleisDiary
  mainBranch: string | null
  /** Lokale Zweige, die noch nicht in den Hauptzweig zusammengeführt sind */
  unmerged: string[]
  /** Zweig → Name der anderen Ablage, in die er hochgeladen wird */
  otherRepoBranches: Record<string, string>
  /** Gegenstelle → owner/repo bei GitHub */
  remoteRepos: Record<string, string>
  commits: GleisCommit[]
  /** Speicherstände, die nur hier liegen */
  unpushed: string[]
  /** Hat das Projekt überhaupt eine Gegenstelle? */
  hasRemotes: boolean
  /** Ablagen des Projekts bei GitHub (Rolle, privat/öffentlich) */
  repos: ProjectRepo[]
  releases: ReleaseItem[]
  /** ms seit 1970 */
  now: number
  t: Texts
}

/** Reihenfolge der Spalten wie in der Zeichnung: Veröffentlicht (falls da), GitHub, PC, Ordner */
const ORDER: (0 | 1 | 2 | 3)[] = [3, 0, 1, 2]

const cutText = (s: string, n: number) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join('') + '…')
/** Zweignamen mit „/“ bleiben in der Adresse lesbar: nur die Teile kodieren */
const encBranch = (b: string) => b.split('/').map(encodeURIComponent).join('/')
const repoUrl = (repo: string) => `https://github.com/${repo}`

/** Die Angaben zu allen gezeichneten Spuren, in der Reihenfolge der Zeichnung */
export function spurInfos(inp: SpurInput): SpurInfo[] {
  const { t } = inp
  const i = t.info
  const out: SpurInfo[] = []
  const when = (sec: number) => ago(sec, inp.now, t)
  const visibility = (repo: string) => {
    const r = inp.repos.find(x => sameRepo(x.name, repo))
    return r?.isPrivate === true ? i.isPrivate : r?.isPrivate === false ? i.isPublic : ''
  }
  /** Neuester Eintrag im Tagebuch eines Zeigers, der zu `test` passt */
  const latest = (ref: string, test: (msg: string) => boolean) =>
    inp.diary.entries.filter(e => e.ref === ref && test(e.msg)).reduce<number | null>((m, e) => (m === null || e.time > m ? e.time : m), null)

  for (const col of ORDER) {
    const lanes = inp.lanes.filter(l => l.col === col)
    for (const l of lanes) {
      if (l.deleted) continue
      if (col === 3) out.push(releaseInfo(l, inp, visibility, when))
      else if (col === 0) out.push(remoteInfo(l, inp, visibility, when, latest))
      else if (col === 1) out.push(branchInfo(l, inp, when))
      else out.push(folderInfo(l, inp))
    }
    // Gelöschte Zweige teilen sich eine graue Spur: eine Angabe mit allen Namen
    const gone = lanes.filter(l => l.deleted).map(l => l.name)
    if (col === 1 && gone.length > 0) {
      out.push({ key: 'deleted', col: 1, name: t.deletedLane, what: i.deletedWhat, facts: [gone.join(', ')], links: [], path: null, grey: true })
    }
  }
  return out
}

function releaseInfo(
  l: EbenenLane,
  inp: SpurInput,
  visibility: (repo: string) => string,
  when: (sec: number) => string,
): SpurInfo {
  const i = inp.t.info
  const repo = l.key.slice(2)
  const r = inp.repos.find(x => sameRepo(x.name, repo))
  const items = inp.releases.filter(x => sameRepo(x.repo, repo) && x.kind !== 'draft' && x.time > 0)
  const newest = items.reduce<ReleaseItem | null>((m, x) => (!m || x.time > m.time ? x : m), null)
  const what = [repo, r ? inp.t.rel.role[r.role] : '', visibility(repo)].filter(Boolean).join(' · ')
  const facts: string[] = []
  if (items.length > 0) facts.push(i.releasesCount(items.length))
  if (newest) facts.push(i.newest(newest.tag, newest.kind === 'beta', when(newest.time)))
  if (r?.why) facts.push(cutText(r.why, 120))
  return {
    key: l.key,
    col: 3,
    name: l.name,
    what,
    facts,
    links: [
      { label: i.openReleases, href: `${repoUrl(repo)}/releases` },
      { label: i.openRepo, href: repoUrl(repo) },
    ],
    path: null,
    grey: false,
  }
}

function remoteInfo(
  l: EbenenLane,
  inp: SpurInput,
  visibility: (repo: string) => string,
  when: (sec: number) => string,
  latest: (ref: string, test: (msg: string) => boolean) => number | null,
): SpurInfo {
  const i = inp.t.info
  const id = l.key.slice(2)
  const slash = id.indexOf('/')
  const remote = slash < 0 ? id : id.slice(0, slash)
  const branch = slash < 0 ? id : id.slice(slash + 1)
  const repo = inp.remoteRepos[remote] ?? null
  const vis = repo ? visibility(repo) : ''
  const what = [i.remoteBranch(branch, repo ?? remote), vis].filter(Boolean).join(' · ')
  const facts: string[] = []
  const isMain = remote === 'origin' && branch === inp.mainBranch
  if (isMain) facts.push(i.mainBranchGitHub)
  if (!l.exists) facts.push(i.goneRemote)
  const unmerged = inp.diary.unmergedRemote.includes(id)
  if (unmerged && inp.mainBranch) facts.push(i.notMerged(inp.mainBranch))
  const pushed = latest(`remotes/${id}`, m => /^update by push/.test(m))
  if (pushed !== null) facts.push(i.lastPushed(when(pushed)))
  const fetched = latest(`remotes/${id}`, m => /^(fetch|pull)/.test(m))
  if (fetched !== null) facts.push(i.lastFetched(when(fetched)))
  const local = inp.diary.track.find(tr => tr.upstream === id)
  if (local) {
    facts.push(i.localCounterpart(local.branch))
    if (local.behind > 0) facts.push(i.behind(local.behind))
  }
  const links: SpurLink[] = []
  if (repo && l.exists) {
    links.push({ label: i.openBranch, href: `${repoUrl(repo)}/tree/${encBranch(branch)}` })
    if (unmerged && inp.mainBranch && branch !== inp.mainBranch) {
      links.push({ label: i.compare(inp.mainBranch), href: `${repoUrl(repo)}/compare/${encBranch(inp.mainBranch)}...${encBranch(branch)}` })
    }
  } else if (repo) {
    links.push({ label: i.openRepo, href: repoUrl(repo) })
  }
  return { key: l.key, col: 0, name: l.name, what, facts, links, path: null, grey: false }
}

function branchInfo(l: EbenenLane, inp: SpurInput, when: (sec: number) => string): SpurInfo {
  const i = inp.t.info
  const b = l.key.slice(2)
  const isMain = b === inp.mainBranch
  const tr = inp.diary.track.find(x => x.branch === b)
  const facts: string[] = []
  const other = inp.otherRepoBranches[b]
  if (tr?.upstream) facts.push(i.upstream(tr.upstream))
  else if (other) facts.push(i.forRepo(other))
  else if (tr) facts.push(inp.hasRemotes && inp.unpushed.includes(tr.tip) ? i.neverPushed : i.localOnly)
  if (tr && tr.ahead > 0) facts.push(i.ahead(tr.ahead))
  if (tr && tr.behind > 0) facts.push(i.behind(tr.behind))
  if (tr?.upstream && tr.ahead === 0 && tr.behind === 0) facts.push(i.inSync)
  if (!isMain && !other && inp.mainBranch) {
    facts.push(inp.unmerged.includes(b) ? i.notMerged(inp.mainBranch) : i.merged(inp.mainBranch))
  }
  const folders = inp.diary.folders.filter(f => f.branch === b).map(f => (f.isMain ? inp.t.mainFolder : f.name))
  if (folders.length > 0) facts.push(i.inFolder(folders.join(', ')))
  const tip = tr ? inp.commits.find(c => c.hash === tr.tip) : undefined
  if (tip) facts.push(i.lastCommit(cutText(tip.subject, 60), when(tip.time)))
  // Link zum Gegenstück bei GitHub
  const links: SpurLink[] = []
  const up = tr?.upstream ?? null
  const upSlash = up ? up.indexOf('/') : -1
  const upRepo = up && upSlash > 0 ? inp.remoteRepos[up.slice(0, upSlash)] : undefined
  if (up && upRepo) links.push({ label: i.openBranch, href: `${repoUrl(upRepo)}/tree/${encBranch(up.slice(upSlash + 1))}` })
  return { key: l.key, col: 1, name: l.name, what: isMain ? i.branchMain : i.branchDev, facts, links, path: null, grey: false }
}

function folderInfo(l: EbenenLane, inp: SpurInput): SpurInfo {
  const i = inp.t.info
  const n = Number(l.key.slice(2))
  const f = n >= 0 ? inp.diary.folders[n] : undefined
  if (!f) return { key: l.key, col: 2, name: l.name, what: i.formerWhat, facts: [], links: [], path: null, grey: true }
  const facts = [f.branch ? i.onBranch(f.branch) : i.detached, f.dirty > 0 ? i.dirty(f.dirty) : i.clean]
  return { key: l.key, col: 2, name: l.name, what: f.isMain ? i.folderMain : i.folderExtra, facts, links: [], path: f.path, grey: false }
}

/** Text des Hinweises beim Darüberfahren über einen Spurnamen (Zeilen getrennt mit \n) */
export function spurTip(info: SpurInfo, t: Texts): string {
  const level = t.levelTitles[info.col] ?? ''
  return [info.name, `${level} · ${info.what}`, ...info.facts.slice(0, 4), ...(info.path ? [info.path] : []), t.info.tipHint].join('\n')
}

/** Die Hinweise für die Zeichnung: Spur → Text */
export function spurTips(infos: SpurInfo[], t: Texts): Map<string, string> {
  return new Map(infos.map(x => [x.key, spurTip(x, t)]))
}
