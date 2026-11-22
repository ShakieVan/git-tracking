import { expect, mock, test } from 'claude-code/testing'

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
      if (args.some(a => a.includes('upstream:track'))) {
        return ok('main\tc3\torigin/main\t[ahead 2, behind 1]\nfeature\tf1\torigin/feature\t\n')
      }
      return args.some(a => a.startsWith('--no-merged'))
        ? ok('feature\n')
        : ok('refs/heads/main\nrefs/heads/feature\nrefs/remotes/origin/main\nrefs/remotes/origin/feature\n')
    case 'rev-list':
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
