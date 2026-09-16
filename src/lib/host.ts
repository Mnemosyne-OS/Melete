/**
 * host.ts — the one door between Melete and the shell.
 *
 * Everything that leaves this cartridge goes through here, so "what can Melete
 * touch?" is answerable by reading one short file instead of grepping the
 * components. Host actions are catalogued in doc 52; the main process is the
 * one enforcing what each of them may reach.
 */
import { MnemoCartridgeSDK, type ModelInferPayload } from '../sdk/mnemo-sdk';
import { log } from './log';

/** Must match "name" in mnemo-plugin.json — the host keys this cartridge's
 *  sandbox vault on it. Renaming later orphans the old vault (no migration). */
export const PLUGIN_ID = '@mnemosyne-plugins/melete';

export const sdk = new MnemoCartridgeSDK(PLUGIN_ID);

/** Typed pass-through to the host action bridge (actions: doc 52). */
export function invokeHost<T>(action: string, payload?: unknown): Promise<T> {
  return sdk.invoke<T>(action, payload);
}

/** Open a URL in the OS browser. Sandboxed cartridge iframes block
 *  target="_blank", so external links MUST route through the host. */
export function openExternal(url: string): void {
  sdk.invoke('shell.openExternal', { url }).catch((e: unknown) => {
    log.warn('host', 'openExternal failed', { detail: e instanceof Error ? e.message : String(e) });
  });
}

/** True when this page is running inside the Mnemosyne shell at all. Opened
 *  standalone in a browser (dev), every action below rejects immediately —
 *  which is a state the UI must be able to NAME rather than show as a failure. */
export function hasHost(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

// ── Vault ───────────────────────────────────────────────────────────────────

export interface SandboxInfo {
  vault: string;
  created: boolean;
  /** The human has unlocked permanence — this vault may mix with real memory. */
  unlocked: boolean;
}

/** Creates (once) and mounts Melete's own walled-off vault. Doc 58: an app may
 *  create exactly ONE vault, derived from its id, and can never widen it. */
export function ensureSandbox(): Promise<SandboxInfo> {
  return invokeHost<SandboxInfo>('vault.sandbox.ensure');
}

/** Tells the shell how to draw Melete's vault tile. The HOST computes the
 *  numbers from spine stats — we declare labels, never values. */
export function describeTile(): Promise<unknown> {
  return invokeHost('vault.sandbox.describeTile', {
    icon: '🪶',
    metrics: [{ label: 'Course passages' }],
  });
}

/** Writes one passage into Melete's vault. `sourceRef` is what later ties a
 *  chronicle back to the course it came from. */
export function ingestPassage(vault: string, content: string, sourceRef: string): Promise<unknown> {
  return invokeHost('mnemosyne.ingest', {
    vault,
    content,
    spineType: 'DOCUMENT',
    sourceRef,
  });
}

/**
 * Saves one picture into Melete's vault folder, where DocWatch picks it up.
 *
 * ⚠️ What happens NEXT is not ours to promise: whether the image becomes
 * searchable depends on the user having Theia's image memory turned on
 * (Settings → Images). The UI says "saved into your vault", never "indexed".
 */
export function saveImage(name: string, base64: string): Promise<{ success?: boolean; error?: string }> {
  return invokeHost('vault.sandbox.saveImage', { name, base64 });
}

// ── Files ───────────────────────────────────────────────────────────────────

export interface PickedFile {
  path: string;
  name: string;
}

interface SelectFileReply {
  success?: boolean;
  canceled?: boolean;
  filePath?: string;
  path?: string;
  filePaths?: string[];
  error?: string;
}

/** The OS file picker. Returns null when the user cancels — which is not an
 *  error and must not be reported as one. */
export async function pickFile(filters: { name: string; extensions: string[] }[]): Promise<PickedFile | null> {
  const res = await invokeHost<SelectFileReply | string | null>('dialog.selectFile', { filters });
  if (!res) return null;
  const path = typeof res === 'string' ? res : (res.filePath ?? res.path ?? res.filePaths?.[0] ?? null);
  if (!path) return null;
  const name = path.split(/[\\/]/).pop() ?? path;
  return { path, name };
}

export interface ExtractedDoc {
  name?: string;
  ext?: string;
  text?: string;
  truncated?: boolean;
  ocrUsed?: boolean;
  /** How the host read the bytes ('cp1252', 'utf-16le'…). Absent for a PDF or a
   *  DOCX, whose containers declare their own — absent is not 'utf-8'. */
  encoding?: string;
}

/** One OCR progress frame, forwarded whole by the host. */
export interface OcrProgress {
  filePath?: string;
  page?: number;
  pages?: number;
  phase?: string;
}

/**
 * Extracts text from a document or an image.
 *
 * Streams the host's OCR progress so a scanned course shows "page 4 of 60"
 * instead of a spinner. 🚨 Cancelling the stream stops the REPORTING, not the
 * OCR — the sidecar has no cancel, and saying otherwise would leave the engine
 * busy while the UI claims it stopped.
 */
export async function extractDocument(
  filePath: string,
  opts: { forceOcr?: boolean; onProgress?: (p: OcrProgress) => void } = {},
): Promise<{ success: boolean; data?: ExtractedDoc; error?: string }> {
  const payload = { filePath, forceOcr: opts.forceOcr === true };
  const { data } = await sdk.stream<{ success?: boolean; data?: ExtractedDoc; error?: string }>(
    'reader.extractDocument',
    payload,
    {
      onChunk: (raw) => {
        if (!opts.onProgress) return;
        try {
          opts.onProgress(JSON.parse(raw) as OcrProgress);
        } catch {
          // A non-JSON chunk is not worth failing an extraction over; the
          // progress line simply does not move for that frame.
        }
      },
      // OCR of a long scan legitimately runs for minutes. The bound is
      // INACTIVITY: it resets on every page frame, so a working engine never
      // trips it and a dead one still does.
      timeoutMs: 180_000,
    },
  );
  const reply = data ?? {};
  return {
    success: reply.success === true,
    ...(reply.data ? { data: reply.data } : {}),
    ...(reply.error ? { error: reply.error } : {}),
  };
}

/** Reads a file. Images come back as a `data:` URL, text as itself. */
export function readFile(filePath: string): Promise<{ success?: boolean; content?: string; isBinary?: boolean; error?: string }> {
  return invokeHost('dialog.readFile', { filePath });
}

// ── Model ───────────────────────────────────────────────────────────────────

export interface ModelStatus {
  /** Whatever the host reports; read defensively, it differs per engine. */
  mode?: string;
  localReady?: boolean;
  cloudReady?: boolean;
}

export function modelStatus(): Promise<ModelStatus> {
  return invokeHost<ModelStatus>('model.getStatus');
}

/**
 * One generation.
 *
 * `disableRAG` is deliberate and load-bearing: the course text is IN the
 * prompt, and letting the host also inject passages from the user's other
 * vaults would produce flashcards about their tax return. Generation reads the
 * document in front of it and nothing else.
 */
export async function infer(payload: Omit<ModelInferPayload, 'disableRAG'>): Promise<string> {
  const res = await sdk.inferModel({ ...payload, disableRAG: true });
  const text = res.text ?? res.response ?? res.content ?? res.answer ?? '';
  if (!text.trim()) throw new Error(res.error || 'EMPTY_MODEL_REPLY');
  return text;
}

// ── Durable state (doc 73) ──────────────────────────────────────────────────

export function readState<T>(): Promise<T | null> {
  return invokeHost<T | null>('state.get');
}

export function writeState(state: unknown): Promise<unknown> {
  return invokeHost('state.set', { state });
}
