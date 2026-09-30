/**
 * The backup panel's behaviour, tested through the DOM.
 *
 * The unit tests in `backup.test.ts` cover the parser and the writer. What they
 * cannot cover is the thing a student actually does: pick a file, read what it
 * says, and *then* decide. These tests exist to pin that the decision is real —
 * that picking a file never writes anything, and that a rejected file leaves the
 * device untouched.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackupPanel } from "@/features/backup/BackupPanel";
import { BACKUP_VERSION, TRAVELLING_KEYS } from "@/features/backup/keys";

function installStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal("localStorage", storage);
  return map;
}

/** A file the student picks, backed by text rather than a real disk. */
function fileWith(text: string, name = "backup.json"): File {
  return new File([text], name, { type: "application/json" });
}

/** Drive the hidden file input the way a picker would. */
async function pickFile(user: ReturnType<typeof userEvent.setup>, file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await user.upload(input, file);
}

const validBackup = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: "ntacbt.backup",
    version: BACKUP_VERSION,
    exportedAt: "2026-09-30T10:00:00.000Z",
    entries: [
      { key: "ntacbt.cbt.v1", value: { tests: [{ id: "t1" }, { id: "t2" }] }, present: true },
      {
        key: "ntacbt.focus.v1",
        value: { sessions: [{ id: "s1" }], dailyTargetSec: 5400 },
        present: true,
      },
      ...Object.entries(extra).map(([k, v]) => ({ key: k, value: v, present: true })),
    ],
  });

beforeEach(() => {
  installStorage();
});

describe("BackupPanel", () => {
  it("explains where the data is and what the button does", () => {
    render(<BackupPanel />);
    expect(screen.getByText(/lives in this browser/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download backup/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restore from file/i })).toBeInTheDocument();
  });

  it("tells a student with nothing yet, rather than showing an empty list", () => {
    render(<BackupPanel />);
    expect(screen.getByText(/nothing to back up yet/i)).toBeInTheDocument();
  });

  it("does not offer 'nothing to back up' once there is something", () => {
    installStorage({ "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "t1" }] }) });
    render(<BackupPanel />);
    expect(screen.queryByText(/nothing to back up yet/i)).not.toBeInTheDocument();
  });

  it("downloads a file containing the student's own keys", async () => {
    const map = installStorage({
      "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "t1" }] }),
      "ntacbt.focus.v1": JSON.stringify({ sessions: [], dailyTargetSec: 5400 }),
      // Must not appear in the download.
      "some.other.app": JSON.stringify({ nope: true }),
    });
    const user = userEvent.setup();

    // Capture what the download would contain rather than triggering a real one.
    // Read with FileReader, not `blob.text()` — jsdom implements neither
    // `Blob.text` nor `File.text`, so the obvious version of this mock silently
    // captures nothing and the test fails for the wrong reason.
    const created: string[] = [];
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      const reader = new FileReader();
      reader.onload = () => created.push(String(reader.result ?? ""));
      reader.readAsText(blob);
      return "blob:fake";
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<BackupPanel />);
    await user.click(screen.getByRole("button", { name: /download backup/i }));

    await waitFor(() => expect(created.length).toBe(1));
    const text = created[0]!;
    const parsed = JSON.parse(text) as { entries: Array<{ key: string }> };
    expect(parsed.entries.map((e) => e.key)).toEqual([...TRAVELLING_KEYS]);
    expect(text).not.toContain("some.other.app");

    clickSpy.mockRestore();
    URL.createObjectURL = realCreate;
    // Sanity: the device was not modified by exporting.
    expect(map.get("some.other.app")).toBe(JSON.stringify({ nope: true }));
  });

  it("shows what a picked file contains before writing anything", async () => {
    const map = installStorage({ "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "mine" }] }) });
    const user = userEvent.setup();
    render(<BackupPanel />);
    await pickFile(user, fileWith(validBackup()));

    // The preview appears.
    expect(await screen.findByText(/this backup contains/i)).toBeInTheDocument();
    expect(screen.getByText("saved tests")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("focus sessions")).toBeInTheDocument();

    // And crucially: nothing has been written yet.
    expect(JSON.parse(map.get("ntacbt.cbt.v1")!)).toEqual({ tests: [{ id: "mine" }] });
    // Only the two replace/merge buttons and cancel are offered now.
    expect(screen.getByRole("button", { name: /replace this device/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /merge in/i })).toBeInTheDocument();
  });

  it("refuses a file that is not a backup, and leaves the device alone", async () => {
    const map = installStorage({ "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "mine" }] }) });
    const user = userEvent.setup();
    render(<BackupPanel />);
    await pickFile(user, fileWith('{"some":"other","app":true}'));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not an NTACBT backup/i);
    // No preview, no replace button.
    expect(screen.queryByRole("button", { name: /replace this device/i })).not.toBeInTheDocument();
    expect(JSON.parse(map.get("ntacbt.cbt.v1")!)).toEqual({ tests: [{ id: "mine" }] });
  });

  it("refuses a truncated file without throwing", async () => {
    const user = userEvent.setup();
    render(<BackupPanel />);
    await pickFile(user, fileWith('{"format":"ntacbt.backup","vers'));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not valid JSON/i);
  });

  it("refuses a backup from an unknown version rather than guessing", async () => {
    const user = userEvent.setup();
    render(<BackupPanel />);
    await pickFile(
      user,
      fileWith(
        JSON.stringify({
          format: "ntacbt.backup",
          version: 99,
          exportedAt: "2030-01-01T00:00:00.000Z",
          entries: [{ key: "ntacbt.cbt.v1", value: { tests: [] }, present: true }],
        }),
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/different version/i);
  });

  it("replace writes the file and reloads", async () => {
    const map = installStorage({ "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "mine" }] }) });
    const user = userEvent.setup();
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });

    render(<BackupPanel />);
    await pickFile(user, fileWith(validBackup()));
    await user.click(await screen.findByRole("button", { name: /replace this device/i }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(JSON.parse(map.get("ntacbt.cbt.v1")!)).toEqual({ tests: [{ id: "t1" }, { id: "t2" }] });
    expect(JSON.parse(map.get("ntacbt.focus.v1")!)).toEqual({
      sessions: [{ id: "s1" }],
      dailyTargetSec: 5400,
    });
    // The reload is scheduled so in-memory state cannot contradict storage.
    await waitFor(() => expect(reload).toHaveBeenCalled(), { timeout: 3000 });
  });

  it("merge keeps what was done since the backup", async () => {
    const map = installStorage({ "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "since" }] }) });
    const user = userEvent.setup();
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });

    render(<BackupPanel />);
    await pickFile(user, fileWith(validBackup()));
    await user.click(await screen.findByRole("button", { name: /merge in/i }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(JSON.parse(map.get("ntacbt.cbt.v1")!)).toEqual({ tests: [{ id: "since" }] });
    // But a key the device lacked is filled in.
    expect(JSON.parse(map.get("ntacbt.focus.v1")!)).toEqual({
      sessions: [{ id: "s1" }],
      dailyTargetSec: 5400,
    });
  });

  it("cancel returns to the idle state and writes nothing", async () => {
    const map = installStorage({ "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "mine" }] }) });
    const user = userEvent.setup();
    render(<BackupPanel />);
    await pickFile(user, fileWith(validBackup()));
    await user.click(await screen.findByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByText(/this backup contains/i)).not.toBeInTheDocument();
    expect(JSON.parse(map.get("ntacbt.cbt.v1")!)).toEqual({ tests: [{ id: "mine" }] });
  });

  it("warns about entries it will skip instead of writing them", async () => {
    const user = userEvent.setup();
    render(<BackupPanel />);
    await pickFile(user, fileWith(validBackup({ "ntacbt.from-the-future": { mystery: true } })));
    expect(await screen.findByText(/not recognised and will be skipped/i)).toBeInTheDocument();
  });

  it("keeps the file input labelled for a screen reader", () => {
    render(<BackupPanel />);
    expect(screen.getByLabelText(/choose a backup file to restore/i)).toBeInTheDocument();
  });
});
