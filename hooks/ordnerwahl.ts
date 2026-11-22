/**
 * Ordnerwahl: öffnet den Auswahldialog des Betriebssystems und gibt den gewählten
 * Ordner zurück. Unter Windows der Explorer-Dialog „Ordner auswählen“ (über
 * Windows PowerShell, das auf jedem Windows vorhanden ist), unter macOS
 * „choose folder“, unter Linux zenity. Pfade und Titel gehen über Umgebungs-
 * variablen hinein, nie in den Befehlstext.
 */

/** Der moderne Ordnerdialog (IFileOpenDialog mit FOS_PICKFOLDERS) für Windows PowerShell 5.1 */
export const PICKER_CS = `
using System;
using System.Runtime.InteropServices;
public static class GitTrackingPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialogCo {}
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint count, IntPtr specs);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr sink, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint fos);
    void GetOptions(out uint fos);
    void SetDefaultFolder(IShellItem item);
    void SetFolder(IShellItem item);
    void GetFolder(out IShellItem item);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IShellItem item);
    void AddPlace(IShellItem item, int place);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string ext);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr filter);
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem item);
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
    void GetAttributes(uint mask, out uint attribs);
    void Compare(IShellItem item, uint hint, out int order);
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, ref Guid riid, out IShellItem item);

  public static string Pick(IntPtr owner, string title, string start) {
    IFileDialog d = (IFileDialog)new FileOpenDialogCo();
    uint fos;
    d.GetOptions(out fos);
    d.SetOptions(fos | 0x20 | 0x40);
    if (!String.IsNullOrEmpty(title)) d.SetTitle(title);
    if (!String.IsNullOrEmpty(start)) {
      try {
        Guid g = typeof(IShellItem).GUID;
        IShellItem folder;
        // Die Shell versteht nur Rückstriche (C:/x wäre kein gültiger Pfad)
        SHCreateItemFromParsingName(start.Replace('/', '\\\\'), IntPtr.Zero, ref g, out folder);
        d.SetFolder(folder);
      } catch {}
    }
    if (d.Show(owner) != 0) return null;
    IShellItem result;
    d.GetResult(out result);
    string path;
    result.GetDisplayName(0x80058000, out path);
    return path;
  }
}
`

/**
 * Das PowerShell-Skript: ein unsichtbares Fenster ganz oben als Besitzer, damit der
 * Dialog nicht hinter Claude aufgeht; klappt der moderne Dialog nicht, der alte.
 * Gibt den Pfad (UTF-8) aus, bei Abbruch nichts.
 */
export const PICKER_PS = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.FormBorderStyle = 'None'
$owner.Opacity = 0
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Show()
$owner.Activate()
$picked = $null
try {
  Add-Type -TypeDefinition $env:GT_PICKER_CS -Language CSharp
  $picked = [GitTrackingPicker]::Pick($owner.Handle, $env:GT_TITLE, $env:GT_START)
} catch {
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = $env:GT_TITLE
  $d.ShowNewFolderButton = $false
  if ($env:GT_START) { $d.SelectedPath = $env:GT_START -replace '/', '\\' }
  if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $picked = $d.SelectedPath }
}
$owner.Close()
if ($picked) { [Console]::Out.Write($picked) }
`

/** Text als Base64 von UTF-16LE, wie powershell -EncodedCommand ihn erwartet */
export function encodePowerShell(script: string): string {
  const bytes: number[] = []
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i)
    bytes.push(c & 0xff, c >> 8)
  }
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += A[(n >> 18) & 63]! + A[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? A[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? A[n & 63]! : '='
  }
  return out
}

export type Platform = 'macos' | 'windows' | 'wsl' | 'linux' | 'unknown' | undefined

/** Befehl für den Auswahldialog dieses Systems; null = keiner bekannt */
export function pickerCommand(
  platform: Platform,
  title: string,
  start: string | null,
): { argv: string[]; env: Record<string, string> } | null {
  const env: Record<string, string> = { GT_TITLE: title, GT_START: start ?? '' }
  switch (platform) {
    case 'windows':
      return {
        argv: ['powershell', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(PICKER_PS)],
        env: { ...env, GT_PICKER_CS: PICKER_CS },
      }
    case 'macos':
      return {
        argv: [
          'osascript',
          '-e', 'set t to system attribute "GT_TITLE"',
          '-e', 'set s to system attribute "GT_START"',
          '-e', 'try',
          '-e', 'if s is "" then',
          '-e', 'return POSIX path of (choose folder with prompt t)',
          '-e', 'else',
          '-e', 'return POSIX path of (choose folder with prompt t default location (POSIX file s))',
          '-e', 'end if',
          '-e', 'on error',
          '-e', 'return ""',
          '-e', 'end try',
        ],
        env,
      }
    case 'linux':
      return {
        argv: ['zenity', '--file-selection', '--directory', `--title=${title}`, ...(start ? [`--filename=${start.replace(/\/*$/, '/')}`] : [])],
        env,
      }
    default:
      return null
  }
}

/** Der gewählte Ordner aus der Ausgabe des Dialogs; null = abgebrochen */
export function pickedFolder(stdout: string): string | null {
  const p = stdout.replace(/\r/g, '').split('\n').map(x => x.trim()).filter(Boolean).pop() ?? ''
  if (!p) return null
  // macOS hängt einen Schrägstrich an; das Laufwerk C:\ bleibt, wie es ist
  return /^[A-Za-z]:[\\/]$/.test(p) || p === '/' ? p : p.replace(/[\\/]+$/, '')
}
