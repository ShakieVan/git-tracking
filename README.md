# Git-Tracking

<img src=".claude-plugin/icon.png" alt="Git-Tracking" width="96" align="right">

*[Deutsch weiter unten](#deutsch)*

A Claude Code plugin that shows the Git state of the current project in a side pane – in every project, updated every 10 seconds and after every command or file change Claude makes. It only reads; it never changes the project.

## Two views

**Three levels** (default): GitHub | PC | folders side by side, time running upwards. Every row is an entry in Git's own log on this PC (the reflog):

- **GitHub** (blue): the branches on GitHub, as this PC saw them at the last fetch
- **PC** (yellow): the local branches of the repository
- **Folders** (green): every worktree – the main folder and additional ones, e.g. from Claude sessions; a grey dashed lane collects former folders that no longer exist
- Arrows: yellow to the left = pushed, yellow to the right = fetched/pulled; green to the left = committed, green to the right = checked out into the folder
- ✕ = branch deleted · grey stub = discarded (reset, amended, rebased)
- The top row (“Now”) marks what is still open: a wrench (work in progress, not committed), a closed envelope (committed, not pushed) and two circular arrows (newer state on GitHub, pull)

**Track plan**: the branches and commits as a metro map – main branch in blue on the left, other branches in their own colours, buffer stops for branches not merged yet, rings showing whether a commit is only here, only on GitHub, or both.

Click any row to see the changed files and ask Claude about that commit – in the current chat, or copied for a new one.

## Language

English and German. The pane follows the system language; **DE | EN** at the top of the pane switches it (remembered). It can also be set in the plugin settings (`language`: `auto`, `de`, `en`).

## Install

```
/plugin install git-tracking --marketplace ShakieVan/git-tracking
```

Answer `y` to add the marketplace and pick the user scope (then it runs in every project). From a shell: `claude plugin install git-tracking --marketplace ShakieVan/git-tracking`. In the desktop app: **+** next to the prompt box → **Plugins** → **Add marketplace** `ShakieVan/git-tracking` → **Add plugin**.

## Updates

```
claude plugin marketplace update git-tracking
claude plugin update git-tracking@git-tracking
```

Then `/reload-plugins` in a running session.

## Command

- `/git-tracking` – open the pane for the session’s project
- `/git-tracking <folder>` – show another project

## Limits

The reflog is kept by each PC itself, usually for about 90 days. What happens on GitHub (another PC, Claude in the cloud, a merge on the website) shows up only after the next fetch. The log of a removed worktree is gone with it; its commits stay.

## License

Free to use, privately and at work, and free to change and share. Selling it – or a modified copy of it – is not allowed. MIT License with the “Commons Clause” condition, see [LICENSE](LICENSE). This makes Git-Tracking source-available, not open source in the OSI sense.

---

## Deutsch

Eine Erweiterung für Claude Code. Sie zeigt in jedem Projekt in einem Seitenfenster den aktuellen Git-Stand, alle 10 Sekunden und nach jedem Befehl oder jeder Dateiänderung von Claude neu gelesen. Sie liest nur und verändert am Projekt nichts.

### Zwei Ansichten

**Drei Ebenen** (voreingestellt): GitHub | PC | Ordner nebeneinander, die Zeit läuft nach oben. Jede Zeile ist ein Eintrag im Tagebuch von Git auf diesem PC (reflog):

- **GitHub** (blau): die Zweige in der GitHub-Ablage, so wie dieser PC sie zuletzt gesehen hat
- **PC** (gelb): die Entwicklungszweige der Ablage auf diesem PC
- **Ordner** (grün): jedes Arbeitsverzeichnis (Hauptordner und zusätzliche, z. B. von Claude-Sitzungen); graue gestrichelte Spur = frühere Ordner, die es nicht mehr gibt
- Pfeile: gelb nach links = hochgeladen (push), gelb nach rechts = abgeholt (fetch/pull); grün nach links = festgehalten (commit), grün nach rechts = in den Ordner geholt (checkout)
- ✕ = Zweig gelöscht · grauer Stummel = verworfen (zurückgesetzt, nachträglich geändert, umgeschrieben)
- Oberste Zeile („Jetzt“): Schraubenschlüssel = in Arbeit, noch nicht festgehalten · geschlossener Briefumschlag = festgehalten, noch nicht hochgeladen · zwei Halbkreis-Pfeile = neuerer Stand bei GitHub, abholen

**Gleisplan**: Zweige und Speicherstände als S-Bahn-Plan – Hauptzweig blau links, jeder Entwicklungszweig in seiner Farbe, Prellbock = noch nicht zusammengeführt, Ringe zeigen, ob ein Speicherstand nur hier, nur bei GitHub oder an beiden Orten liegt. Fährt die Maus über ein Zeichen, erscheint die Erklärung.

Ein Klick auf eine Zeile zeigt die geänderten Dateien; dort lässt sich eine Frage an Claude stellen – im aktuellen Chat oder kopiert für einen neuen.

### Sprache

Deutsch und Englisch. Das Fenster folgt der Sprache des Systems; **DE | EN** oben im Fenster schaltet um (wird gemerkt). Auch in den Plugin-Einstellungen einstellbar (`language`: `auto`, `de`, `en`).

### Installieren

```
/plugin install git-tracking --marketplace ShakieVan/git-tracking
```

„Add marketplace?“ mit `y` beantworten und den Bereich „user“ wählen. Aus einer Shell: `claude plugin install git-tracking --marketplace ShakieVan/git-tracking`. In der Desktop-App: **+** neben dem Eingabefeld → **Plugins** → **Add marketplace** `ShakieVan/git-tracking` → **Add plugin**.

### Befehl

- `/git-tracking` – Fenster öffnen und das Projekt der Sitzung zeigen
- `/git-tracking <Ordner>` – ein anderes Projekt zeigen

### Grenzen

Das Tagebuch führt jeder PC selbst, meist für etwa 90 Tage. Was bei GitHub passiert (anderer PC, Claude in der Cloud, Zusammenführen auf der Webseite), sieht dieser PC erst beim Abholen. Das Tagebuch eines gelöschten Arbeitsverzeichnisses ist mit ihm weg; seine Speicherstände bleiben.

### Neue Fassungen

```
claude plugin marketplace update git-tracking
claude plugin update git-tracking@git-tracking
```

Danach in einer laufenden Sitzung `/reload-plugins`.

### Lizenz

Frei nutzbar, privat und beruflich, darf verändert und weitergegeben werden. Verkaufen ist nicht erlaubt – auch nicht als abgewandelte Kopie. MIT-Lizenz mit der Bedingung „Commons Clause“, siehe [LICENSE](LICENSE). Damit ist Git-Tracking quelloffen einsehbar, aber keine Open-Source-Software im strengen Sinn (OSI).
