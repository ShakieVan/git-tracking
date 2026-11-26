/**
 * Veröffentlichungen und Betas für die Ebene „Veröffentlicht“: welche GitHub-Ablagen zu einem
 * Projekt gehören und was dort veröffentlicht wurde. Nur reine Funktionen; das Lesen
 * (git, gh, GitHub, Claude) steht in register.tsx.
 */
import type { ProjectRepo, ReleaseItem, ReleaseKind, RepoRole } from '../types'

/** Eine Ablage desselben Besitzers bei GitHub (aus gh repo list oder der GitHub-Schnittstelle) */
export type OwnerRepo = { name: string; description: string; isPrivate: boolean; isArchived: boolean }
/** Eine Gegenstelle in Git, die zu GitHub zeigt */
export type Remote = { remote: string; name: string }

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/
export const sameRepo = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const cut = (s: string, n: number) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join('') + '…')

/** owner/repo aus einer GitHub-Adresse (https oder ssh); null für andere Adressen */
export function parseGithubUrl(url: string): string | null {
  const m = /github\.com[:/]+([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i.exec(url.trim())
  return m ? `${m[1]}/${m[2]}` : null
}

/** Liest `git remote -v`: die GitHub-Gegenstellen, origin zuerst, jede Ablage einmal */
export function parseRemotes(out: string): Remote[] {
  const seen = new Set<string>()
  const list: Remote[] = []
  for (const line of out.replace(/\r/g, '').split('\n')) {
    const m = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim())
    if (!m || m[3] !== 'fetch') continue
    const name = parseGithubUrl(m[2]!)
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    list.push({ remote: m[1]!, name })
  }
  return list.sort((a, b) => Number(b.remote === 'origin') - Number(a.remote === 'origin'))
}

/** Gegenstelle → Name der Ablage (git-tracking aus github.com/ShakieVan/git-tracking); andere Adressen: der Name der Gegenstelle */
export function remoteRepoNames(out: string): Record<string, string> {
  const names: Record<string, string> = {}
  for (const line of out.replace(/\r/g, '').split('\n')) {
    const m = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line.trim())
    if (!m) continue
    const gh = parseGithubUrl(m[2]!)
    names[m[1]!] = gh ? gh.slice(gh.indexOf('/') + 1) : m[1]!
  }
  return names
}

/** Gegenstelle → owner/repo, nur für Gegenstellen, die zu GitHub zeigen (für Links auf github.com) */
export function remoteGithubRepos(out: string): Record<string, string> {
  const repos: Record<string, string> = {}
  for (const line of out.replace(/\r/g, '').split('\n')) {
    const m = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line.trim())
    const gh = m ? parseGithubUrl(m[2]!) : null
    if (m && gh) repos[m[1]!] = gh
  }
  return repos
}

/** Trägt privat/öffentlich aus der Liste des Besitzers ein; Ablagen, die dort fehlen, bleiben unbekannt */
export function withVisibility(repos: ProjectRepo[], owner: string, owned: OwnerRepo[] | null): ProjectRepo[] {
  if (!owned) return repos
  return repos.map(r => {
    const found = owned.find(o => sameRepo(`${owner}/${o.name}`, r.name))
    return found ? { ...r, isPrivate: found.isPrivate } : r
  })
}

/**
 * Lokale Zweige, die in eine andere GitHub-Ablage als origin gehen (z. B. „oeffentlich“ → git-tracking):
 * eingetragen als Gegenstück, oder sie stehen auf demselben Speicherstand wie ein Zweig dort.
 * `rows` aus `for-each-ref --format=%(refname)%09%(objectname)%09%(upstream) refs/heads refs/remotes`.
 */
export function branchesForOtherRepos(
  rows: { ref: string; obj: string; up: string }[],
  mainBranch: string | null,
  remoteNames: Record<string, string>,
): Record<string, string> {
  const remoteOf = (ref: string) => {
    const m = /^refs\/remotes\/([^/]+)\/(.+)$/.exec(ref)
    return m && m[1] !== 'origin' && m[2] !== 'HEAD' ? m[1]! : null
  }
  const out: Record<string, string> = {}
  for (const r of rows) {
    if (!r.ref.startsWith('refs/heads/')) continue
    const b = r.ref.slice(11)
    if (b === mainBranch) continue
    let remote = r.up ? remoteOf(r.up) : null
    if (!remote && !r.up && r.obj) {
      const same = rows.find(x => x.obj === r.obj && remoteOf(x.ref))
      remote = same ? remoteOf(same.ref) : null
    }
    if (remote) out[b] = remoteNames[remote] ?? remote
  }
  return out
}

const BETA_WORDS = /(^|[-_.])(beta|betas|test|testing|preview|nightly|canary|alpha|rc)([-_.]|$)/i
const RELEASE_WORDS = /(^|[-_.])(release|releases|public|dist|download|downloads)([-_.]|$)/i
const DEV_SUFFIX = /[-_.](development|dev|private|source|src)$/i

/** Der Projektname ohne Endung wie „-Development“: Spiel, Uhr-App … */
export const baseOf = (repo: string) => repo.replace(DEV_SUFFIX, '')

/** Rolle nach dem Namen: „…-Beta“ = Betas, gleicher Name wie die Entwicklungsablage ohne Endung = Veröffentlichungen */
export function roleFromName(repo: string, base: string): RepoRole {
  const rest = repo.slice(base.length)
  if (rest === '' || RELEASE_WORDS.test(rest)) return 'release'
  if (BETA_WORDS.test(rest)) return 'beta'
  return 'other'
}

/**
 * Gehört die Ablage zu einem anderen Projekt? Ja, wenn sie die Quellcode-Ablage (origin) eines
 * Nachbarordners ist, oder wenn sie wie eine Entwicklungsablage heißt („…-Development“), aber einen
 * anderen Grundnamen hat (Uhr-App-Windows-Development gehört nicht zu Uhr-App-Development).
 * `foreign` = owner/repo der origins der Nachbarordner (ohne Klone dieses Projekts).
 */
export function isOtherProject(name: string, mainName: string, foreign: readonly string[]): boolean {
  if (sameRepo(name, mainName)) return false
  if (foreign.some(f => sameRepo(f, name))) return true
  const repo = name.slice(name.indexOf('/') + 1)
  const mainRepo = mainName.slice(mainName.indexOf('/') + 1)
  return DEV_SUFFIX.test(repo) && baseOf(repo).toLowerCase() !== baseOf(mainRepo).toLowerCase()
}

/** Lässt Ablagen anderer Projekte weg (auch aus Claudes Antwort und gemerkten Listen); Gegenstellen aus Git bleiben immer */
export function dropOtherProjects(repos: ProjectRepo[], remotes: Remote[], foreign: readonly string[]): ProjectRepo[] {
  const main = remotes[0]
  if (!main) return repos
  return repos.filter(r => remotes.some(x => sameRepo(x.name, r.name)) || !isOtherProject(r.name, main.name, foreign))
}

/**
 * Die origins der Git-Ordner neben dem Projekt aus deren `.git/config` (owner/repo). Ordner mit
 * derselben origin wie das Projekt (Klone davon) zählen nicht, sonst würde eine zweite Ablage
 * des Projekts in so einem Klon als „fremd“ gelten.
 */
export function foreignOrigins(configs: string[], mainName: string): string[] {
  const out: string[] = []
  for (const text of configs) {
    const origin = gitConfigOrigin(text)
    if (origin && !sameRepo(origin, mainName) && !out.some(o => sameRepo(o, origin))) out.push(origin)
  }
  return out
}

/** owner/repo der Gegenstelle origin aus dem Text einer `.git/config`; null ohne GitHub-origin */
export function gitConfigOrigin(text: string): string | null {
  let inOrigin = false
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    if (line.startsWith('[')) {
      inOrigin = /^\[remote\s+"origin"\]$/.test(line)
      continue
    }
    const m = inOrigin ? /^url\s*=\s*(\S+)$/.exec(line) : null
    if (m) return parseGithubUrl(m[1]!)
  }
  return null
}

/**
 * Die Vermutung ohne Claude: die GitHub-Gegenstellen in Git, dazu Ablagen desselben
 * Besitzers mit passendem Namen (Spiel → Spiel-Beta, Uhr-App-Development → Uhr-App),
 * ohne die Ablagen anderer Projekte (isOtherProject).
 */
export function guessRepos(remotes: Remote[], owned: OwnerRepo[] | null, foreign: readonly string[] = []): ProjectRepo[] {
  const out: ProjectRepo[] = remotes.map((r, i) => ({
    name: r.name,
    role: i === 0 ? 'code' : RELEASE_WORDS.test(r.remote) ? 'release' : 'other',
    source: 'git',
    why: '',
  }))
  const main = remotes[0]
  if (!main || !owned) return out
  const [owner, repo] = main.name.split('/') as [string, string]
  const base = baseOf(repo).toLowerCase()
  for (const o of owned) {
    const n = o.name.toLowerCase()
    const full = `${owner}/${o.name}`
    if (o.isArchived || out.some(x => sameRepo(x.name, full))) continue
    const rest = n.slice(base.length)
    if (!n.startsWith(base) || (rest !== '' && !/^[-_.]/.test(rest))) continue
    if (isOtherProject(full, main.name, foreign)) continue
    out.push({ name: full, role: roleFromName(n, base), source: 'name', why: cut(o.description, 160) })
  }
  return out
}

/**
 * Die Ablagen mit ähnlichem Namen, die zu einem anderen Projekt gehören (für Claudes Prüfung:
 * „diese nicht dazunehmen“).
 */
export function otherProjectRepos(remotes: Remote[], owned: OwnerRepo[] | null, foreign: readonly string[]): string[] {
  const main = remotes[0]
  if (!main || !owned) return []
  const [owner, repo] = main.name.split('/') as [string, string]
  const base = baseOf(repo).toLowerCase()
  return owned
    .map(o => `${owner}/${o.name}`)
    .filter(full => full.toLowerCase().slice(owner.length + 1).startsWith(base) && isOtherProject(full, main.name, foreign))
}

/** Stellt sicher, dass jede Gegenstelle aus Git in der Liste steht (die Haupt-Ablage als Quellcode) */
export function withRemotes(repos: ProjectRepo[], remotes: Remote[]): ProjectRepo[] {
  const out = repos.slice()
  remotes.forEach((r, i) => {
    if (out.some(x => sameRepo(x.name, r.name))) return
    out.splice(i, 0, { name: r.name, role: i === 0 ? 'code' : 'other', source: 'git', why: '' })
  })
  return out
}

/** Suchmuster für git grep: Nennungen von Ablagen dieses Besitzers (owner/irgendwas) */
export const grepPattern = (owner: string) => `${owner.replace(/[^A-Za-z0-9-]/g, '.')}/[A-Za-z0-9._-]+`

const KEY_WORDS = /beta|release|repositor|update|publish|download|veröffentl|github\.com/i

/**
 * Wählt aus der Ausgabe von `git grep -n` die Zeilen für Claude: jede Zeile einmal,
 * höchstens 6 je Datei, Zeilen mit Stichworten (Beta, Release, Update …) zuerst.
 */
export function pickEvidence(stdout: string, max = 80): string[] {
  const seen = new Set<string>()
  const perFile = new Map<string, number>()
  const rows: { line: string; score: number; i: number }[] = []
  stdout
    .replace(/\r/g, '')
    .split('\n')
    .forEach((raw, i) => {
      if (!raw.trim()) return
      const m = /^(.*?):(\d+):(.*)$/.exec(raw)
      const file = m ? m[1]! : ''
      const text = (m ? m[3]! : raw).trim()
      const key = text.toLowerCase()
      if (!text || seen.has(key)) return
      seen.add(key)
      const n = (perFile.get(file) ?? 0) + 1
      perFile.set(file, n)
      if (n > 6) return
      const short = cut(text, 200)
      rows.push({ line: m ? `${file}:${m[2]}: ${short}` : short, score: KEY_WORDS.test(text) ? 0 : 1, i })
    })
  return rows
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .slice(0, max)
    .map(r => r.line)
}

export type CheckInput = {
  project: string
  remotes: Remote[]
  /** Die Vermutung (Gegenstellen und Ablagen mit passendem Namen) */
  candidates: ProjectRepo[]
  /** Zeilen aus den Projektdateien, die Ablagen nennen */
  evidence: string[]
  /** Ablagen mit ähnlichem Namen, die die Quellcode-Ablage eines anderen Projekts sind */
  otherProjects?: string[]
  lang: 'de' | 'en'
}

/** Die Frage an Claude: welche Ablagen gehören dazu, und wofür */
export function checkPrompt(p: CheckInput): { system: string; prompt: string } {
  const language = p.lang === 'de' ? 'German' : 'English'
  const system = [
    'You help a Git overview tool. Decide which GitHub repositories belong to one software project and what each one is used for.',
    'Use only the facts given. Answer with JSON only, no other text, in exactly this shape:',
    '{"repos":[{"name":"owner/repo","role":"code","why":"..."}]}',
    'Roles: "code" = the project\'s source code is pushed there (a git remote); "release" = finished versions are published there for download;',
    '"beta" = test or pre-release versions are published there; "other" = clearly part of this project but none of these (for example a server or data repository).',
    'If one repository holds both the source code and the finished releases, use "code".',
    'Leave out repositories that are only mentioned (libraries, examples, other projects of the same owner).',
    `"why" is one short sentence in ${language}, at most 15 words, that names the evidence (a file or a fact).`,
  ].join('\n')
  const remotes = p.remotes.map(r => `- ${r.remote} → ${r.name}`)
  const similar = p.candidates.filter(c => c.source === 'name').map(c => `- ${c.name}${c.why ? `: "${c.why}"` : ''}`)
  const owner = p.remotes[0]?.name.split('/')[0] ?? ''
  const prompt = [
    `Project folder: ${p.project}`,
    '',
    'Git remotes of the project (source code is pushed there):',
    ...(remotes.length > 0 ? remotes : ['- none']),
    '',
    `Repositories of ${owner || 'the same owner'} on GitHub with a similar name:`,
    ...(similar.length > 0 ? similar : ['- none']),
    '',
    `Lines in the project's files that name repositories of ${owner || 'this owner'} (file:line: text):`,
    ...(p.evidence.length > 0 ? p.evidence : ['- none found']),
    ...(p.otherProjects && p.otherProjects.length > 0
      ? [
          '',
          'These repositories are the source code of OTHER projects (a separate project folder on this computer, or a development repository of another product). Leave them out:',
          ...p.otherProjects.map(n => `- ${n}`),
        ]
      : []),
  ].join('\n')
  return { system, prompt }
}

/** Liest Claudes Antwort; null, wenn sie kein lesbares JSON enthält */
export function parseCheckAnswer(text: string): ProjectRepo[] | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let data: unknown
  try {
    data = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  const list = data && typeof data === 'object' ? (data as { repos?: unknown }).repos : undefined
  if (!Array.isArray(list)) return null
  const out: ProjectRepo[] = []
  for (const x of list) {
    if (!x || typeof x !== 'object') continue
    const { name, role, why } = x as Record<string, unknown>
    if (typeof name !== 'string') continue
    const n = name.trim()
    if (!NAME_RE.test(n) || out.some(o => sameRepo(o.name, n))) continue
    const r: RepoRole = role === 'code' || role === 'release' || role === 'beta' || role === 'other' ? role : 'other'
    out.push({ name: n, role: r, source: 'claude', why: typeof why === 'string' ? cut(why.trim(), 160) : '' })
  }
  return out
}

// ---------------------------------------------------------------- Lesen von GitHub

const parseJson = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** gh repo list … --json name,description,visibility,isArchived */
export function parseGhRepoList(json: string): OwnerRepo[] | null {
  const data = parseJson(json)
  if (!Array.isArray(data)) return null
  return data
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { name?: unknown }).name === 'string')
    .map(x => ({
      name: str(x.name),
      description: str(x.description),
      isPrivate: str(x.visibility).toUpperCase() === 'PRIVATE',
      isArchived: x.isArchived === true,
    }))
}

/** GET /users/<owner>/repos */
export function parseApiRepoList(json: string): OwnerRepo[] | null {
  const data = parseJson(json)
  if (!Array.isArray(data)) return null
  return data
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { name?: unknown }).name === 'string')
    .map(x => ({ name: str(x.name), description: str(x.description), isPrivate: x.private === true, isArchived: x.archived === true }))
}

/** Sekunden seit 1970; 0 für fehlende Zeiten und GitHubs „0001-01-01“ bei Entwürfen */
const toSec = (iso: string) => {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
}

function releaseItem(
  repo: string,
  role: RepoRole,
  tag: string,
  title: string,
  pre: boolean,
  draft: boolean,
  published: string,
  created: string,
): ReleaseItem {
  const kind: ReleaseKind = draft ? 'draft' : pre || role === 'beta' ? 'beta' : 'release'
  return { repo, tag, title: title || tag, kind, time: (!draft && toSec(published)) || toSec(created) }
}

/** gh release list … --json tagName,name,isPrerelease,isDraft,publishedAt,createdAt */
export function parseGhReleases(json: string, repo: string, role: RepoRole): ReleaseItem[] | null {
  const data = parseJson(json)
  if (!Array.isArray(data)) return null
  return data
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map(x =>
      releaseItem(repo, role, str(x.tagName), str(x.name), x.isPrerelease === true, x.isDraft === true, str(x.publishedAt), str(x.createdAt)),
    )
    .filter(i => i.tag)
}

/** GET /repos/<owner>/<repo>/releases */
export function parseApiReleases(json: string, repo: string, role: RepoRole): ReleaseItem[] | null {
  const data = parseJson(json)
  if (!Array.isArray(data)) return null
  return data
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map(x =>
      releaseItem(repo, role, str(x.tag_name), str(x.name), x.prerelease === true, x.draft === true, str(x.published_at), str(x.created_at)),
    )
    .filter(i => i.tag)
}

