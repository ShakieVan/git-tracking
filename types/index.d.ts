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
  /** Lokale Zweige, die noch nicht in den Hauptzweig zusammengeführt sind */
  unmerged: string[]
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

export type GleisDiary = {
  entries: DiaryEntry[]
  folders: DiaryFolder[]
  track: DiaryTrack[]
  /** Zweige bei GitHub (Stand des letzten Abholens), z. B. origin/main */
  remoteBranches: string[]
  /** Zeit des ältesten Speicherstands, um zu sagen, ob es Älteres als das Tagebuch gibt */
  oldestCommit: number | null
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
  /** plan = Gleisplan (Speicherstände), ebenen = Drei Ebenen (GitHub, PC, Ordner) aus dem Tagebuch */
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
    }
  }
}
