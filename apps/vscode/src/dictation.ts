/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { type ChildProcess, execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { SpeechBridge } from "./chatPanel";

/**
 * Host-side microphone capture for dictation.
 *
 * VS Code webviews can't reach the microphone (sandboxed iframe, no
 * allow="microphone" — microsoft/vscode#250568), so capture happens here in the
 * extension host (a normal Node process with OS-level mic access) by spawning a
 * recorder CLI. The recorded WAV is handed to the configured server STT
 * provider via the SpeechBridge. This mirrors how VS Code's own Speech
 * extension captures audio outside the webview.
 *
 * macOS will prompt once for microphone access for the editor — unlike the
 * webview path, granting it actually works.
 */

/** A detected recorder CLI and how to invoke it on this platform. */
interface Recorder {
  /** Display name for logs / errors. */
  readonly name: string;
  /** Executable to spawn. */
  readonly command: string;
  /** Args that record mono 16kHz 16-bit WAV to `wavPath` until terminated. */
  buildArgs(wavPath: string): string[];
}

/** Candidate recorders, most-preferred first. `rec` (SoX) needs no device id. */
function recorderCandidates(): Recorder[] {
  const platform = process.platform;
  const candidates: Recorder[] = [
    {
      name: "SoX (rec)",
      command: "rec",
      buildArgs: (wav) => ["-q", "-c", "1", "-r", "16000", "-b", "16", wav],
    },
  ];

  if (platform === "darwin") {
    candidates.push({
      name: "ffmpeg (avfoundation)",
      command: "ffmpeg",
      // ":0" = default audio input device on macOS avfoundation.
      buildArgs: (wav) => ["-y", "-f", "avfoundation", "-i", ":0", "-ac", "1", "-ar", "16000", wav],
    });
  } else if (platform === "linux") {
    candidates.push({
      name: "ffmpeg (pulse)",
      command: "ffmpeg",
      buildArgs: (wav) => ["-y", "-f", "pulse", "-i", "default", "-ac", "1", "-ar", "16000", wav],
    });
  } else if (platform === "win32") {
    // dshow needs a named device; SoX is the realistic option on Windows. We
    // still list ffmpeg with the common "Microphone" name as a long shot.
    candidates.push({
      name: "ffmpeg (dshow)",
      command: "ffmpeg",
      buildArgs: (wav) => [
        "-y",
        "-f",
        "dshow",
        "-i",
        "audio=Microphone",
        "-ac",
        "1",
        "-ar",
        "16000",
        wav,
      ],
    });
  }
  return candidates;
}

/** Resolve whether `command` is runnable (exists on PATH and starts). */
function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    // `-version` is understood by both ffmpeg and sox/rec and exits fast.
    const child = execFile(command, ["-version"], (error) => {
      // ENOENT => not installed. Any other exit (even nonzero) means it ran.
      resolve(!(error && (error as NodeJS.ErrnoException).code === "ENOENT"));
    });
    child.on("error", () => resolve(false));
  });
}

async function detectRecorder(): Promise<Recorder | undefined> {
  for (const candidate of recorderCandidates()) {
    if (await commandExists(candidate.command)) {
      return candidate;
    }
  }
  return undefined;
}

/** Recorder couldn't be found; carries install guidance for the caller. */
export class NoRecorderError extends Error {
  constructor() {
    super(
      "No microphone recorder found. Install SoX (recommended) or ffmpeg to enable dictation — " +
        "e.g. `brew install sox` on macOS, `sudo apt install sox` on Linux.",
    );
    this.name = "NoRecorderError";
  }
}

type DictationState = "recording" | "transcribing" | "idle";

export interface DictationCallbacks {
  onState(state: DictationState): void;
  onResult(text: string): void;
  onError(message: string): void;
  log(line: string): void;
}

/**
 * Owns a single dictation session: at most one recorder process and temp file
 * at a time. start() begins capture; stop() finalizes the WAV, transcribes it
 * through the SpeechBridge, and reports the text. cancel()/dispose() tear down
 * without transcribing.
 */
export class DictationController {
  private recorder: Recorder | undefined;
  private child: ChildProcess | undefined;
  private wavPath: string | undefined;
  private active = false;
  // start() is async (detect recorder, mkdtemp, spawn); a stop() that lands
  // mid-start sets this so start() tears itself down instead of orphaning a
  // recorder that keeps the mic hot after the user thinks they stopped.
  private stopRequestedDuringStart = false;

  constructor(
    private readonly speechBridge: SpeechBridge | undefined,
    private readonly callbacks: DictationCallbacks,
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  async start(): Promise<void> {
    if (this.active) return;
    this.stopRequestedDuringStart = false;
    if (this.speechBridge === undefined) {
      this.callbacks.onError(
        "Dictation needs a server STT provider (Sarvam / OpenAI-compatible / Hugging Face). " +
          'Run "CodeSetu: Setup Speech Provider".',
      );
      return;
    }

    if (this.recorder === undefined) {
      this.recorder = await detectRecorder();
    }
    if (this.recorder === undefined) {
      throw new NoRecorderError();
    }

    const wavPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "codesetu-dictation-")),
      "capture.wav",
    );
    const args = this.recorder.buildArgs(wavPath);
    this.callbacks.log(`Dictation: starting ${this.recorder.command} ${args.join(" ")}`);

    const child = spawn(this.recorder.command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      this.callbacks.log(`Dictation recorder error: ${String(error)}`);
    });
    child.on("close", (code) => {
      // Non-graceful exits (not from our SIGINT in stop()) surface here.
      if (this.active && code !== 0 && code !== null) {
        this.callbacks.log(`Dictation recorder exited early (code ${code}): ${stderr.trim()}`);
      }
    });

    this.child = child;
    this.wavPath = wavPath;
    this.active = true;

    if (this.stopRequestedDuringStart) {
      // The user stopped before the recorder finished coming up — abort.
      this.cancel();
      return;
    }
    this.callbacks.onState("recording");
  }

  async stop(language: string): Promise<void> {
    if (!this.active || this.child === undefined || this.wavPath === undefined) {
      // Either nothing is running, or a start() is still in flight — flag it so
      // start() aborts when it lands, and reset the UI.
      this.stopRequestedDuringStart = true;
      this.callbacks.onState("idle");
      return;
    }
    const child = this.child;
    const wavPath = this.wavPath;
    this.active = false;
    this.callbacks.onState("transcribing");

    try {
      await stopProcess(child);
      const bytes = await fs.readFile(wavPath);
      if (bytes.byteLength < 2048) {
        // Header-only / near-empty capture — treat as "nothing said".
        this.callbacks.onResult("");
        this.callbacks.onState("idle");
        return;
      }
      if (this.speechBridge === undefined) {
        throw new Error("Speech provider is not configured.");
      }
      const result = await this.speechBridge.transcribe(
        { mimeType: "audio/wav", bytes: new Uint8Array(bytes) },
        language,
      );
      this.callbacks.onResult(result.text);
      this.callbacks.onState("idle");
    } catch (error: unknown) {
      this.callbacks.onError(formatError(error));
      this.callbacks.onState("idle");
    } finally {
      this.child = undefined;
      this.wavPath = undefined;
      void cleanupTemp(wavPath);
    }
  }

  /** Abort the current capture without transcribing. */
  cancel(): void {
    if (this.child !== undefined) {
      this.child.kill("SIGKILL");
    }
    const wavPath = this.wavPath;
    this.child = undefined;
    this.wavPath = undefined;
    this.active = false;
    if (wavPath !== undefined) void cleanupTemp(wavPath);
    this.callbacks.onState("idle");
  }

  dispose(): void {
    this.cancel();
  }
}

/** Gracefully stop a recorder so it flushes a valid WAV header, then await exit. */
function stopProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    child.once("close", done);
    // SIGINT lets ffmpeg/sox finalize the output file cleanly. Fall back to
    // SIGKILL if it ignores us.
    child.kill("SIGINT");
    setTimeout(() => {
      if (!settled) {
        child.kill("SIGKILL");
        done();
      }
    }, 2000);
  });
}

async function cleanupTemp(wavPath: string): Promise<void> {
  try {
    await fs.rm(path.dirname(wavPath), { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; a leftover temp file is harmless.
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
