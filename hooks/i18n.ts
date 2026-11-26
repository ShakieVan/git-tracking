/**
 * All texts of Git-Tracking in German and English.
 * German uses everyday words for Git (festhalten, hochladen, abholen …) with the
 * Git term in brackets where it helps; English uses the usual Git terms.
 */
import type { IconKind } from './graph'

export type Lang = 'de' | 'en'

const n1 = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export type Texts = {
  lang: Lang
  iconName: Record<IconKind, string>
  // Loading and errors
  reading: string
  noGit: string
  noGitFolder: (folder: string) => string
  gitStartFailed: (err: string) => string
  gitError: string
  otherProjectHint: string
  // Header
  conflicts: (n: number) => string
  notPushed: (n: number) => string
  notPulled: (n: number) => string
  filesChanged: (n: number) => string
  filesNew: (n: number) => string
  notCommitted: (parts: string) => string
  stashed: (n: number) => string
  neverPushed: string
  localOnly: string
  allClean: string
  onMain: (b: string) => string
  onBranch: (b: string) => string
  detached: (h: string) => string
  noCommitYet: string
  oneTrack: (main: string) => string
  tracks: (main: string, n: number, unmerged: number) => string
  /** Zweige, die in eine andere GitHub-Ablage hochgeladen werden: „1 Zweig für die Ablage git-tracking“ */
  otherRepoTracks: (n: number, repos: string) => string
  /** „Hauptzweig main + …“, wenn es sonst keine Entwicklungszweige gibt */
  mainWith: (main: string, rest: string) => string
  worktreesTitle: (n: number) => string
  worktreeTarget: (branch: string | null, head: string) => string
  mainWorktree: string
  andMore: (n: number) => string
  // Buttons
  reload: string
  allEvents: string
  groupEvents: string
  allCommits: string
  onlyStops: string
  onlyThisBranch: string
  allBranches: string
  moreDiary: string
  moreHistory: string
  backToProject: string
  modeLevels: string
  modePlan: string
  // Legends
  symbolsTitle: string
  iconLegend: Record<IconKind, string>
  planLegend: string
  noCommits: string
  // Plan rows
  workTip: string
  workRow: (parts: string) => string
  gapRow: (n: number) => string
  colorTitle: string
  laneMain: string
  laneUnnamed: string
  laneIsMain: string
  laneMerged: string
  laneUnmerged: string
  formerLine: (main: string) => string
  // Pills
  atGitHub: (name: string, newer: number) => string
  detachedPill: string
  // Card and questions
  readingFiles: string
  noFileChanges: string
  questionPlaceholder: string
  submitLabel: string
  askHere: string
  copyForNew: string
  close: string
  questionHead: (short: string, project: string, root: string) => string
  questionMine: (q: string) => string
  toastAsked: string
  toastAskStart: string
  toastNoFill: (dialog: boolean) => string
  toastCopied: (project: string) => string
  // Command
  commandDescription: string
  commandArg: string
  shows: (arg: string) => string
  showsThis: string
  paneLater: string
  claudeGetsIt: string
  // Folder choice and handing the state to Claude
  pickFolder: string
  pickTitle: string
  picking: string
  noPicker: string
  pickFailed: (err: string) => string
  handToClaude: string
  handedNotice: (project: string) => string
  handedToast: (project: string) => string
  nothingToHand: string
  handFailed: string
  // Graph texts
  quoted: (name: string) => string
  theMain: string
  unnamedBranch: string
  otherBranch: string
  mergeTip: (from: string, into: string) => string
  branchTip: (names: string[]) => string
  pushTip: string
  pullTip: string
  ago: { now: string; min: (n: number) => string; hours: (n: number) => string; yesterday: string; days: (n: number) => string }
  refLocal: (name: string, current: boolean, synced: boolean) => string
  refRemote: (name: string) => string
  refTag: (name: string) => string
  refDetached: string
  refWorktree: (name: string) => string
  stat: (files: number, plus: string, minus: string) => string
  binary: string
  moreFiles: (n: number) => string
  // Three levels
  levelTitles: [string, string, string, string]
  mainFolder: string
  formerFolders: string
  /** Gemeinsame Spur aller gelöschten Zweige in der Spalte PC */
  deletedLane: string
  aFormerFolder: string
  folderGeneric: string
  diaryLine: string
  readingDiary: string
  now: string
  nowAll: string
  nowAllLocal: string
  nowWork: string
  nowPush: string
  nowPull: string
  nowWorkTip: (list: string) => string
  nowPushTip: (list: string) => string
  nowPullTip: (list: string) => string
  dirtyFiles: (n: number) => string
  neverPushedBranch: (b: string) => string
  gapEvents: (n: number, pushed: boolean) => string
  olderEvents: string
  olderThanDiary: string
  diaryStart: string
  arrowsTitle: string
  arrowYellow: string
  arrowGreen: string
  levelsLegend: string
  hiddenEvents: (n: number) => string
  ev: {
    noBranch: string
    initial: string
    committed: string
    committedPushed: string
    amended: string
    pushedSuffix: string
    mergedRemote: string
    fromGitHub: (x: string) => string
    mergedInto: (b: string) => string
    mergedFrom: (x: string) => string
    pulled: string
    pushed: (b: string) => string
    fetched: (r: string) => string
    fetchedNoLocal: string
    mergedOnGitHub: (b: string) => string
    mergedElsewhere: (b: string) => string
    pullRequest: (n: number) => string
    elsewhereHint: string
    folderCreated: (f: string) => string
    withBranch: (b: string) => string
    folderTakes: (f: string, b: string | null) => string
    before: (x: string) => string
    reset: string
    resetDetail: string
    rebase: string
    rebaseDetail: string
    newBranch: (b: string) => string
    fromSource: (x: string) => string
    cloned: string
    published: (tag: string) => string
    betaPublished: (tag: string) => string
    split: string
    splitPushed: (target: string) => string
    pushedTo: (target: string) => string
    cleanedUp: string
    outsideAll: string
    outsideSome: string
  }
  /** Kurzfassung für Claude (kurzfassung.ts) */
  brief: BriefTexts
  /** Veröffentlichungen und Betas (ablagen.ts) */
  rel: ReleaseTexts
  /** Hinweise auf den Spurnamen und Infobox „Spuren“ (spuren.ts) */
  info: InfoTexts
}

export type InfoTexts = {
  /** Knopf neben dem Kopf, öffnet und schließt die Infobox */
  button: string
  title: string
  /** Letzte Zeile des Hinweises auf einem Spurnamen */
  tipHint: string
  /** Hinweise auf den Spaltentiteln: GitHub, PC, Ordner, Veröffentlicht */
  colTips: [string, string, string, string]
  isPrivate: string
  isPublic: string
  remoteBranch: (branch: string, repo: string) => string
  mainBranchGitHub: string
  goneRemote: string
  lastPushed: (when: string) => string
  lastFetched: (when: string) => string
  localCounterpart: (b: string) => string
  branchMain: string
  branchDev: string
  upstream: (u: string) => string
  forRepo: (repo: string) => string
  neverPushed: string
  localOnly: string
  ahead: (n: number) => string
  behind: (n: number) => string
  inSync: string
  merged: (main: string) => string
  notMerged: (main: string) => string
  inFolder: (f: string) => string
  lastCommit: (subject: string, when: string) => string
  deletedWhat: string
  folderMain: string
  folderExtra: string
  onBranch: (b: string) => string
  detached: string
  dirty: (n: number) => string
  clean: string
  formerWhat: string
  releasesCount: (n: number) => string
  newest: (tag: string, beta: boolean, when: string) => string
  openReleases: string
  openRepo: string
  openBranch: string
  compare: (main: string) => string
  copyUrl: string
  copyPath: string
  /** Unter Windows */
  explorer: string
  /** Andere Systeme */
  openFolder: string
  urlCopied: string
  pathCopied: string
  openFailed: (err: string) => string
}

const infoDe: InfoTexts = {
  button: 'ⓘ Spuren',
  title: 'Spuren dieses Projekts',
  tipHint: 'Links und mehr: Knopf „ⓘ Spuren“',
  colTips: [
    'GitHub: die Zweige in den GitHub-Ablagen (Stand des letzten Abholens)',
    'PC: die Entwicklungszweige auf diesem PC',
    'Ordner: die Arbeitsverzeichnisse dieser Ablage und was dort gerade steht',
    'Veröffentlicht: Veröffentlichungen und Betas in den GitHub-Ablagen des Projekts',
  ],
  isPrivate: 'privat',
  isPublic: 'öffentlich',
  remoteBranch: (b, repo) => `Zweig ${b} der Ablage ${repo}`,
  mainBranchGitHub: 'Hauptzweig',
  goneRemote: 'gibt es bei GitHub nicht mehr (Stand des letzten Abholens)',
  lastPushed: w => `zuletzt von hier hochgeladen: ${w}`,
  lastFetched: w => `zuletzt abgeholt: ${w}`,
  localCounterpart: b => `Gegenstück hier: ${b}`,
  branchMain: 'Hauptzweig auf diesem PC',
  branchDev: 'Entwicklungszweig auf diesem PC',
  upstream: u => `Gegenstück ${u}`,
  forRepo: repo => `wird in die Ablage ${repo} hochgeladen`,
  neverPushed: 'noch nie hochgeladen',
  localOnly: 'nur auf diesem PC',
  ahead: n => `${n} noch nicht hochgeladen`,
  behind: n => `${n} noch nicht abgeholt`,
  inSync: 'alles hochgeladen',
  merged: m => `in ${m} zusammengeführt`,
  notMerged: m => `noch nicht in ${m} zusammengeführt`,
  inFolder: f => `steht im Ordner ${f}`,
  lastCommit: (s, w) => `letzter Speicherstand „${s}“, ${w}`,
  deletedWhat: 'Zweige, die es nicht mehr gibt',
  folderMain: 'Hauptordner der Ablage',
  folderExtra: 'zusätzliches Arbeitsverzeichnis',
  onBranch: b => `steht auf ${b}`,
  detached: 'ohne Zweig (direkt auf einem Speicherstand)',
  dirty: n => `${n1(n, 'Datei', 'Dateien')} geändert, noch nicht festgehalten`,
  clean: 'alles festgehalten',
  formerWhat: 'Ordner, die es nicht mehr gibt – nur noch im Tagebuch',
  releasesCount: n => n1(n, 'Veröffentlichung', 'Veröffentlichungen'),
  newest: (tag, beta, w) => `neueste ${tag}${beta ? ' (Beta)' : ''}, ${w}`,
  openReleases: 'Veröffentlichungen ansehen',
  openRepo: 'Ablage auf GitHub',
  openBranch: 'Auf GitHub öffnen',
  compare: m => `Unterschied zu ${m} ansehen`,
  copyUrl: 'Adresse kopieren',
  copyPath: 'Pfad kopieren',
  explorer: 'Im Explorer öffnen',
  openFolder: 'Ordner öffnen',
  urlCopied: 'Adresse kopiert.',
  pathCopied: 'Pfad kopiert.',
  openFailed: err => `Ordner ließ sich nicht öffnen: ${err}`,
}

const infoEn: InfoTexts = {
  button: 'ⓘ Lanes',
  title: 'Lanes of this project',
  tipHint: 'Links and more: button “ⓘ Lanes”',
  colTips: [
    'GitHub: the branches in the GitHub repositories (as of the last fetch)',
    'PC: the local branches on this PC',
    'Folder: the worktrees of this repository and what is checked out there',
    'Releases: releases and betas in the project’s GitHub repositories',
  ],
  isPrivate: 'private',
  isPublic: 'public',
  remoteBranch: (b, repo) => `branch ${b} in ${repo}`,
  mainBranchGitHub: 'main branch',
  goneRemote: 'no longer on GitHub (as of the last fetch)',
  lastPushed: w => `last pushed from here: ${w}`,
  lastFetched: w => `last fetched: ${w}`,
  localCounterpart: b => `local branch: ${b}`,
  branchMain: 'main branch on this PC',
  branchDev: 'local branch on this PC',
  upstream: u => `upstream ${u}`,
  forRepo: repo => `pushed to the repository ${repo}`,
  neverPushed: 'never pushed',
  localOnly: 'only on this PC',
  ahead: n => `${n} not pushed`,
  behind: n => `${n} not pulled`,
  inSync: 'everything pushed',
  merged: m => `merged into ${m}`,
  notMerged: m => `not merged into ${m} yet`,
  inFolder: f => `checked out in ${f}`,
  lastCommit: (s, w) => `last commit “${s}”, ${w}`,
  deletedWhat: 'branches that no longer exist',
  folderMain: 'main folder of the repository',
  folderExtra: 'additional worktree',
  onBranch: b => `on ${b}`,
  detached: 'no branch (detached HEAD)',
  dirty: n => `${n1(n, 'file', 'files')} changed, not committed`,
  clean: 'everything committed',
  formerWhat: 'folders that no longer exist – only in the Git log',
  releasesCount: n => n1(n, 'release', 'releases'),
  newest: (tag, beta, w) => `newest ${tag}${beta ? ' (beta)' : ''}, ${w}`,
  openReleases: 'View releases',
  openRepo: 'Repository on GitHub',
  openBranch: 'Open on GitHub',
  compare: m => `Compare with ${m}`,
  copyUrl: 'Copy address',
  copyPath: 'Copy path',
  explorer: 'Open in Explorer',
  openFolder: 'Open folder',
  urlCopied: 'Address copied.',
  pathCopied: 'Path copied.',
  openFailed: err => `Could not open the folder: ${err}`,
}

export type ReleaseTexts = {
  /** Vor der Liste der Ablagen unter der Ansicht */
  reposTitle: string
  role: Record<'code' | 'release' | 'beta' | 'other', string>
  guessed: string
  checked: (when: string) => string
  update: string
  checking: string
  loading: string
  newRepos: (names: string[]) => string
  failedRepo: (repo: string, reason: string) => string
  reason: (code: string) => string
  /** Legende: lila Pfeil und Punkt/Ring */
  legend: string
  claudeFailed: (reason: string) => string
  claudeUnclear: string
  busy: string
  updatedToast: (n: number) => string
}

const relDe: ReleaseTexts = {
  reposTitle: 'Ablagen bei GitHub',
  role: { code: 'Quellcode', release: 'Veröffentlichungen', beta: 'Betas', other: 'gehört dazu' },
  guessed: 'Vermutet aus den Namen bei GitHub – „Projekt aktualisieren“ lässt Claude im Hintergrund nachsehen.',
  checked: w => `Von Claude geprüft: ${w}.`,
  update: 'Projekt aktualisieren',
  checking: 'Claude prüft im Hintergrund, welche Ablagen dazugehören …',
  loading: 'Lese die Veröffentlichungen von GitHub …',
  newRepos: names =>
    `Neu bei GitHub: ${names.join(', ')}. „Projekt aktualisieren“ prüft, ob ${names.length === 1 ? 'sie dazugehört' : 'sie dazugehören'}.`,
  failedRepo: (repo, reason) => `${repo}: nicht lesbar (${reason})`,
  reason: c =>
    c === 'not-found'
      ? 'nicht gefunden oder privat'
      : c === 'rate-limit'
        ? 'GitHub bremst gerade, später noch einmal'
        : c === 'offline'
          ? 'keine Verbindung'
          : c === 'aborted'
            ? 'Zeit abgelaufen'
            : c === 'empty-reply'
              ? 'leere Antwort'
              : c,
  legend: 'lila: bei GitHub veröffentlicht (Punkt = fertige Version, Ring = Beta, Kreis = neueste)',
  claudeFailed: r => `Claude konnte die Ablagen nicht prüfen (${r}). Gezeigt wird weiter die bisherige Liste.`,
  claudeUnclear: 'Claudes Antwort war nicht lesbar. Gezeigt wird weiter die bisherige Liste.',
  busy: 'Das Projekt wird gerade schon aktualisiert.',
  updatedToast: n => `Projekt aktualisiert: ${n1(n, 'Ablage', 'Ablagen')} bei GitHub.`,
}

const relEn: ReleaseTexts = {
  reposTitle: 'Repositories on GitHub',
  role: { code: 'source code', release: 'releases', beta: 'betas', other: 'belongs to it' },
  guessed: 'Guessed from the names on GitHub – “Update project” lets Claude check in the background.',
  checked: w => `Checked by Claude: ${w}.`,
  update: 'Update project',
  checking: 'Claude is checking in the background which repositories belong to it …',
  loading: 'Reading the releases from GitHub …',
  newRepos: names =>
    `New on GitHub: ${names.join(', ')}. “Update project” checks whether ${names.length === 1 ? 'it belongs' : 'they belong'} to it.`,
  failedRepo: (repo, reason) => `${repo}: could not be read (${reason})`,
  reason: c =>
    c === 'not-found'
      ? 'not found or private'
      : c === 'rate-limit'
        ? 'GitHub rate limit, try again later'
        : c === 'offline'
          ? 'no connection'
          : c === 'aborted'
            ? 'timed out'
            : c === 'empty-reply'
              ? 'empty reply'
              : c,
  legend: 'purple: published on GitHub (dot = release, ring = beta, circle = newest)',
  claudeFailed: r => `Claude could not check the repositories (${r}). The previous list is still shown.`,
  claudeUnclear: 'Claude’s answer could not be read. The previous list is still shown.',
  busy: 'The project is already being updated.',
  updatedToast: n => `Project updated: ${n1(n, 'repository', 'repositories')} on GitHub.`,
}

/** Was eine Git-Aktion im Tagebuch war (aus classify in ebenen.ts) */
export type BriefAction = { kind: string; subject: string; from?: string; to?: string }

export type BriefTexts = {
  head: (date: string, mode: 'start' | 'startShown' | 'switched' | 'handed') => string
  folderMain: (path: string, where: string) => string
  folderLinked: (path: string, mainPath: string, where: string) => string
  onMain: (b: string) => string
  onBranch: (b: string) => string
  detached: (h: string) => string
  hereWork: (work: string) => string
  changed: (n: number) => string
  untracked: (n: number) => string
  conflicts: (n: number) => string
  clean: string
  dirty: (parts: string, when: string | null) => string
  last: (action: string, when: string) => string
  action: (a: BriefAction) => string
  noRemote: string
  neverPushed: (b: string) => string
  unpushed: (n: number) => string
  unpulled: (n: number, upstream: string) => string
  synced: string
  openBranch: (name: string, details: string[]) => string
  inFolder: (path: string) => string
  onlyHere: (n: number | null) => string
  pushedElsewhere: string
  notPushed: (n: number) => string
  lastCommit: (ago: string) => string
  branches: (main: string, n: number, open: string | null, done: string | null, allMerged: boolean) => string
  remoteBranches: (remote: string, main: string, n: number, done: string | null, onlyThere: string | null, rest: number) => string
  stashes: (n: number) => string
  othersTitle: (n: number) => string
  mainMark: string
  switches: (n: number, days: number, noOthers: boolean) => string
  noOthers: string
  on: (date: string) => string
  andMore: (n: number) => string
}

/** Betreff eines Speicherstands, für die Kurzfassung gekürzt */
const subj = (s: string) => (s.length > 70 ? `${s.slice(0, 69)}…` : s)

const de: Texts = {
  lang: 'de',
  iconName: { merge: 'Zusammenführen', branch: 'Abzweig', work: 'In Arbeit', push: 'Hochladen fehlt', pull: 'Abholen fehlt' },
  reading: 'Lese den Git-Stand …',
  noGit: 'Kein Git-Projekt',
  noGitFolder: f => `Der Ordner ${f} ist (noch) nicht mit Git verbunden.`,
  gitStartFailed: err => `Git ließ sich nicht starten: ${err}`,
  gitError: 'Git meldet einen Fehler.',
  otherProjectHint: 'Mit „/git-tracking Ordner“ lässt sich ein anderes Projekt anzeigen.',
  conflicts: n => `⚠ ${n1(n, 'Konflikt', 'Konflikte')}`,
  notPushed: n => `${n} noch nicht hochgeladen`,
  notPulled: n => `${n} noch nicht abgeholt`,
  filesChanged: n => n1(n, 'Datei geändert', 'Dateien geändert'),
  filesNew: n => n1(n, 'neue Datei', 'neue Dateien'),
  notCommitted: p => `${p} – noch nicht festgehalten`,
  stashed: n => `📦 ${n} beiseitegelegt`,
  neverPushed: '☁ Zweig noch nie hochgeladen',
  localOnly: '☁ nur lokal, keine GitHub-Ablage',
  allClean: '✓ alles festgehalten und hochgeladen',
  onMain: b => `steht auf dem Hauptzweig ${b}`,
  onBranch: b => `steht auf Entwicklungszweig ${b}`,
  detached: h => `ohne Zweig bei ${h}`,
  noCommitYet: 'noch kein Speicherstand',
  oneTrack: m => `Nur ein Gleis: alles liegt im Hauptzweig ${m}, keine Entwicklungszweige`,
  tracks: (m, n, u) =>
    `Hauptzweig ${m} + ${n1(n, 'Entwicklungszweig', 'Entwicklungszweige')}` +
    (u > 0 ? `, davon ${u} noch nicht zusammengeführt` : ', alle schon zusammengeführt'),
  otherRepoTracks: (n, r) => `${n1(n, 'Zweig', 'Zweige')} für die Ablage ${r} (${n === 1 ? 'wird' : 'werden'} nicht zusammengeführt)`,
  mainWith: (m, rest) => `Hauptzweig ${m} + ${rest}`,
  worktreesTitle: n => `Zusätzliche Arbeitsverzeichnisse (${n}):`,
  worktreeTarget: (b, h) => (b ? `Zweig ${b}` : `ohne Zweig bei ${h}`),
  mainWorktree: ' (Hauptverzeichnis)',
  andMore: n => `… und ${n} weitere`,
  reload: 'Neu laden',
  allEvents: 'Alle Ereignisse',
  groupEvents: 'Gleiches zusammenfassen',
  allCommits: 'Alle Speicherstände',
  onlyStops: 'Nur Haltepunkte',
  onlyThisBranch: 'Nur dieser Zweig',
  allBranches: 'Alle Zweige',
  moreDiary: 'Mehr Tagebuch',
  moreHistory: 'Mehr Verlauf',
  backToProject: 'Zurück zu diesem Projekt',
  modeLevels: 'Drei Ebenen',
  modePlan: 'Gleisplan',
  symbolsTitle: 'Zeichen (Maus darüber zeigt die Erklärung):',
  iconLegend: {
    work: 'in Arbeit: im Ordner geändert, noch nicht festgehalten (commit fehlt)',
    push: 'Brief noch nicht abgeschickt: festgehalten, noch nicht hochgeladen (push fehlt)',
    pull: 'neuerer Stand bei GitHub: abholen, damit der PC aktuell ist (pull fehlt)',
    merge: 'zusammengeführt (merge): zwei Zweige werden einer',
    branch: 'abgezweigt (branch): ein Zweig teilt sich',
  },
  planLegend:
    'Ringe: gestrichelt = nur auf diesem PC, gepunktet = nur bei GitHub, durchgezogen = hier und bei GitHub, ◉ = hier steht das Projekt. ▬ Prellbock = Zweig noch nicht zusammengeführt · gestrichelter Stummel = Zweig ohne eigene Speicherstände · „☁ … bei GitHub“ = so weit ist die GitHub-Ablage · Oben neu, unten alt · Klick auf eine Zeile: Details und Fragen',
  noCommits: 'Noch keine Speicherstände.',
  workTip:
    'In Arbeit: im Projektordner geändert, aber noch in keinem Speicherstand (festhalten / commit fehlt). Diese Änderungen gibt es nur hier.',
  workRow: p => `Im Ordner: ${p} – noch nicht festgehalten`,
  gapRow: n => `… ${n} Speicherstände (aufklappen)`,
  colorTitle: 'Farben der Gleise (jeder Zweig hat seine Farbe, blau ist immer der Hauptzweig):',
  laneMain: 'Hauptzweig',
  laneUnnamed: 'Zweig ohne Namen',
  laneIsMain: ' – Hauptzweig',
  laneMerged: ' – zusammengeführt',
  laneUnmerged: ' – noch nicht zusammengeführt',
  formerLine: m => `${m} (frühere Linie)`,
  atGitHub: (name, newer) => `☁ ${name} bei GitHub${newer > 0 ? ` (${newer} neuere fehlen dort)` : ''}`,
  detachedPill: '▶ HEAD (ohne Zweig)',
  readingFiles: 'Lese die geänderten Dateien …',
  noFileChanges: 'Keine Dateiänderungen',
  questionPlaceholder: 'Deine Frage zu diesem Speicherstand …',
  submitLabel: 'in den Chat',
  askHere: 'Im Chat fragen',
  copyForNew: 'Für neuen Chat kopieren',
  close: 'Schließen',
  questionHead: (s, p, r) => `Frage zum Speicherstand ${s} im Projekt ${p} (${r}):`,
  questionMine: q => `Meine Frage: ${q}`,
  toastAsked: 'Die Frage steht unten im Eingabefeld – mit Enter abschicken.',
  toastAskStart: 'Unten im Eingabefeld steht der Anfang – Frage ergänzen und mit Enter abschicken.',
  toastNoFill: d =>
    `Das Eingabefeld ließ sich nicht füllen${d ? ' (gerade ist ein Dialog offen)' : ''}. „Für neuen Chat kopieren“ geht immer.`,
  toastCopied: p => `Kopiert. Neuen Chat im Projekt ${p} öffnen und mit Strg+V einfügen.`,
  commandDescription: 'Git-Stand im Seitenfenster zeigen: drei Ebenen und Gleisplan (optional: anderer Ordner)',
  commandArg: '[Ordner]',
  shows: a => `Git-Tracking zeigt jetzt: ${a}`,
  showsThis: 'Git-Tracking zeigt dieses Projekt.',
  paneLater: ' (das Fenster erscheint, sobald Platz ist)',
  claudeGetsIt: ' Claude bekommt den Git-Stand mit deiner nächsten Nachricht.',
  pickFolder: '📁 Ordner wählen …',
  pickTitle: 'Git-Projekt für Git-Tracking wählen',
  picking: 'Der Auswahldialog ist offen (eventuell hinter diesem Fenster).',
  noPicker: 'Auf diesem System gibt es keinen Auswahldialog – „/git-tracking Ordner“ eintippen.',
  pickFailed: e => `Der Auswahldialog ließ sich nicht öffnen: ${e}`,
  handToClaude: '💬 An Claude geben',
  handedNotice: p => `Git-Tracking: Claude bekommt den Git-Stand von „${p}“ mit deiner nächsten Nachricht.`,
  handedToast: p => `Git-Stand von „${p}“ an Claude gegeben`,
  nothingToHand: 'Kein Git-Projekt – nichts an Claude gegeben.',
  handFailed: 'Der Git-Stand ließ sich nicht an Claude geben.',
  quoted: n => `„${n}“`,
  theMain: 'der Hauptzweig',
  unnamedBranch: 'ein Zweig ohne Namen',
  otherBranch: 'ein anderer Zweig',
  mergeTip: (f, i) => `Zusammenführen (merge): ${f} wurde hier in ${i} übernommen.`,
  branchTip: names => `Abzweig (branch): hier ${names.length > 1 ? 'beginnen' : 'beginnt'} ${names.join(', ')}.`,
  pushTip:
    'Brief geschrieben, aber noch nicht abgeschickt: festgehalten, aber noch nicht hochgeladen (push fehlt). Liegt nur auf diesem PC.',
  pullTip:
    'Neuerer Stand bei GitHub: dieser Speicherstand fehlt hier noch – abholen (pull), damit die Ablage auf dem PC aktuell ist.',
  ago: {
    now: 'gerade eben',
    min: n => `vor ${n} Min.`,
    hours: n => `vor ${n} Std.`,
    yesterday: 'gestern',
    days: n => `vor ${n} Tagen`,
  },
  refLocal: (n, c, s) => `Zweig ${n}${c ? ' (aktuell)' : ''}${s ? ' (auch in der GitHub-Ablage)' : ''}`,
  refRemote: n => `GitHub-Ablage: ${n}`,
  refTag: n => `Versionsschild ${n}`,
  refDetached: 'aktueller Stand ohne Zweig',
  refWorktree: n => `Arbeitsverzeichnis ${n}`,
  stat: (f, p, m) => `${f} ${f === 1 ? 'Datei' : 'Dateien'} geändert (+${p} / −${m} Zeilen)`,
  binary: 'Binärdatei',
  moreFiles: n => `${n} weitere nicht gezeigt`,
  levelTitles: ['GitHub', 'PC', 'Ordner', 'Veröffentlicht'],
  mainFolder: 'Hauptordner',
  formerFolders: 'frühere Ordner',
  deletedLane: 'gelöscht',
  aFormerFolder: 'Ein früherer Ordner',
  folderGeneric: 'Ordner',
  diaryLine: 'Eine Zeile = ein Eintrag im Tagebuch dieses PCs, oben neu',
  readingDiary: 'Lese das Tagebuch …',
  now: 'Jetzt',
  nowAll: 'alles festgehalten, hochgeladen und abgeholt',
  nowAllLocal: 'alles festgehalten, nur auf diesem PC',
  nowWork: 'in Arbeit',
  nowPush: 'hochladen',
  nowPull: 'abholen',
  nowWorkTip: l => `In Arbeit, noch nicht festgehalten – ${l}`,
  nowPushTip: l => `Festgehalten, noch nicht hochgeladen – ${l}`,
  nowPullTip: l => `Neuerer Stand bei GitHub, abholen – ${l}`,
  dirtyFiles: n => n1(n, 'Datei', 'Dateien'),
  neverPushedBranch: b => `${b} (nie hochgeladen)`,
  gapEvents: (n, p) => `… ${n} weitere festgehalten${p ? ' und hochgeladen' : ''} (aufklappen)`,
  olderEvents: '… ältere Ereignisse zeigen',
  olderThanDiary: 'Älter als das Tagebuch: nur Speicherstände (siehe Gleisplan)',
  diaryStart: 'Hier beginnt das Tagebuch',
  arrowsTitle: 'Pfeile (die Zeit läuft nach oben):',
  arrowYellow: 'gelb, zwischen GitHub und PC: nach links = hochgeladen (push), nach rechts = abgeholt (fetch/pull)',
  arrowGreen: 'grün, zwischen PC und Ordner: nach links = festgehalten (commit), nach rechts = in den Ordner geholt (checkout)',
  levelsLegend:
    '✕ = Zweig gelöscht, ohne übernommen zu sein (Arbeit evtl. verloren) · graue Spur „gelöscht“ = alle gelöschten Zweige; übernommene biegen dort in ihr Ziel ein · Linie läuft aus = auf dem Zweig ist nichts mehr offen (zusammengeführt, hochgeladen) · grauer Stummel = verworfen (zurückgesetzt, nachträglich geändert, umgeschrieben) · graue gestrichelte Spur = frühere Ordner, z. B. beendete Claude-Sitzungen · Was bei GitHub passiert (z. B. Zusammenführen auf der Webseite), sieht dieser PC erst beim Abholen · Klick auf eine Zeile: Details und Fragen',
  hiddenEvents: n => ` · ${n} Ereignisse auf weiteren Zweigen nicht gezeigt`,
  ev: {
    noBranch: 'ohne Zweig',
    initial: 'Erster Speicherstand',
    committed: 'Festgehalten',
    committedPushed: 'Festgehalten + hochgeladen',
    amended: 'Nachträglich geändert',
    pushedSuffix: ', hochgeladen',
    mergedRemote: 'Abgeholtes eingearbeitet',
    fromGitHub: x => `von GitHub: ${x}`,
    mergedInto: b => `Zusammengeführt → ${b}`,
    mergedFrom: x => `aus ${x}`,
    pulled: 'Abgeholt und eingearbeitet',
    pushed: b => `Hochgeladen (${b})`,
    fetched: r => `Von GitHub abgeholt (${r})`,
    fetchedNoLocal: 'nur bei GitHub, hier kein gleichnamiger Zweig',
    mergedOnGitHub: b => `Bei GitHub zusammengeführt → ${b}`,
    mergedElsewhere: b => `Woanders zusammengeführt → ${b}`,
    pullRequest: n => `Änderungsvorschlag #${n}`,
    elsewhereHint: 'auf einem anderen Rechner (z. B. Claude in der Cloud)',
    folderCreated: f => `Ordner angelegt: ${f}`,
    withBranch: b => `mit Zweig ${b}`,
    folderTakes: (f, b) => `${f} holt ${b ?? 'Stand ohne Zweig'}`,
    before: x => `vorher ${x}`,
    reset: 'Zurückgesetzt',
    resetDetail: 'neuere Speicherstände verworfen',
    rebase: 'Umgeschrieben',
    rebaseDetail: 'Speicherstände neu aufgereiht',
    newBranch: b => `Neuer Zweig ${b}`,
    fromSource: x => `von ${x}`,
    cloned: 'Von GitHub kopiert',
    published: tag => `Veröffentlicht: ${tag}`,
    betaPublished: tag => `Beta veröffentlicht: ${tag}`,
    split: 'Herausgelöst (subtree split)',
    splitPushed: target => `Herausgelöst + hochgeladen → ${target}`,
    pushedTo: target => `Hochgeladen → ${target}`,
    cleanedUp: 'aufgeräumt',
    outsideAll: 'festgehalten aus gelöschtem Ordner',
    outsideSome: 'teils festgehalten aus gelöschtem Ordner',
  },
  rel: relDe,
  info: infoDe,
  brief: {
    head: (d, mode) =>
      'Git-Tracking (Erweiterung des Nutzers) – ' +
      {
        start: `Git-Stand dieses Projekts beim Start der Unterhaltung (${d})`,
        startShown: `Git-Stand des Projekts, das der Nutzer im Git-Tracking-Fenster gewählt hat (nicht der Ordner dieser Sitzung), beim Start der Unterhaltung (${d})`,
        switched: `der Nutzer hat im Git-Tracking-Fenster auf dieses Projekt gewechselt; Git-Stand vom ${d}`,
        handed: `der Nutzer hat den aktuellen Git-Stand dieses Projekts an Claude gegeben (${d})`,
      }[mode] +
      ', nur gelesen; Git-Begriffe in Klammern:',
    folderMain: (p, w) => `- Der Ordner ${p} ist der Hauptordner der Ablage und ${w}.`,
    folderLinked: (p, m, w) => `- Der Ordner ${p} ist ein zusätzliches Arbeitsverzeichnis (worktree) der Ablage ${m} und ${w}.`,
    onMain: b => `steht auf dem Hauptzweig ${b}`,
    onBranch: b => `steht auf dem Entwicklungszweig (branch) ${b}`,
    detached: h => `steht ohne Zweig auf Speicherstand ${h} (detached HEAD)`,
    hereWork: w => `- In diesem Ordner: ${w}.`,
    changed: n => n1(n, 'Datei geändert', 'Dateien geändert'),
    untracked: n => n1(n, 'neue Datei', 'neue Dateien'),
    conflicts: n => `${n1(n, 'Datei', 'Dateien')} mit Konflikt (conflict)`,
    clean: 'alles festgehalten (clean)',
    dirty: (p, w) => `geändert, noch nicht festgehalten (uncommitted): ${p}${w ? `; zuletzt bearbeitet ${w}` : ''}`,
    last: (a, w) => `- Letzte Git-Aktion in diesem Ordner: ${a}, ${w}.`,
    action: a => {
      switch (a.kind) {
        case 'commit':
          return `festgehalten (commit) „${subj(a.subject)}“`
        case 'amend':
          return 'Speicherstand nachgebessert (commit --amend)'
        case 'merge':
          return `zusammengeführt (merge) aus ${a.from ?? '?'}`
        case 'pull':
          return 'von GitHub abgeholt (pull)'
        case 'checkout':
          return `umgeschaltet (checkout) von ${a.from ?? '?'} auf ${a.to ?? '?'}`
        case 'reset':
          return 'zurückgesetzt (reset)'
        case 'rebase':
          return 'Speicherstände neu aufgesetzt (rebase)'
        case 'create':
          return 'Zweig angelegt'
        case 'clone':
          return 'von GitHub geholt (clone)'
        case 'push':
          return 'hochgeladen (push)'
        case 'fetch':
          return 'abgeholt (fetch)'
        default:
          return `„${subj(a.subject)}“`
      }
    },
    noRemote: '- Keine GitHub-Ablage (remote): alles liegt nur auf diesem PC.',
    neverPushed: b => `- Der Zweig ${b} wurde noch nie hochgeladen (kein upstream).`,
    unpushed: n => `- Noch nicht hochgeladen (push): ${n1(n, 'Speicherstand', 'Speicherstände')}.`,
    unpulled: (n, u) => `- Noch nicht abgeholt (pull): ${n1(n, 'Speicherstand', 'Speicherstände')} auf ${u}, laut letztem Abholen (fetch).`,
    synced: '- Alles hochgeladen, nichts abzuholen (laut letztem Abholen/fetch).',
    openBranch: (name, d) => (d.length > 0 ? `${name} (${d.join(', ')})` : name),
    inFolder: p => `steht in ${p}`,
    onlyHere: n => (n === null ? 'nur auf diesem PC' : `${n1(n, 'Speicherstand', 'Speicherstände')} nur auf diesem PC`),
    pushedElsewhere: 'hochgeladen, aber ohne eigenen GitHub-Zweig/upstream',
    notPushed: n => `${n} nicht hochgeladen`,
    lastCommit: a => `letzter Speicherstand ${a}`,
    branches: (m, n, open, done, all) =>
      all
        ? `- Entwicklungszweige (branches) neben ${m}: ${n}, alle schon in ${m} zusammengeführt (merged): ${done}.`
        : `- Entwicklungszweige (branches) neben ${m}: ${n}. Noch nicht zusammengeführt: ${open}${done ? `. Schon in ${m} zusammengeführt (merged): ${done}` : ''}.`,
    remoteBranches: (r, m, n, done, only, rest) =>
      `- Bei GitHub (${r}) außer ${m}: ${n1(n, 'Zweig', 'Zweige')}` +
      (done ? `; schon in ${m} zusammengeführt: ${done}` : '') +
      (only ? `; nur dort und nicht zusammengeführt: ${only}` : '') +
      (rest > 0 ? `; ${rest} weitere wie bei den Entwicklungszweigen oben` : '') +
      '.',
    stashes: n => `- Beiseitegelegt (stash): ${n1(n, 'Eintrag', 'Einträge')}.`,
    othersTitle: n => `- Weitere Ordner dieser Ablage (worktrees): ${n}`,
    mainMark: ' (Hauptordner)',
    switches: (n, days, none) =>
      `- Der Hauptordner wurde in den letzten ${days} Tagen ${n}× zwischen Zweigen umgeschaltet (checkout)${none ? '; zusätzliche Arbeitsverzeichnisse (worktrees) gibt es keine' : ''}.`,
    noOthers: '- Keine zusätzlichen Arbeitsverzeichnisse (worktrees).',
    on: d => `am ${d}`,
    andMore: n => `und ${n} weitere`,
  },
}

const en: Texts = {
  lang: 'en',
  iconName: { merge: 'Merge', branch: 'Branch', work: 'Work in progress', push: 'Not pushed', pull: 'Not pulled' },
  reading: 'Reading the Git state …',
  noGit: 'Not a Git project',
  noGitFolder: f => `The folder ${f} is not a Git repository (yet).`,
  gitStartFailed: err => `Git could not be started: ${err}`,
  gitError: 'Git reports an error.',
  otherProjectHint: 'Use “/git-tracking <folder>” to show another project.',
  conflicts: n => `⚠ ${n1(n, 'conflict', 'conflicts')}`,
  notPushed: n => `${n} not pushed yet`,
  notPulled: n => `${n} not pulled yet`,
  filesChanged: n => n1(n, 'file changed', 'files changed'),
  filesNew: n => n1(n, 'new file', 'new files'),
  notCommitted: p => `${p} – not committed yet`,
  stashed: n => `📦 ${n} stashed`,
  neverPushed: '☁ branch never pushed',
  localOnly: '☁ local only, no GitHub repository',
  allClean: '✓ everything committed and pushed',
  onMain: b => `on main branch ${b}`,
  onBranch: b => `on branch ${b}`,
  detached: h => `detached at ${h}`,
  noCommitYet: 'no commits yet',
  oneTrack: m => `Single track: everything is on the main branch ${m}, no other branches`,
  tracks: (m, n, u) =>
    `Main branch ${m} + ${n1(n, 'branch', 'branches')}` + (u > 0 ? `, ${u} not merged yet` : ', all merged'),
  otherRepoTracks: (n, r) => `${n1(n, 'branch', 'branches')} for the repository ${r} (not merged)`,
  mainWith: (m, rest) => `Main branch ${m} + ${rest}`,
  worktreesTitle: n => `Additional worktrees (${n}):`,
  worktreeTarget: (b, h) => (b ? `branch ${b}` : `detached at ${h}`),
  mainWorktree: ' (main worktree)',
  andMore: n => `… and ${n} more`,
  reload: 'Reload',
  allEvents: 'All events',
  groupEvents: 'Group similar',
  allCommits: 'All commits',
  onlyStops: 'Stops only',
  onlyThisBranch: 'This branch only',
  allBranches: 'All branches',
  moreDiary: 'More history',
  moreHistory: 'More history',
  backToProject: 'Back to this project',
  modeLevels: 'Three levels',
  modePlan: 'Track plan',
  symbolsTitle: 'Symbols (hover for an explanation):',
  iconLegend: {
    work: 'work in progress: changed in the folder, not committed yet',
    push: 'letter not sent yet: committed, not pushed yet',
    pull: 'newer state on GitHub: pull to bring this PC up to date',
    merge: 'merged: two branches become one',
    branch: 'branched: a branch splits off',
  },
  planLegend:
    'Rings: dashed = only on this PC, dotted = only on GitHub, solid = here and on GitHub, ◉ = the project is here. ▬ buffer stop = branch not merged yet · dashed stub = branch without commits of its own · “☁ … on GitHub” = how far the GitHub repository is · Newest at the top · Click a row: details and questions',
  noCommits: 'No commits yet.',
  workTip: 'Work in progress: changed in the project folder but not in any commit yet. These changes exist only here.',
  workRow: p => `In the folder: ${p} – not committed yet`,
  gapRow: n => `… ${n} commits (expand)`,
  colorTitle: 'Track colours (every branch has its own colour, blue is always the main branch):',
  laneMain: 'main branch',
  laneUnnamed: 'unnamed branch',
  laneIsMain: ' – main branch',
  laneMerged: ' – merged',
  laneUnmerged: ' – not merged yet',
  formerLine: m => `${m} (earlier line)`,
  atGitHub: (name, newer) => `☁ ${name} on GitHub${newer > 0 ? ` (${newer} newer missing there)` : ''}`,
  detachedPill: '▶ HEAD (detached)',
  readingFiles: 'Reading the changed files …',
  noFileChanges: 'No file changes',
  questionPlaceholder: 'Your question about this commit …',
  submitLabel: 'to the chat',
  askHere: 'Ask in this chat',
  copyForNew: 'Copy for a new chat',
  close: 'Close',
  questionHead: (s, p, r) => `Question about commit ${s} in project ${p} (${r}):`,
  questionMine: q => `My question: ${q}`,
  toastAsked: 'The question is in the prompt box below – press Enter to send it.',
  toastAskStart: 'The start is in the prompt box below – add your question and press Enter.',
  toastNoFill: d => `The prompt box could not be filled${d ? ' (a dialog is open)' : ''}. “Copy for a new chat” always works.`,
  toastCopied: p => `Copied. Open a new chat in project ${p} and paste with Ctrl+V.`,
  commandDescription: 'Show the Git state in a side pane: three levels and track plan (optional: another folder)',
  commandArg: '[folder]',
  shows: a => `Git-Tracking now shows: ${a}`,
  showsThis: 'Git-Tracking shows this project.',
  paneLater: ' (the pane appears once there is room)',
  claudeGetsIt: ' Claude gets the Git state with your next message.',
  pickFolder: '📁 Choose folder …',
  pickTitle: 'Choose a Git project for Git-Tracking',
  picking: 'The folder dialog is open (it may be behind this window).',
  noPicker: 'No folder dialog on this system – type “/git-tracking <folder>”.',
  pickFailed: e => `The folder dialog could not be opened: ${e}`,
  handToClaude: '💬 Give to Claude',
  handedNotice: p => `Git-Tracking: Claude gets the Git state of “${p}” with your next message.`,
  handedToast: p => `Git state of “${p}” given to Claude`,
  nothingToHand: 'Not a Git project – nothing given to Claude.',
  handFailed: 'The Git state could not be given to Claude.',
  quoted: n => `“${n}”`,
  theMain: 'the main branch',
  unnamedBranch: 'an unnamed branch',
  otherBranch: 'another branch',
  mergeTip: (f, i) => `Merge: ${f} was merged into ${i} here.`,
  branchTip: names => `Branch: ${names.join(', ')} ${names.length > 1 ? 'start' : 'starts'} here.`,
  pushTip: 'Letter written but not sent yet: committed, not pushed yet. Exists only on this PC.',
  pullTip: 'Newer state on GitHub: this commit is missing here – pull to bring this PC up to date.',
  ago: {
    now: 'just now',
    min: n => `${n} min ago`,
    hours: n => `${n} h ago`,
    yesterday: 'yesterday',
    days: n => `${n} days ago`,
  },
  refLocal: (n, c, s) => `branch ${n}${c ? ' (current)' : ''}${s ? ' (also on GitHub)' : ''}`,
  refRemote: n => `GitHub: ${n}`,
  refTag: n => `tag ${n}`,
  refDetached: 'current state without a branch',
  refWorktree: n => `worktree ${n}`,
  stat: (f, p, m) => `${f} ${f === 1 ? 'file' : 'files'} changed (+${p} / −${m} lines)`,
  binary: 'binary',
  moreFiles: n => `${n} more not shown`,
  levelTitles: ['GitHub', 'PC', 'Folder', 'Releases'],
  mainFolder: 'main folder',
  formerFolders: 'former folders',
  deletedLane: 'deleted',
  aFormerFolder: 'A former folder',
  folderGeneric: 'Folder',
  diaryLine: 'One row = one entry in this PC’s Git log (reflog), newest at the top',
  readingDiary: 'Reading the reflog …',
  now: 'Now',
  nowAll: 'everything committed, pushed and pulled',
  nowAllLocal: 'everything committed, only on this computer',
  nowWork: 'in progress',
  nowPush: 'push',
  nowPull: 'pull',
  nowWorkTip: l => `Work in progress, not committed yet – ${l}`,
  nowPushTip: l => `Committed, not pushed yet – ${l}`,
  nowPullTip: l => `Newer state on GitHub, pull – ${l}`,
  dirtyFiles: n => n1(n, 'file', 'files'),
  neverPushedBranch: b => `${b} (never pushed)`,
  gapEvents: (n, p) => `… ${n} more commits${p ? ' and pushes' : ''} (expand)`,
  olderEvents: '… show older events',
  olderThanDiary: 'Older than the reflog: commits only (see track plan)',
  diaryStart: 'The reflog starts here',
  arrowsTitle: 'Arrows (time runs upwards):',
  arrowYellow: 'yellow, between GitHub and PC: to the left = pushed, to the right = fetched/pulled',
  arrowGreen: 'green, between PC and folder: to the left = committed, to the right = checked out into the folder',
  levelsLegend:
    '✕ = branch deleted without being merged (work may be lost) · grey lane “deleted” = all deleted branches; merged ones bend into their target there · line fading out = nothing open on that branch (merged, pushed) · grey stub = discarded (reset, amended, rebased) · grey dashed lane = former folders, e.g. finished Claude sessions · What happens on GitHub (e.g. a merge on the website) shows up on this PC only after a fetch · Click a row: details and questions',
  hiddenEvents: n => ` · ${n} events on further branches not shown`,
  ev: {
    noBranch: 'no branch',
    initial: 'First commit',
    committed: 'Committed',
    committedPushed: 'Committed + pushed',
    amended: 'Amended',
    pushedSuffix: ', pushed',
    mergedRemote: 'Merged what was fetched',
    fromGitHub: x => `from GitHub: ${x}`,
    mergedInto: b => `Merged → ${b}`,
    mergedFrom: x => `from ${x}`,
    pulled: 'Pulled',
    pushed: b => `Pushed (${b})`,
    fetched: r => `Fetched from GitHub (${r})`,
    fetchedNoLocal: 'only on GitHub, no local branch of that name',
    mergedOnGitHub: b => `Merged on GitHub → ${b}`,
    mergedElsewhere: b => `Merged elsewhere → ${b}`,
    pullRequest: n => `pull request #${n}`,
    elsewhereHint: 'on another computer (e.g. Claude in the cloud)',
    folderCreated: f => `Worktree created: ${f}`,
    withBranch: b => `with branch ${b}`,
    folderTakes: (f, b) => `${f} checks out ${b ?? 'a detached state'}`,
    before: x => `before: ${x}`,
    reset: 'Reset',
    resetDetail: 'newer commits discarded',
    rebase: 'Rebased',
    rebaseDetail: 'commits rewritten',
    newBranch: b => `New branch ${b}`,
    fromSource: x => `from ${x}`,
    cloned: 'Cloned from GitHub',
    published: tag => `Released: ${tag}`,
    betaPublished: tag => `Beta released: ${tag}`,
    split: 'Split off (subtree split)',
    splitPushed: target => `Split off + pushed → ${target}`,
    pushedTo: target => `Pushed → ${target}`,
    cleanedUp: 'deleted',
    outsideAll: 'committed from a deleted folder',
    outsideSome: 'partly committed from a deleted folder',
  },
  rel: relEn,
  info: infoEn,
  brief: {
    head: (d, mode) =>
      "Git-Tracking (the user's mod) – " +
      {
        start: `Git state of this project when the conversation started (${d})`,
        startShown: `Git state of the project the user chose in the Git-Tracking pane (not this session's folder) when the conversation started (${d})`,
        switched: `the user switched the Git-Tracking pane to this project; Git state as of ${d}`,
        handed: `the user gave Claude the current Git state of this project (${d})`,
      }[mode] +
      ', read-only:',
    folderMain: (p, w) => `- The folder ${p} is the repository's main folder and ${w}.`,
    folderLinked: (p, m, w) => `- The folder ${p} is a linked worktree of the repository ${m} and ${w}.`,
    onMain: b => `is on the main branch ${b}`,
    onBranch: b => `is on branch ${b}`,
    detached: h => `is on commit ${h} without a branch (detached HEAD)`,
    hereWork: w => `- In this folder: ${w}.`,
    changed: n => `${n} changed ${n === 1 ? 'file' : 'files'}`,
    untracked: n => `${n} new ${n === 1 ? 'file' : 'files'}`,
    conflicts: n => `${n} ${n === 1 ? 'file' : 'files'} with conflicts`,
    clean: 'nothing uncommitted (clean)',
    dirty: (p, w) => `uncommitted changes: ${p}${w ? `; last edited ${w}` : ''}`,
    last: (a, w) => `- Last Git action in this folder: ${a}, ${w}.`,
    action: a => {
      switch (a.kind) {
        case 'commit':
          return `commit “${subj(a.subject)}”`
        case 'amend':
          return 'commit --amend'
        case 'merge':
          return `merge from ${a.from ?? '?'}`
        case 'pull':
          return 'pull from GitHub'
        case 'checkout':
          return `checkout from ${a.from ?? '?'} to ${a.to ?? '?'}`
        case 'reset':
          return 'reset'
        case 'rebase':
          return 'rebase'
        case 'create':
          return 'branch created'
        case 'clone':
          return 'clone from GitHub'
        case 'push':
          return 'push'
        case 'fetch':
          return 'fetch'
        default:
          return `“${subj(a.subject)}”`
      }
    },
    noRemote: '- No remote: everything exists only on this computer.',
    neverPushed: b => `- Branch ${b} has never been pushed (no upstream).`,
    unpushed: n => `- Not pushed yet: ${n} ${n === 1 ? 'commit' : 'commits'}.`,
    unpulled: (n, u) => `- Not pulled yet: ${n} ${n === 1 ? 'commit' : 'commits'} on ${u}, as of the last fetch.`,
    synced: '- Everything pushed, nothing to pull (as of the last fetch).',
    openBranch: (name, d) => (d.length > 0 ? `${name} (${d.join(', ')})` : name),
    inFolder: p => `checked out in ${p}`,
    onlyHere: n => (n === null ? 'only on this computer' : `${n} ${n === 1 ? 'commit' : 'commits'} only on this computer`),
    pushedElsewhere: 'pushed, but without an upstream branch',
    notPushed: n => `${n} not pushed`,
    lastCommit: a => `last commit ${a}`,
    branches: (m, n, open, done, all) =>
      all
        ? `- Branches besides ${m}: ${n}, all already merged into ${m}: ${done}.`
        : `- Branches besides ${m}: ${n}. Not merged yet: ${open}${done ? `. Already merged into ${m}: ${done}` : ''}.`,
    remoteBranches: (r, m, n, done, only, rest) =>
      `- On GitHub (${r}) besides ${m}: ${n} ${n === 1 ? 'branch' : 'branches'}` +
      (done ? `; already merged into ${m}: ${done}` : '') +
      (only ? `; only there and not merged: ${only}` : '') +
      (rest > 0 ? `; ${rest} more as in the branches above` : '') +
      '.',
    stashes: n => `- Stashed: ${n} ${n === 1 ? 'entry' : 'entries'}.`,
    othersTitle: n => `- Other folders of this repository (worktrees): ${n}`,
    mainMark: ' (main folder)',
    switches: (n, days, none) =>
      `- The main folder switched branches ${n}× in the last ${days} days (checkout)${none ? '; there are no linked worktrees' : ''}.`,
    noOthers: '- No linked worktrees.',
    on: d => `on ${d}`,
    andMore: n => `and ${n} more`,
  },
}

export const TEXTS: Record<Lang, Texts> = { de, en }

/** The texts for a language; anything other than de falls back to English */
export const texts = (lang: string | null | undefined): Texts => (lang === 'de' ? de : en)
