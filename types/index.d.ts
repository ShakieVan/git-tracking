/** Ein Zeiger an einem Speicherstand: Zweig, GitHub-Zweig, Versionsschild … */
export type GleisRef = {
  /** local = Entwicklungszweig hier, remote = Zweig in der GitHub-Ablage, tag = Versionsschild, detached = HEAD ohne Zweig, worktree = zusätzliches Arbeitsverzeichnis steht hier */
  kind: 'local' | 'remote' | 'tag' | 'detached' | 'worktree'
  /** Anzeigename ohne refs/heads/ usw. */
  name: string
  /** Der Zweig, auf dem das Projekt gerade steht (HEAD -> …) */
  isCurrent: boolean
  /** Lokaler Zweig, dessen gleichnamiger GitHub-Zweig auf demselben Speicherstand steht */
  isSynced: boolean
  /** Lokaler Zweig, der in einem zusätzlichen Arbeitsverzeichnis steht (das Verzeichnis zeigt hierher) */
  inWorktree: boolean
}

export type GleisCommit = {
  hash: string
  parents: string[]
  refs: GleisRef[]
  subject: string
  author: string
  /** Sekunden seit 1970 */
  time: number
}

export type GleisWorktree = {
  path: string
  branch: string | null
  head: string
  /** Das Hauptverzeichnis der Ablage (erste Zeile von git worktree list) */
  isMain: boolean
  /** Das Verzeichnis, das der Gleisplan gerade zeigt */
  isHere: boolean
}

export type GleisSnapshot = {
  /** Der angefragte Ordner */
  folder: string
  /** Oberster Ordner der Ablage, null wenn kein Git-Projekt */
  root: string | null
  error: string | null
  branch: string | null
  head: string | null
  upstream: string | null
  remotes: string[]
  ahead: number
  behind: number
  /** Geänderte, schon bekannte Dateien (noch nicht festgehalten) */
  changed: number
  /** Neue, Git noch unbekannte Dateien */
  untracked: number
  conflicts: number
  stashes: number
  worktrees: GleisWorktree[]
  /** Der Hauptzweig (main, sonst master, sonst der aktuelle Zweig) */
  mainBranch: string | null
  /** Alle lokalen Entwicklungszweige */
  branches: string[]
  /** Lokale Zweige, die noch nicht in den Hauptzweig zusammengeführt sind (ohne die für andere Ablagen) */
  unmerged: string[]
  /**
   * Lokale Zweige, die in eine andere GitHub-Ablage als origin hochgeladen werden (z. B. „oeffentlich“
   * → git-tracking): Zweig → Name dieser Ablage. Sie werden nie in den Hauptzweig zusammengeführt.
   */
  otherRepoBranches: Record<string, string>
  /** GitHub-Ablage je Gegenstelle, z. B. { origin: 'meine-sachen', oeffentlich: 'git-tracking' } */
  remoteNames: Record<string, string>
  /** Speicherstände, die nur auf diesem PC liegen (noch nicht hochgeladen), höchstens 500 */
  unpushed: string[]
  /** Speicherstände, die nur bei GitHub liegen (noch nicht abgeholt), höchstens 500 */
  unpulled: string[]
  commits: GleisCommit[]
  hasMore: boolean
  /** git log --graph als Text, nur für das Terminal */
  textGraph: string[]
  /** Das Tagebuch (reflog) für die Drei-Ebenen-Ansicht; nur gelesen, wenn sie gezeigt wird */
  diary: GleisDiary | null
}

/** Ein Eintrag im Git-Tagebuch (reflog) */
export type DiaryEntry = {
  /** heads/<Zweig>, remotes/origin/<Zweig> oder folder:<n> (der n-te Ordner) */
  ref: string
  /** Speicherstand nach dem Ereignis */
  hash: string
  /** Sekunden seit 1970 */
  time: number
  /** Git-Text, z. B. "commit: …", "update by push", "checkout: moving from a to b" */
  msg: string
}

/** Ein Ordner (Arbeitsverzeichnis) der Ablage */
export type DiaryFolder = {
  path: string
  /** "Hauptordner" oder der Ordnername */
  name: string
  branch: string | null
  isMain: boolean
  /** Geänderte und neue Dateien, noch nicht festgehalten */
  dirty: number
}

/** Ein lokaler Zweig mit seinem GitHub-Gegenstück */
export type DiaryTrack = {
  branch: string
  /** Speicherstand, auf dem der Zweig steht */
  tip: string
  upstream: string | null
  /** noch nicht hochgeladen */
  ahead: number
  /** noch nicht abgeholt */
  behind: number
}

/** Ein Zusammenführen auf dem Hauptzweig bei GitHub (git log --first-parent --merges) */
export type DiaryMerge = {
  hash: string
  parents: string[]
  /** Sekunden seit 1970 (Zeit des Zusammenführens) */
  time: number
  /** E-Mail dessen, der den Speicherstand angelegt hat; noreply@github.com = auf der GitHub-Webseite */
  committer: string
  subject: string
}

export type GleisDiary = {
  entries: DiaryEntry[]
  folders: DiaryFolder[]
  track: DiaryTrack[]
  /** Zweige bei GitHub (Stand des letzten Abholens), z. B. origin/main */
  remoteBranches: string[]
  /** Zeit des ältesten Speicherstands, um zu sagen, ob es Älteres als das Tagebuch gibt */
  oldestCommit: number | null
  /** Der Hauptzweig bei GitHub, z. B. origin/main; null, wenn es ihn dort nicht gibt */
  mainRemote: string | null
  /** Zusammenführungen auf mainRemote (neueste zuerst); auch solche, die bei GitHub oder woanders entstanden */
  remoteMerges: DiaryMerge[]
  /** GitHub-Zweige, die noch nicht in mainRemote zusammengeführt sind, z. B. origin/x */
  unmergedRemote: string[]
  /** GitHub-Ablage je Gegenstelle (wie GleisSnapshot.remoteNames), für die Spurnamen anderer Ablagen */
  remoteNames: Record<string, string>
  /**
   * Übernahmen (merge) aus Zweigen, die es nicht mehr gibt: Speicherstand der Übernahme → wurden die
   * übernommenen Speicherstände aus keinem heutigen Ordner festgehalten (all) oder nur teils (some)?
   * Fehlt ein Eintrag, wurden sie aus einem heutigen Ordner festgehalten (oder es ist unbekannt).
   */
  mergeOrigins?: Record<string, 'all' | 'some'>
}

export type GleisView = {
  /** Wie viele Speicherstände gezeigt werden */
  limit: number
  /** all = alle Zweige, current = nur der Verlauf des aktuellen Zweigs */
  scope: 'all' | 'current'
  /** Anderer Ordner als der der Sitzung (per /gleisplan <Ordner>), sonst null */
  folder: string | null
  /** true = nur Haltepunkte (gerade Strecken zusammengefasst), false = jeden Speicherstand zeigen */
  compact: boolean
  /**
   * plan = Gleisplan (Speicherstände), ebenen = Drei Ebenen (GitHub, PC, Ordner) aus dem Tagebuch,
   * dazu die Ebene „Veröffentlicht“, wenn das Projekt Veröffentlichungen bei GitHub hat
   */
  mode: 'plan' | 'ebenen'
  /** Wie viele Tagebuch-Ereignisse die Drei-Ebenen-Ansicht zeigt */
  events: number
}

/** Der angeklickte Speicherstand mit seinen Details */
export type GleisSelection = {
  hash: string
  /**
   * Welche Zeile der Drei-Ebenen-Ansicht angeklickt wurde (siehe eventKey). Mehrere Zeilen
   * können denselben Speicherstand zeigen; Karte und Kreis gehören an die angeklickte.
   * null = im Gleisplan gewählt.
   */
  row: string | null
  /** Geänderte Dateien mit Umfang, höchstens 12 */
  files: string[]
  /** z. B. "3 Dateien geändert (+40 / −12)" */
  summary: string
  loading: boolean
  /** Betreff, Autor und Zeit, gelesen mit den Dateien (für Speicherstände außerhalb des Gleisplans) */
  subject: string
  author: string
  time: number
}

/** Wofür das Projekt eine GitHub-Ablage nutzt */
export type RepoRole = 'code' | 'release' | 'beta' | 'other'

/** Eine GitHub-Ablage, die zum Projekt gehört */
export type ProjectRepo = {
  /** owner/repo */
  name: string
  /** code = Quellcode wird hochgeladen, release = fertige Versionen, beta = Testversionen, other = gehört sonst dazu */
  role: RepoRole
  /** git = Gegenstelle in Git, name = aus dem Namen vermutet, claude = von Claude geprüft */
  source: 'git' | 'name' | 'claude'
  /** Kurze Begründung (von Claude) oder die Beschreibung bei GitHub */
  why: string
}

/** release = fertige Version, beta = Vorabversion oder aus einer Beta-Ablage, draft = Entwurf (nie veröffentlicht) */
export type ReleaseKind = 'release' | 'beta' | 'draft'

/** Eine Veröffentlichung (GitHub release) */
export type ReleaseItem = {
  /** owner/repo, in dem sie liegt */
  repo: string
  tag: string
  title: string
  kind: ReleaseKind
  /** Sekunden seit 1970; beim Entwurf das Anlegedatum, 0 = unbekannt */
  time: number
}

export type GleisReleases = {
  /** owner/repo der Haupt-Ablage (origin): unter diesem Schlüssel merkt sich das Plugin Claudes Prüfung */
  key: string
  /** Oberster Ordner der Ablage, für die gelesen wurde */
  root: string
  repos: ProjectRepo[]
  /** Wann Claude die Ablagen zuletzt geprüft hat (ms seit 1970); null = nur vermutet */
  checkedAt: number | null
  /** Ablagen mit passendem Namen, die bei der letzten Prüfung noch nicht da waren */
  newRepos: string[]
  /** Neueste zuerst */
  items: ReleaseItem[]
  /** Ablagen, deren Veröffentlichungen nicht gelesen werden konnten */
  failed: { repo: string; reason: string }[]
  /** ms seit 1970 */
  fetchedAt: number
}

export type GleisReleaseState = {
  data: GleisReleases | null
  /** loading = liest von GitHub, checking = Claude prüft gerade die Ablagen */
  busy: 'loading' | 'checking' | null
  /** no-github = keine GitHub-Ablage; sonst ein Text zum Anzeigen */
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'git-tracking': {
      snapshot: Shaped<GleisSnapshot | null>
      view: Shaped<GleisView>
      selected: Shaped<GleisSelection | null>
      /** Was im Fragefeld der Detailkarte steht */
      draft: Shaped<string>
      /** Sprache der Anzeige */
      lang: Shaped<'de' | 'en'>
      /** Veröffentlichungen und Betas des gezeigten Projekts */
      releases: Shaped<GleisReleaseState>
    }
  }
}
