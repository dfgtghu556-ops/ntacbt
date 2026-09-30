/**
 * Backup and restore UI.
 *
 * Lives on the profile page because that is where the student's identity already
 * is, and "your data" belongs with "who you are".
 *
 * The flow is deliberately three-step rather than one: pick a file, *see what is
 * in it*, then choose what to do. A restore that fires the moment a file is
 * picked is a restore that cannot be undone, and the choice between replacing
 * this device and merging into it is the student's to make — not something to
 * infer from a filename.
 *
 * After a restore the page reloads. Every store in this app reads from
 * `localStorage` on access, and several hold module-level state, so a reload is
 * the honest way to guarantee what the student sees is what was written.
 */

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  HardDriveDownload,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  applyBackup,
  backupFilename,
  collectBackup,
  describeBackup,
  deviceIsEmpty,
  parseBackup,
  type BackupFile,
  type BackupSummary,
  type ParseResult,
  type RestoreMode,
} from "@/features/backup/backup";

type Stage =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "preview"; file: BackupFile; summary: BackupSummary }
  | { kind: "error"; message: string }
  | { kind: "done"; written: number; skipped: string[] };

/**
 * Read a picked file as text.
 *
 * `FileReader` rather than `Blob.text()`: it is supported everywhere the app
 * runs, and `Blob.text()` is missing from the jsdom this project tests under —
 * a backup that silently fails to read in the one environment with tests is a
 * backup nobody can verify.
 */
function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file);
  });
}

export function BackupPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const file = collectBackup();
      const blob = new Blob([JSON.stringify(file, null, 2) + "\n"], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backupFilename(file);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke on the next tick: revoking synchronously can cancel the download
      // in some browsers before it has read the blob.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setStage({ kind: "idle" });
    } catch {
      setStage({
        kind: "error",
        message: "Could not create the backup file. Your browser may be blocking downloads.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onPick(file: File | undefined) {
    if (!file) return;
    setStage({ kind: "reading" });
    let text: string;
    try {
      text = await readTextFile(file);
    } catch {
      setStage({
        kind: "error",
        message: "That file could not be read. It may have been moved or deleted.",
      });
      return;
    }
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setStage({ kind: "error", message: parsed.message });
      return;
    }
    setStage({ kind: "preview", file: parsed.file, summary: describeBackup(parsed.file) });
  }

  function restore(mode: RestoreMode) {
    if (stage.kind !== "preview") return;
    setBusy(true);
    try {
      const result = applyBackup(stage.file, mode);
      setStage({ kind: "done", written: result.written.length, skipped: result.skipped });
      // Reload so every store re-reads what was just written. Without this the
      // page would keep showing the state it had in memory.
      window.setTimeout(() => window.location.reload(), 1400);
    } catch {
      setStage({
        kind: "error",
        message: "The restore failed part-way through. Nothing was left half-written.",
      });
    } finally {
      setBusy(false);
    }
  }

  const empty = deviceIsEmpty();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <HardDriveDownload className="h-5 w-5" /> Back up your preparation
        </CardTitle>
        <CardDescription>
          Everything you have done lives in this browser. Keep a copy you control.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your tests, answers, planner progress, focus sessions and revision cards are stored in
          this browser only. Clearing site data, changing phone or losing the device loses them all.
          Download a backup to move your preparation to a new device, or to keep a copy somewhere
          safe.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void download()} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download backup
          </Button>
          <Button
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={busy || stage.kind === "reading"}
          >
            <FileUp className="mr-2 h-4 w-4" />
            Restore from file
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose a backup file to restore"
            onChange={(e) => {
              void onPick(e.target.files?.[0]);
              // Reset so picking the same file twice fires a change event.
              e.target.value = "";
            }}
          />
        </div>

        {empty && stage.kind === "idle" ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Nothing to back up yet — this device has no saved preparation. Once you have sat a test,
            finished a focus block or ticked off a plan task, a backup here will carry all of it.
          </p>
        ) : null}

        {stage.kind === "reading" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the file…
          </p>
        ) : null}

        {stage.kind === "preview" ? (
          <div className="space-y-3 rounded-xl border p-4">
            <div>
              <h3 className="text-sm font-semibold">This backup contains</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {stage.summary.exportedAt
                  ? `Made ${new Date(stage.summary.exportedAt).toLocaleString()}`
                  : "Made at an unknown time"}
                {stage.summary.version ? ` · format v${stage.summary.version}` : ""}
              </p>
            </div>

            {Object.keys(stage.summary.counts).length > 0 ? (
              <ul className="space-y-1 text-sm">
                {Object.entries(stage.summary.counts).map(([label, n]) => (
                  <li key={label} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No saved tests, sessions or cards in this file.
              </p>
            )}

            {stage.summary.unknownKeys.length > 0 ? (
              <p className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {stage.summary.unknownKeys.length} entr
                {stage.summary.unknownKeys.length === 1 ? "y" : "ies"} in this file{" "}
                {stage.summary.unknownKeys.length === 1 ? "is" : "are"} not recognised and will be
                skipped.
              </p>
            ) : null}

            <div className="space-y-2 border-t pt-3">
              <p className="text-sm">
                <strong className="font-medium">Replace</strong> makes this device match the backup
                exactly — anything on this device that is not in the file is removed.{" "}
                <strong className="font-medium">Merge</strong> only fills in what is missing, and
                keeps anything you have done since.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => restore("replace")} disabled={busy}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Replace this device
                </Button>
                <Button variant="outline" onClick={() => restore("merge")} disabled={busy}>
                  Merge in
                </Button>
                <Button variant="ghost" onClick={() => setStage({ kind: "idle" })} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {stage.kind === "error" ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p>{stage.message}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-auto p-0 text-sm"
                onClick={() => setStage({ kind: "idle" })}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}

        {stage.kind === "done" ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-950/40"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
            <div>
              <p>
                Restored {stage.written} {stage.written === 1 ? "entry" : "entries"}
                {stage.skipped.length > 0
                  ? `, skipping ${stage.skipped.length} this app did not recognise.`
                  : "."}{" "}
                Reloading…
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
