# Git-Tracking

*[Deutsch weiter unten](#deutsch)*

A Claude Code plugin that shows the Git state of the current project in a side pane – in every project, updated every 10 seconds and after every command or file change Claude makes. It only reads; it never changes the project.

## Two views

**Three levels** (default): GitHub | PC | folders side by side, time running upwards. Every row is an entry in Git's own log on this PC (the reflog):

- **GitHub** (blue): the branches on GitHub, as this PC saw them at the last fetch
- **PC** (yellow): the local branches of the repository
- **Folders** (green): every worktree – the main folder and additional ones, e.g. from Claude sessions; a grey dashed lane collects former folders that no longer exist
- Arrows: yellow to the left = pushed, yellow to the right = fetched/pulled; green to the left = committed, green to the right = checked out into the folder
- A lane reaches “Now” only while something is open on it: not merged into the main branch yet, not pushed or not pulled, or checked out in a folder. Otherwise it fades out after its last event, or bends into the branch it was merged into
- Merges on GitHub (pull request on the website) or on another PC get their own blue row (“Merged on GitHub → main”), read from the merge commits once they have been fetched
- ✕ = branch deleted · grey stub = discarded (reset, amended, rebased)
- The top row (“Now”) marks what is still open: a wrench (work in progress, not committed), a closed envelope (committed, not pushed) and two circular arrows (newer state on GitHub, pull)

**Track plan**: the branches and commits as a metro map – main branch in blue on the left, other branches in their own colours, buffer stops for branches not merged yet, rings showing whether a commit is only here, only on GitHub, or both.

Click any row to see the changed files and ask Claude about that commit – in the current chat, or copied for a new one.

## Summary for Claude

When a conversation starts (and again after `/clear` or a compaction), Git-Tracking gives Claude a few lines of text about the project – what Claude Code’s own Git status leaves out:

- other branches, whether they are merged into the main branch, and which exist only on this PC or only on GitHub
- other worktrees of the repository and whether they hold uncommitted work
- when uncommitted files were last edited (a hint whether another session may still be working on them)
- what is not pushed or not pulled yet, stashes, the last Git action in the folder, and how often the main folder switched branches lately

Nothing is added when there is nothing to report. The lines become part of what Claude Code sends to the model with the first message. Turn it off in the plugin settings: `claudeSummary`: `off`.

The summary is about the folder the pane shows. If that is another folder than the session’s (for example a repository outside the project), Claude gets it for that folder – at the start, and again with your next message whenever you switch folders. The pane remembers the chosen folder for the session’s folder, so the next session there starts with it.

## Buttons

- **📁 Choose folder …** opens the system’s folder dialog (Windows: the Explorer dialog via Windows PowerShell; macOS: `osascript`; Linux: `zenity`) and shows the chosen folder.
- **💬 Give to Claude** hands Claude the current Git state of the shown folder. It is not typed into your prompt box: Claude reads it with your next message, and a line in the conversation says so.
- **Back to this project** shows the session’s own folder again.

The question box on a commit card is different: it writes your question into the prompt box, and you send it yourself.

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

The reflog is kept by each PC itself, usually for about 90 days. What happens on GitHub (another PC, Claude in the cloud, a merge on the website) shows up only after the next fetch. Merges on GitHub are recognised by their merge commit; “squash” and “rebase” merges leave none and do not get a row of their own. Deleting a branch deletes its reflog too: the row “New branch …” disappears, and the lane ends at the oldest event still known. The log of a removed worktree is gone with it; its commits stay.

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
- Eine Spur reicht nur bis „Jetzt“, solange auf ihr etwas offen ist: noch nicht in den Hauptzweig zusammengeführt, noch nicht hochgeladen oder abgeholt, oder ein Ordner arbeitet darauf. Sonst läuft sie nach ihrem letzten Ereignis aus oder biegt in den Zweig ein, in den sie zusammengeführt wurde
- Zusammenführen bei GitHub (Änderungsvorschlag auf der Webseite) oder auf einem anderen Rechner bekommt eine eigene blaue Zeile („Bei GitHub zusammengeführt → main“), erkannt an den Speicherständen, sobald sie abgeholt sind
- ✕ = Zweig gelöscht · grauer Stummel = verworfen (zurückgesetzt, nachträglich geändert, umgeschrieben)
- Oberste Zeile („Jetzt“): Schraubenschlüssel = in Arbeit, noch nicht festgehalten · geschlossener Briefumschlag = festgehalten, noch nicht hochgeladen · zwei Halbkreis-Pfeile = neuerer Stand bei GitHub, abholen

**Gleisplan**: Zweige und Speicherstände als S-Bahn-Plan – Hauptzweig blau links, jeder Entwicklungszweig in seiner Farbe, Prellbock = noch nicht zusammengeführt, Ringe zeigen, ob ein Speicherstand nur hier, nur bei GitHub oder an beiden Orten liegt. Fährt die Maus über ein Zeichen, erscheint die Erklärung.

Ein Klick auf eine Zeile zeigt die geänderten Dateien; dort lässt sich eine Frage an Claude stellen – im aktuellen Chat oder kopiert für einen neuen.

### Kurzfassung für Claude

Beim Start einer Unterhaltung (und wieder nach `/clear` oder dem Zusammenfassen) bekommt Claude ein paar Zeilen Text über das Projekt – das, was der eingebaute Git-Stand von Claude Code nicht sagt:

- andere Entwicklungszweige, ob sie schon im Hauptzweig zusammengeführt sind und welche nur auf diesem PC oder nur bei GitHub liegen
- andere Arbeitsverzeichnisse der Ablage und ob dort etwas geändert, aber noch nicht festgehalten ist
- wann offene Dateien zuletzt bearbeitet wurden (ein Hinweis, ob eine andere Sitzung noch daran arbeitet)
- was noch nicht hochgeladen oder abgeholt ist, Beiseitegelegtes (stash), die letzte Git-Aktion im Ordner und wie oft der Hauptordner zuletzt zwischen Zweigen umgeschaltet wurde

Ist nichts auffällig, kommt nichts dazu. Die Zeilen gehen mit der ersten Nachricht an das Modell. Abschalten in den Plugin-Einstellungen: `claudeSummary`: `off`.

Die Kurzfassung gilt dem Ordner, den das Fenster zeigt. Ist das ein anderer als der Ordner der Sitzung (zum Beispiel eine Git-Ablage außerhalb des Projekts), bekommt Claude sie für diesen Ordner – beim Start und bei jedem Ordnerwechsel wieder mit deiner nächsten Nachricht. Das Fenster merkt sich den gewählten Ordner je Sitzungsordner; die nächste Sitzung dort beginnt damit.

### Knöpfe

- **📁 Ordner wählen …** öffnet den Auswahldialog des Systems (Windows: der Explorer-Dialog über Windows PowerShell; macOS: `osascript`; Linux: `zenity`) und zeigt den gewählten Ordner.
- **💬 An Claude geben** gibt Claude den aktuellen Git-Stand des gezeigten Ordners. Er landet nicht in deinem Eingabefeld: Claude liest ihn mit deiner nächsten Nachricht, und eine Zeile im Gespräch sagt es.
- **Zurück zu diesem Projekt** zeigt wieder den Ordner der Sitzung.

Das Fragefeld an einem Speicherstand arbeitet anders: Es schreibt deine Frage in das Eingabefeld, abschicken musst du selbst.

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

Das Tagebuch führt jeder PC selbst, meist für etwa 90 Tage. Was bei GitHub passiert (anderer PC, Claude in der Cloud, Zusammenführen auf der Webseite), sieht dieser PC erst beim Abholen. Zusammenführen bei GitHub erkennt die Ansicht am Zusammenführungs-Speicherstand; „Squash“- und „Rebase“-Zusammenführen hinterlassen keinen und bekommen keine eigene Zeile. Wer einen Zweig löscht, löscht auch sein Tagebuch: Die Zeile „Neuer Zweig …“ verschwindet, und die Spur beginnt beim ältesten noch bekannten Ereignis. Das Tagebuch eines gelöschten Arbeitsverzeichnisses ist mit ihm weg; seine Speicherstände bleiben.

### Neue Fassungen

```
claude plugin marketplace update git-tracking
claude plugin update git-tracking@git-tracking
```

Danach in einer laufenden Sitzung `/reload-plugins`.

### Lizenz

Frei nutzbar, privat und beruflich, darf verändert und weitergegeben werden. Verkaufen ist nicht erlaubt – auch nicht als abgewandelte Kopie. MIT-Lizenz mit der Bedingung „Commons Clause“, siehe [LICENSE](LICENSE). Damit ist Git-Tracking quelloffen einsehbar, aber keine Open-Source-Software im strengen Sinn (OSI).
