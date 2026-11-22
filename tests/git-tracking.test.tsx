import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { diaryEvents, ebenenModel, ebenenSlices, eventLines, mergedLane, parseMerges } from '../hooks/ebenen'
import type { DiaryEvent } from '../hooks/ebenen'
import { texts } from '../hooks/i18n'
import { encodePowerShell, pickedFolder, pickerCommand } from '../hooks/ordnerwahl'
import type { DiaryEntry, GleisDiary } from '../types'

const PANE = {
  plugin: 'git-tracking',
  component: 'Pane',
  requestId: 'git-tracking',
  props: {
    title: 'Git-Tracking',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const US = '\x1f'
const RS = '\x1e'
const rec = (hash: string, parents: string, deco: string, subject: string) =>
  [hash, parents, deco, subject, 'Tester', '1795000000'].join(US) + RS + '\n'

const LOG =
  rec('c3', 'c2 f1', 'HEAD -> refs/heads/main, tag: refs/tags/v1.0', 'Merge feature') +
  rec('f1', 'c1', 'refs/heads/feature, refs/remotes/origin/feature', 'Feature work') +
  rec('c2', 'c1', 'refs/remotes/origin/main', 'Main work') +
  rec('c1', '', '', 'Start')

const STATUS = [
  '# branch.oid c3',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -1',
  '1 .M N... 100644 100644 100644 a b file.txt',
  '? new.txt',
].join('\n')

// Tagebuch (reflog), neueste zuerst: %gD US %H US %gs
const day = (sel: string, hash: string, msg: string) => [sel, hash, msg].join(US) + '\n'
const DIARY =
  day('HEAD@{1795000500}', 'c3', "merge feature: Merge made by the 'ort' strategy.") +
  day('refs/heads/main@{1795000500}', 'c3', "merge feature: Merge made by the 'ort' strategy.") +
  day('refs/remotes/origin/main@{1795000400}', 'c2', 'update by push') +
  day('HEAD@{1795000390}', 'c2', 'commit: Main work') +
  day('refs/heads/main@{1795000390}', 'c2', 'commit: Main work') +
  day('refs/remotes/origin/feature@{1795000300}', 'f1', 'update by push') +
  day('refs/heads/feature@{1795000200}', 'f1', 'commit: Feature work') +
  day('refs/heads/feature@{1795000100}', 'c1', 'branch: Created from main') +
  day('HEAD@{1795000050}', 'c1', 'commit (initial): Start') +
  day('refs/heads/main@{1795000050}', 'c1', 'commit (initial): Start')
// Tagebuch des zusätzlichen Ordners x: angelegt, dann in feature festgehalten
const DIARY_X = day('HEAD@{1795000200}', 'f1', 'commit: Feature work') + day('HEAD@{1795000150}', 'c1', 'reset: moving to HEAD')

function answerGit(argv: readonly string[]) {
  const args = argv.slice(argv.indexOf('color.ui=never') + 1)
  const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
  switch (args[0]) {
    case 'rev-parse':
      return ok('C:/Projekte/Demo\n')
    case 'status':
      return ok(STATUS)
    case 'log':
      // Zusammenführungen auf origin/main: c3 entstand hier (steht im Tagebuch), also keine GitHub-Zeile
      if (args.includes('--merges')) return ok(['c3', 'c2 f1', '1795000500', 't@t', 'Merge feature'].join(US) + '\n')
      if (args.includes('-g')) return ok(args.some(a => a.startsWith('refs/heads/')) ? DIARY : DIARY_X)
      if (args.includes('--max-parents=0')) return ok('1795000050\n')
      return args.includes('--graph') ? ok('* c3 (HEAD -> main) Merge feature\n') : ok(LOG)
    case 'worktree':
      return ok('worktree C:/Projekte/Demo\nHEAD c3\nbranch refs/heads/main\n\nworktree C:/Projekte/Demo/.claude/worktrees/x\nHEAD f1\ndetached\n')
    case 'stash':
      return ok('')
    case 'remote':
      return ok('origin\n')
    case 'for-each-ref':
      // Kurzfassung: alle Zweige mit GitHub-Gegenstück und Zeit, und welche schon in main stecken
      if (args.some(a => a.includes('committerdate'))) {
        return ok(
          'refs/heads/main\torigin/main\t[ahead 2, behind 1]\t1795000500\n' +
            'refs/heads/feature\torigin/feature\t\t1795000200\n' +
            'refs/heads/idee\t\t\t1795000000\n' +
            'refs/remotes/origin/HEAD\t\t\t1795000390\n' +
            'refs/remotes/origin/main\t\t\t1795000390\n' +
            'refs/remotes/origin/feature\t\t\t1795000200\n' +
            'refs/remotes/origin/alt\t\t\t1795000100\n',
        )
      }
      if (args.some(a => a.startsWith('--merged='))) return ok('refs/heads/main\nrefs/remotes/origin/main\nrefs/remotes/origin/alt\n')
      if (args.some(a => a.startsWith('--no-merged=refs/remotes/'))) return ok('refs/remotes/origin/HEAD\nrefs/remotes/origin/feature\n')
      if (args.some(a => a.includes('upstream:track'))) {
        return ok('refs/heads/main\tc3\torigin/main\t[ahead 2, behind 1]\nrefs/heads/feature\tf1\torigin/feature\t\n')
      }
      return args.some(a => a.startsWith('--no-merged'))
        ? ok('refs/heads/feature\n')
        : ok('refs/heads/main\nrefs/heads/feature\nrefs/remotes/origin/main\nrefs/remotes/origin/feature\n')
    case 'rev-list':
      if (args.includes('--count')) return ok('2\n')
      // --branches --not --remotes: nur hier; --remotes --not --branches: nur bei GitHub
      return args.indexOf('--branches') < args.indexOf('--remotes') ? ok('c3\n') : ok('')
    case 'show':
      return ok(' app/Main.kt | 12 ++++++----\n 1 file changed, 8 insertions(+), 4 deletions(-)\n')
    default:
      return ok('')
  }
}

test('Klick auf einen Haltepunkt zeigt Details und schreibt die Frage ins Eingabefeld', { options: { language: 'de' } }, async ($, on) => {
  mock.clock(on)
  const filled: string[] = []
  on('command.register', () => ({ value: { command: 'git-tracking' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: 'C:/Projekte/Demo' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('process.run', (_, e) => ({ value: answerGit(e.argv) }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))

  await $.session.start({ cwd: 'C:/Projekte/Demo', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'git-tracking', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'ansicht-plan' })
  await ui.press({ key: 'halt-c2' })
  expect(await ui.find({ type: 'Text', text: /1 Datei geändert \(\+8 \/ −4 Zeilen\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /app\/Main\.kt/ })).toBeDefined()

  await ui.input({ key: 'frage', text: 'Was wurde hier geändert?', kind: 'change' })
  await ui.press({ key: 'frage-hier' })
  expect(filled.length).toBe(1)
  expect(filled[0]).toContain('Speicherstand c2')
  expect(filled[0]).toContain('Main work')
  expect(filled[0]).toContain('Meine Frage: Was wurde hier geändert?')

  await ui.press({ key: 'schliessen' })
  expect(await ui.find({ type: 'Text', text: /app\/Main\.kt/ })).toBeUndefined()
  await ui.unmount()
})

test('der Gleisplan zeigt Zweig, Ampel und Grafik', { options: { language: 'de' } }, async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'git-tracking' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.cwd', () => ({ value: 'C:/Projekte/Demo' }))
  on('session.surfaces', () => ({ value: ['desktop', 'terminal'] }))
  on('process.run', (_, e) => ({ value: answerGit(e.argv) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))

  await $.session.start({ cwd: 'C:/Projekte/Demo', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'git-tracking', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // Voreingestellt sind die drei Ebenen; der Gleisplan per Umschalter (im Terminal gibt es nur den Text-Verlauf)
    if (surface === 'desktop') await ui.press({ key: 'ansicht-plan' })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts.join(' | ')).toContain('Hauptzweig main')
    expect(texts.join(' | ')).toContain('1 Entwicklungszweig, davon 1 noch nicht zusammengeführt')
    expect((await ui.find({ type: 'Text', text: /^Demo$/ }))?.text).toBe('Demo')
    expect(await ui.find({ type: 'Text', text: /2 noch nicht hochgeladen/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 noch nicht abgeholt/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 Datei geändert, 1 neue Datei/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /📂 x/ })).toBeDefined()
    if (surface === 'desktop') {
      const svg = await ui.find({ type: 'Svg' })
      expect(svg).toBeDefined()
      // Offene Änderungen oben, Zeichen mit Erklärung, Farblegende
      expect(await ui.find({ type: 'Text', text: /Im Ordner: 1 Datei geändert/ })).toBeDefined()
      // Zeichen als Grafik: Briefumschlag (hochladen fehlt) und Zusammenführen an c3, Schraubenschlüssel oben
      expect(await ui.find({ key: 'zeichen-c3-push' })).toBeDefined()
      expect(await ui.find({ key: 'zeichen-c3-merge' })).toBeDefined()
      expect(await ui.find({ key: 'zeichen-c1-branch' })).toBeDefined()
      expect(await ui.find({ key: 'zeichen-arbeit-work' })).toBeDefined()
      expect((await ui.findAll({ type: 'Svg' })).length).toBeGreaterThan(8)
      expect(await ui.find({ type: 'Text', text: /„feature“ wurde hier in „main“ übernommen/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /noch nicht hochgeladen \(push fehlt\)/ })).toBeDefined()
      const all = (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' | ')
      expect(all).toContain('feature – zusammengeführt')
      expect(all).toContain('Abzweig (branch): hier beginnt „feature“.')
      expect(all).not.toContain('hier beginnt „main“')
    } else {
      expect(await ui.find({ type: 'Text', text: /Merge feature/ })).toBeDefined()
    }
    await ui.unmount()
  }
})

test('ein Ordner ohne Git wird freundlich gemeldet', { options: { language: 'de' } }, async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'git-tracking' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.cwd', () => ({ value: 'C:/Leer' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('process.run', () => ({
    value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))

  await $.session.start({ cwd: 'C:/Leer', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'git-tracking', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Kein Git-Projekt/ }))?.text).toBe('Kein Git-Projekt')
  await ui.unmount()
})

test('Drei Ebenen (voreingestellt) zeigt GitHub, PC und Ordner mit den Ereignissen aus dem Tagebuch', { options: { language: 'de' } }, async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'git-tracking' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.cwd', () => ({ value: 'C:/Projekte/Demo' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('process.run', (_, e) => ({ value: answerGit(e.argv) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))

  await $.session.start({ cwd: 'C:/Projekte/Demo', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'git-tracking', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const all = async () =>
    [...(await ui.findAll({ type: 'Text' })), ...(await ui.findAll({ type: 'Button' }))].map(t => t.text).join(' | ')
  let texts = await all()
  for (let i = 0; i < 20 && !texts.includes('Jetzt'); i++) texts = await all()
  expect(texts).toContain('in Arbeit · hochladen · abholen')
  expect(texts).toContain('Zusammengeführt → main')
  expect(texts).toContain('Festgehalten + hochgeladen')
  expect(texts).toContain('feature: Feature work')
  expect(texts).toContain('Ordner angelegt: x')
  expect(texts).toContain('Neuer Zweig feature')
  expect(texts).toContain('Erster Speicherstand')
  expect(texts).toContain('Main work')
  expect(texts).not.toContain('Hochgeladen (main)')
  // Hier zusammengeführt und hochgeladen: keine Zeile „bei GitHub“
  expect(texts).not.toContain('Bei GitHub zusammengeführt')
  expect(texts).not.toContain('Woanders zusammengeführt')
  // Zeichen oben: Schraubenschlüssel, Briefumschlag, Aktualisieren
  expect(await ui.find({ key: 'zeichen-jetzt-work' })).toBeDefined()
  expect(await ui.find({ key: 'zeichen-jetzt-push' })).toBeDefined()
  expect(await ui.find({ key: 'zeichen-jetzt-pull' })).toBeDefined()

  // Klick auf „Festgehalten + hochgeladen“ (Zeile 2) klappt die Karte auf
  await ui.press({ key: 'ereignis-2' })
  expect(await ui.find({ type: 'Text', text: /1 Datei geändert/ })).toBeDefined()

  // Zurück zum Gleisplan
  await ui.press({ key: 'ansicht-plan' })
  expect(await ui.find({ key: 'zeichen-c3-merge' })).toBeDefined()
  await ui.unmount()
})

test('Drei Ebenen: Mehrere Zeilen mit demselben Speicherstand – die Karte klappt unter der angeklickten auf', { options: { language: 'de' } }, async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'git-tracking' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.cwd', () => ({ value: 'C:/Projekte/Demo' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('process.run', (_, e) => ({ value: answerGit(e.argv) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))

  await $.session.start({ cwd: 'C:/Projekte/Demo', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'git-tracking', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const buttons = async () => (await ui.findAll({ type: 'Button' })).map(b => ({ key: String(b.key), text: b.text }))
  let list = await buttons()
  for (let i = 0; i < 20 && !list.some(b => b.text === 'Neuer Zweig feature'); i++) list = await buttons()
  // „Ordner angelegt: x“, „Neuer Zweig feature“ und „Erster Speicherstand“ zeigen alle auf c1
  const rowsOnC1 = ['Ordner angelegt: x', 'Neuer Zweig feature', 'Erster Speicherstand'].map(text => list.find(b => b.text === text)?.key)
  for (const key of rowsOnC1) expect(key).toMatch(/^ereignis-\d+$/)

  // Die Karte steht direkt unter der angeklickten Zeile (der Knopf davor ist deren Titel)
  const cardBelow = async () => {
    const now = await buttons()
    const at = now.findIndex(b => b.key === 'frage-hier')
    return at > 0 ? now[at - 1]!.key : null
  }
  for (const key of [rowsOnC1[1]!, rowsOnC1[2]!, rowsOnC1[0]!]) {
    await ui.press({ key })
    expect(await cardBelow()).toBe(key)
    expect((await ui.findAll({ type: 'Button', text: 'Im Chat fragen' })).length).toBe(1)
  }
  // Nochmal dieselbe Zeile: zuklappen
  await ui.press({ key: rowsOnC1[0]! })
  expect(await cardBelow()).toBeNull()
  await ui.unmount()
})

test('English: the three levels speak English, and DE switches to German', { options: { language: 'en' } }, async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'git-tracking' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.cwd', () => ({ value: 'C:/Projekte/Demo' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('process.run', (_, e) => ({ value: answerGit(e.argv) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))

  await $.session.start({ cwd: 'C:/Projekte/Demo', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'git-tracking', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const all = async () =>
    [...(await ui.findAll({ type: 'Text' })), ...(await ui.findAll({ type: 'Button' }))].map(t => t.text).join(' | ')
  let texts = await all()
  for (let i = 0; i < 20 && !texts.includes('Now'); i++) texts = await all()
  expect(texts).toContain('on main branch main')
  expect(texts).toContain('in progress · push · pull')
  expect(texts).toContain('Merged → main')
  expect(texts).toContain('Committed + pushed')
  expect(texts).toContain('feature: Feature work')
  expect(texts).toContain('Worktree created: x')
  expect(texts).toContain('New branch feature')
  expect(texts).toContain('First commit')
  expect(texts).toContain('Three levels')
  expect(texts).not.toContain('Festgehalten')

  // Track plan in English
  await ui.press({ key: 'ansicht-plan' })
  texts = await all()
  expect(texts).toContain('Merge: “feature” was merged into “main” here.')
  expect(texts).toContain('feature – merged')

  // Switch to German in the pane
  await ui.press({ key: 'sprache-de' })
  texts = await all()
  expect(texts).toContain('steht auf dem Hauptzweig main')
  expect(texts).toContain('Gleisplan')
  await ui.unmount()
})

// ---------------------------------------------------------------- Kurzfassung für Claude

const NOW_MS = 1795000600 * 1000

function briefHooks(on: Parameters<TestBody>[1], answer: (argv: readonly string[]) => unknown) {
  mock.clock(on, { now: NOW_MS })
  on('command.register', () => ({ value: { command: 'git-tracking' } }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.cwd', () => ({ value: 'C:/Projekte/Demo' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('process.run', (_, e) => ({ value: answer(e.argv) as ReturnType<typeof answerGit> }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 1795000550 * 1000, isLink: false } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
}

test('Kurzfassung: Claude bekommt beim Start den Git-Stand als Kontext-Block', { options: { language: 'de' } }, async ($, on) => {
  briefHooks(on, answerGit)
  await $.session.start({ cwd: 'C:/Projekte/Demo', surface: 'desktop', isInteractive: true })

  const res = await $.prompt.context({ blocks: [{ name: 'currentDate', text: 'heute' }] })
  expect(res.blocks[0]?.name).toBe('currentDate')
  const block = res.blocks.find(b => b.name === 'gitTracking')
  expect(block).toBeDefined()
  const text = block!.text
  expect(text).toContain('Der Ordner C:/Projekte/Demo ist der Hauptordner der Ablage und steht auf dem Hauptzweig main.')
  expect(text).toContain('In diesem Ordner: geändert, noch nicht festgehalten (uncommitted): 1 Datei geändert, 1 neue Datei; zuletzt bearbeitet gerade eben')
  expect(text).toContain('Letzte Git-Aktion in diesem Ordner: festgehalten (commit) „Feature work“')
  expect(text).toContain('Noch nicht hochgeladen (push): 2 Speicherstände.')
  expect(text).toContain('Noch nicht abgeholt (pull): 1 Speicherstand auf origin/main')
  expect(text).toContain(
    'Entwicklungszweige (branches) neben main: 2. Noch nicht zusammengeführt: feature (letzter Speicherstand vor 6 Min.), idee (2 Speicherstände nur auf diesem PC, letzter Speicherstand vor 10 Min.).',
  )
  expect(text).toContain('Bei GitHub (origin) außer main: 2 Zweige; schon in main zusammengeführt: alt; 1 weitere wie bei den Entwicklungszweigen oben.')
  expect(text).toContain('Weitere Ordner dieser Ablage (worktrees): 1')
  expect(text).toContain('· .claude/worktrees/x – steht ohne Zweig auf Speicherstand f1 (detached HEAD): geändert, noch nicht festgehalten (uncommitted): 1 Datei geändert, 1 neue Datei; zuletzt bearbeitet gerade eben')
  expect(text).not.toContain('umgeschaltet')
})

test('Summary: the same in English', { options: { language: 'en' } }, async ($, on) => {
  briefHooks(on, answerGit)
  await $.session.start({ cwd: 'C:/Projekte/Demo', surface: 'desktop', isInteractive: true })
  const text = (await $.prompt.context({ blocks: [] })).blocks.find(b => b.name === 'gitTracking')?.text ?? ''
  expect(text).toContain('The folder C:/Projekte/Demo is the repository\'s main folder and is on the main branch main.')
  expect(text).toContain('Branches besides main: 2. Not merged yet: feature (last commit 6 min ago), idee (2 commits only on this computer, last commit 10 min ago).')
  expect(text).toContain('Last Git action in this folder: commit “Feature work”')
})

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
function answerClean(argv: readonly string[]) {
  const args = argv.slice(argv.indexOf('color.ui=never') + 1)
  switch (args[0]) {
    case 'rev-parse':
      return ok('C:/Projekte/Demo\n')
    case 'status':
      return ok('# branch.oid c3\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n')
    case 'worktree':
      return ok('worktree C:/Projekte/Demo\nHEAD c3\nbranch refs/heads/main\n')
    case 'remote':
      return ok('origin\n')
    case 'for-each-ref':
      return args.some(a => a.startsWith('--merged='))
        ? ok('refs/heads/main\nrefs/remotes/origin/main\n')
        : ok('refs/heads/main\torigin/main\t\t1795000500\nrefs/remotes/origin/main\t\t\t1795000500\n')
    case 'rev-list':
      return ok('0\n')
    case 'log':
      return ok(day('HEAD@{1795000500}', 'c3', 'commit: Main work'))
    default:
      return ok('')
  }
}

test('Kurzfassung: nichts Auffälliges – kein Block', { options: { language: 'de' } }, async ($, on) => {
  briefHooks(on, answerClean)
  await $.session.start({ cwd: 'C:/Projekte/Demo', surface: 'desktop', isInteractive: true })
  const res = await $.prompt.context({ blocks: [] })
  expect(res.blocks.find(b => b.name === 'gitTracking')).toBeUndefined()
})

test('Kurzfassung: abgeschaltet – kein Block', { options: { language: 'de', claudeSummary: 'off' } }, async ($, on) => {
  briefHooks(on, answerGit)
  await $.session.start({ cwd: 'C:/Projekte/Demo', surface: 'desktop', isInteractive: true })
  const res = await $.prompt.context({ blocks: [] })
  expect(res.blocks.find(b => b.name === 'gitTracking')).toBeUndefined()
})

// Nur auf diesem PC: ein Speicherstand, keine GitHub-Ablage
function answerLocal(argv: readonly string[]) {
  const args = argv.slice(argv.indexOf('color.ui=never') + 1)
  switch (args[0]) {
    case 'rev-parse':
      return ok('C:/Projekte/Demo\n')
    case 'status':
      return ok('# branch.oid c1\n# branch.head main\n')
    case 'worktree':
      return ok('worktree C:/Projekte/Demo\nHEAD c1\nbranch refs/heads/main\n')
    case 'for-each-ref':
      return args.some(a => a.includes('upstream:track')) ? ok('refs/heads/main\tc1\t\t\n') : ok('refs/heads/main\n')
    case 'rev-list':
      return args.includes('--count') ? ok('0\n') : ok('c1\n')
    case 'log':
      if (args.includes('-g')) return ok(day('HEAD@{1795000050}', 'c1', 'commit (initial): Start'))
      if (args.includes('--max-parents=0')) return ok('1795000050\n')
      return ok(rec('c1', '', 'HEAD -> refs/heads/main', 'Start'))
    default:
      return ok('')
  }
}

async function nowLine($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], answer: (argv: readonly string[]) => unknown) {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'git-tracking' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.cwd', () => ({ value: 'C:/Projekte/Demo' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('process.run', (_, e) => ({ value: answer(e.argv) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))
  await $.session.start({ cwd: 'C:/Projekte/Demo', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'git-tracking', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const all = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' | ')
  let texts = await all()
  for (let i = 0; i < 20 && !texts.includes('Jetzt'); i++) texts = await all()
  await ui.unmount()
  return texts
}

test('Drei Ebenen: ohne GitHub-Ablage behauptet „Jetzt“ kein Hochladen und Abholen', { options: { language: 'de' } }, async ($, on) => {
  const texts = await nowLine($, on, answerLocal)
  expect(texts).toContain('nur lokal, keine GitHub-Ablage')
  expect(texts).toContain('| alles festgehalten, nur auf diesem PC |')
  expect(texts).not.toContain('alles festgehalten, hochgeladen')
})

test('Drei Ebenen: mit GitHub-Ablage und nichts offen heißt „Jetzt“ hochgeladen und abgeholt', { options: { language: 'de' } }, async ($, on) => {
  const texts = await nowLine($, on, answerClean)
  // Bei 60 Spalten Breite gekürzt
  expect(texts).toContain('| alles festgehalten, hochgeladen und a')
  expect(texts).not.toContain('nur auf diesem PC')
})

// ---------------------------------------------------------------- Anderer Ordner, Ordnerwahl, An Claude geben

const NO_GIT = { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository', isStdoutTruncated: false, isStderrTruncated: false }

/** Sitzung in C:/Leer (ohne Git); Git antwortet nur für C:/Projekte/Demo, der Auswahldialog wählt Demo */
function otherFolderHooks(on: Parameters<TestBody>[1], dialogRuns: string[][]) {
  on('command.register', () => ({ value: { command: 'git-tracking' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: 'C:/Leer' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('session.info', () => ({ value: { platform: 'windows', transcriptPath: 'C:/t.jsonl' } as never }))
  on('process.run', (_, e) => {
    if (e.argv[0] === 'powershell') {
      dialogRuns.push([...e.argv])
      return { value: ok('C:\\Projekte\\Demo\r\n') }
    }
    const cwd = (e.init?.cwd ?? 'C:/Leer').replace(/\\/g, '/')
    return { value: cwd.startsWith('C:/Leer') ? NO_GIT : answerGit(e.argv) }
  })
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 1795000550 * 1000, isLink: false } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
}

const CMD = { command: 'git-tracking', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

test('Anderer Ordner: Claude bekommt den Stand des gezeigten Ordners – beim Wechsel und beim Start', { options: { language: 'de' } }, async ($, on) => {
  mock.clock(on, { now: NOW_MS })
  const session = mock.session(on)
  otherFolderHooks(on, [])
  await $.session.start({ cwd: 'C:/Leer', surface: 'desktop', isInteractive: true })

  // Der Sitzungsordner hat kein Git: beim Start keine Kurzfassung
  expect((await $.prompt.context({ blocks: [] })).blocks.find(b => b.name === 'gitTracking')).toBeUndefined()

  // /git-tracking <Ordner>: Claude bekommt den Stand mit der nächsten Nachricht
  const r = await $.command.run({ ...CMD, args: 'C:/Projekte/Demo' })
  expect(r.text).toContain('Claude bekommt den Git-Stand mit deiner nächsten Nachricht.')
  const rows = JSON.stringify(session.appended())
  expect(rows).toContain('der Nutzer hat im Git-Tracking-Fenster auf dieses Projekt gewechselt')
  expect(rows).toContain('Der Ordner C:/Projekte/Demo ist der Hauptordner der Ablage')

  // Neuer Startkontext (z. B. nach /clear): Kurzfassung des gezeigten Ordners, auch wenn alles ruhig wäre
  const text = (await $.prompt.context({ blocks: [] })).blocks.find(b => b.name === 'gitTracking')?.text ?? ''
  expect(text).toContain('Git-Stand des Projekts, das der Nutzer im Git-Tracking-Fenster gewählt hat (nicht der Ordner dieser Sitzung)')
  expect(text).toContain('Der Ordner C:/Projekte/Demo ist der Hauptordner der Ablage')

  // Derselbe Ordner noch einmal: nichts Neues an Claude
  const count = session.appended().length
  await $.command.run({ ...CMD, args: 'C:/Projekte/Demo' })
  expect(session.appended().length).toBe(count)
})

test('Knöpfe: „Ordner wählen …“ öffnet den Dialog, „An Claude geben“ übergibt den Stand', { options: { language: 'de' } }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW_MS })
  const session = mock.session(on)
  const dialogRuns: string[][] = []
  otherFolderHooks(on, dialogRuns)
  await $.session.start({ cwd: 'C:/Leer', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...CMD, args: '' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Kein Git-Projekt/ })).toBeDefined()
  // Ohne Git-Projekt gibt es nichts zu übergeben, nur die Ordnerwahl
  expect(await ui.find({ key: 'an-claude' })).toBeUndefined()

  await ui.press({ key: 'ordner-waehlen' })
  await clock.advance(1)
  const rowsText = () => JSON.stringify(session.appended())
  for (let i = 0; i < 50 && !rowsText().includes('Claude bekommt den Git-Stand von'); i++) await ui.findAll({ type: 'Text' })
  expect(dialogRuns.length).toBe(1)
  expect(dialogRuns[0]).toContain('-EncodedCommand')
  expect(rowsText()).toContain('auf dieses Projekt gewechselt')
  expect(rowsText()).toContain('Git-Tracking: Claude bekommt den Git-Stand von „Demo“ mit deiner nächsten Nachricht.')

  // Das Fenster zeigt jetzt Demo, mit Pfad und den Knöpfen
  let texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' | ')
  for (let i = 0; i < 20 && !texts.includes('📁 C:/Projekte/Demo'); i++) texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' | ')
  expect(texts).toContain('📁 C:/Projekte/Demo')

  await ui.press({ key: 'an-claude' })
  expect(rowsText()).toContain('der Nutzer hat den aktuellen Git-Stand dieses Projekts an Claude gegeben')

  // Zurück zum Sitzungsordner
  await ui.press({ key: 'home' })
  expect(await ui.find({ type: 'Text', text: /Kein Git-Projekt/ })).toBeDefined()
  await ui.unmount()
})

test('Ordnerwahl: Befehl je System und Auswertung der Antwort', async () => {
  expect(pickerCommand('windows', 'T', 'E:/X')?.argv).toContain('-STA')
  expect(pickerCommand('windows', 'T', 'E:/X')?.env.GT_START).toBe('E:/X')
  expect(pickerCommand('macos', 'T', null)?.argv[0]).toBe('osascript')
  expect(pickerCommand('linux', 'T', '/home/a')?.argv).toContain('--filename=/home/a/')
  expect(pickerCommand('unknown', 'T', null)).toBeNull()
  expect(pickedFolder('C:\\Projekte\\Demo\r\n')).toBe('C:\\Projekte\\Demo')
  expect(pickedFolder('/Users/a/Projekt/\n')).toBe('/Users/a/Projekt')
  expect(pickedFolder('C:\\')).toBe('C:\\')
  expect(pickedFolder('')).toBeNull()
  // Base64 von UTF-16LE: "A" = 41 00
  expect(encodePowerShell('A')).toBe('QQA=')
})

test('Fenstertitel mit der Fassung aus plugin.json', { options: { language: 'de' } }, async ($, on) => {
  mock.clock(on, { now: NOW_MS })
  const titles: string[] = []
  on('command.register', () => ({ value: { command: 'git-tracking' } }))
  on('ui.open', (_, e) => {
    titles.push(e.title ?? "")
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: [] }))
  on('session.cwd', () => ({ value: 'C:/Projekte/Demo' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('process.run', (_, e) => ({ value: answerGit(e.argv) }))
  on('fs.read', (_, e) => ({ value: e.path.endsWith('plugin.json') ? '{ "name": "git-tracking", "version": "9.8.7" }' : '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))

  await $.session.start({ cwd: 'C:/Projekte/Demo', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...CMD, args: '' })
  expect(titles).toContain('Git-Tracking 9.8.7')
})

test('Drei Ebenen: bei GitHub zusammengeführt wird erkannt, erledigte Zweige laufen aus', async () => {
  // Zweig feat hochgeladen, bei GitHub per Änderungsvorschlag zusammengeführt (m1), dann abgeholt
  const en = (ref: string, hash: string, time: number, msg: string): DiaryEntry => ({ ref, hash, time, msg })
  const diary: GleisDiary = {
    entries: [
      en('heads/main', 'c1', 100, 'commit (initial): Start'),
      en('folder:0', 'c1', 100, 'commit (initial): Start'),
      en('remotes/origin/main', 'c1', 110, 'update by push'),
      en('heads/feat', 'c1', 200, 'branch: Created from main'),
      en('folder:0', 'c1', 200, 'checkout: moving from main to feat'),
      en('heads/feat', 'f1', 300, 'commit: Feat work'),
      en('folder:0', 'f1', 300, 'commit: Feat work'),
      en('remotes/origin/feat', 'f1', 310, 'update by push'),
      en('folder:0', 'c1', 320, 'checkout: moving from feat to main'),
      en('remotes/origin/main', 'x9', 330, 'update by push'),
      en('remotes/origin/main', 'm1', 500, 'fetch: fast-forward'),
      en('heads/main', 'm1', 510, 'pull: Fast-forward'),
      en('folder:0', 'm1', 510, 'pull: Fast-forward'),
    ],
    folders: [{ path: 'C:/P', name: 'P', branch: 'main', isMain: true, dirty: 0 }],
    track: [
      { branch: 'main', tip: 'm1', upstream: 'origin/main', ahead: 0, behind: 0 },
      { branch: 'feat', tip: 'f1', upstream: 'origin/feat', ahead: 0, behind: 0 },
    ],
    remoteBranches: ['origin/main', 'origin/feat'],
    oldestCommit: 100,
    mainRemote: 'origin/main',
    remoteMerges: [
      { hash: 'm1', parents: ['x9', 'f1'], time: 400, committer: 'noreply@github.com', subject: 'Merge pull request #3 from ShakieVan/feat' },
      // von hier hochgeladen: entstand auf diesem PC
      { hash: 'x9', parents: ['c1', 'f0'], time: 330, committer: 't@t', subject: "Merge branch 'alt'" },
      // vor dem Tagebuch
      { hash: 'old', parents: ['a', 'b'], time: 10, committer: 't@t', subject: "Merge branch 'uralt'" },
    ],
    unmergedRemote: [],
  }
  const t = texts('de')
  const evs = diaryEvents(diary, ['main', 'feat'])
  const gh = evs.filter(e => e.kind === 'remotemerge')
  expect(gh.length).toBe(1)
  expect(gh[0]!.from).toBe('origin/feat')
  expect(gh[0]!.pr).toBe(3)
  expect(eventLines(gh[0]!, () => 'Hauptordner', 'main', t)).toEqual({
    title: 'Bei GitHub zusammengeführt → main',
    detail: 'aus feat · Änderungsvorschlag #3',
  })
  // Anlegen und Umschalten in derselben Sekunde: das Anlegen steht darunter
  const create = evs.findIndex(e => e.kind === 'create')
  const checkout = evs.findIndex(e => e.kind === 'checkout' && e.branch === 'feat')
  expect(create).toBeGreaterThan(checkout)

  const opts = { mainBranch: 'main', branches: ['main', 'feat'], current: 'main', unmerged: [] as string[], limit: 50, compact: false, t }
  const model = ebenenModel(evs, diary, opts)
  const lane = (k: string) => model.lanes.find(l => l.key === k)
  const rowOf = (ev: DiaryEvent) => model.rows.findIndex(r => r.kind === 'event' && r.ev === ev)
  expect(lane('b:main')?.top).toBe(0)
  expect(lane('r:origin/main')?.top).toBe(0)
  // feat ist zusammengeführt und hochgeladen: beide Spuren enden, die GitHub-Spur am Zusammenführen
  expect(lane('r:origin/feat')?.idle).toBe(true)
  expect(lane('r:origin/feat')?.top).toBe(rowOf(gh[0]!))
  expect(lane('b:feat')?.idle).toBe(true)
  expect(lane('b:feat')?.top).toBe(rowOf(evs.find(e => e.kind === 'commit' && e.branch === 'feat')!))
  // … und reicht nicht unter ihr Anlegen hinaus
  expect(lane('b:feat')?.bottom).toBe(rowOf(evs[create]!))

  const drawing = ebenenSlices(model, { status: new Map(), selectedRow: null, mainBranch: 'main', t })
  // Blaue Schräge von feat nach main bei GitHub, auslaufende Linie über dem letzten Festhalten von feat
  expect(drawing.rows[rowOf(gh[0]!)]!.svg).toContain('stroke="#3b8eea" stroke-width="3" stroke-linejoin="round"')
  expect(drawing.rows[lane('b:feat')!.top]!.svg).toContain('stroke-opacity="0.45"')

  // Noch nicht zusammengeführt (oder noch nicht hochgeladen): reicht bis „Jetzt“
  const open = ebenenModel(evs, { ...diary, unmergedRemote: ['origin/feat'] }, { ...opts, unmerged: ['feat'] })
  expect(open.lanes.find(l => l.key === 'b:feat')?.top).toBe(0)
  expect(open.lanes.find(l => l.key === 'r:origin/feat')?.top).toBe(0)
  const ahead = ebenenModel(evs, { ...diary, track: [{ branch: 'feat', tip: 'f2', upstream: 'origin/feat', ahead: 1, behind: 0 }] }, opts)
  expect(ahead.lanes.find(l => l.key === 'b:feat')?.top).toBe(0)

  // GitHub-Zweig schon gelöscht: Name im Text, aber keine Spur
  const gone = diaryEvents({ ...diary, remoteBranches: ['origin/main'] }, ['main', 'feat']).find(e => e.kind === 'remotemerge')!
  expect(mergedLane(gone)).toBeNull()
  expect(eventLines(gone, () => '', 'main', t).detail).toBe('aus feat · Änderungsvorschlag #3')
  // Geänderter Text beim Zusammenführen auf der Webseite: GitHub als Ersteller verrät es trotzdem
  const renamed = diaryEvents(
    {
      ...diary,
      remoteMerges: [{ hash: 'm1', parents: ['x9', 'f1'], time: 400, committer: 'noreply@github.com', subject: 'Merge: Projektordner aufräumen' }],
    },
    ['main', 'feat'],
  ).find(e => e.kind === 'remotemerge')!
  expect(eventLines(renamed, () => '', 'main', t)).toEqual({ title: 'Bei GitHub zusammengeführt → main', detail: 'aus feat' })
  // Auf einem anderen Rechner zusammengeführt
  const other = diaryEvents(
    { ...diary, remoteMerges: [{ hash: 'm1', parents: ['x9', 'f1'], time: 400, committer: 't@t', subject: "Merge branch 'feat'" }] },
    ['main', 'feat'],
  ).find(e => e.kind === 'remotemerge')!
  expect(eventLines(other, () => '', 'main', texts('en'))).toEqual({
    title: 'Merged elsewhere → main',
    detail: 'from feat · on another computer (e.g. Claude in the cloud)',
  })
  expect(parseMerges('m1\x1fx9 f1\x1f400\x1fnoreply@github.com\x1fMerge pull request #3 from a/feat\n')).toEqual([
    { hash: 'm1', parents: ['x9', 'f1'], time: 400, committer: 'noreply@github.com', subject: 'Merge pull request #3 from a/feat' },
  ])
})
