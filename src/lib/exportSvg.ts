/**
 * exportSvg.ts — getting a drawing OUT of the cartridge.
 *
 * 🚨 Not `<a download>`. A cartridge runs in a sandboxed iframe without
 * `allow-downloads`, so an anchor with a `download` attribute does exactly
 * nothing — no file, no error, no console line. A button that silently does
 * nothing is worse than no button, because the student concludes the export is
 * broken rather than absent.
 *
 * The real route is the one the host already gives us: ask the human where,
 * then write there. That is a folder they picked, in a picker they saw.
 */
import { invokeHost } from './host';
import { safeFileName } from './text';

export type ExportResult =
  | { ok: true; path: string }
  | { ok: false; code: 'CANCELLED' | 'WRITE_FAILED'; detail?: string };

/** Serialises a live `<svg>` element into a standalone file. */
export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // The drawing inherits its colours from CSS custom properties that only
  // exist inside the host frame. Written to a file they resolve to nothing, so
  // the export carries its own fallbacks — a file that opens black-on-black is
  // a file the student thinks failed to save.
  clone.setAttribute('style', 'background:#15121d');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

/** Asks for a folder, then writes `content` into it under `title.ext`. */
export async function exportTextToFolder(content: string, title: string, ext: string): Promise<ExportResult> {
  const dir = await invokeHost<string | null>('dialog.selectFolder', {});
  if (!dir) return { ok: false, code: 'CANCELLED' };
  const path = `${dir}${dir.endsWith('/') || dir.endsWith('\\') ? '' : '/'}${safeFileName(title, ext)}`;
  try {
    const res = await invokeHost<{ success?: boolean; error?: string }>('dialog.writeFile', {
      filePath: path,
      content,
    });
    if (res?.success === false) return { ok: false, code: 'WRITE_FAILED', ...(res.error ? { detail: res.error } : {}) };
    return { ok: true, path };
  } catch (err) {
    return { ok: false, code: 'WRITE_FAILED', detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Asks for a folder, then writes the drawing into it. */
export function exportSvgToFolder(svg: SVGSVGElement, title: string): Promise<ExportResult> {
  return exportTextToFolder(serializeSvg(svg), title, 'svg');
}

/**
 * Renders the drawing to PNG and saves it into Melete's own vault folder.
 *
 * 🚨 NOT where the student chooses. `vault.sandbox.saveImage` is the only image
 * write a cartridge has, and its destination is derived from the cartridge id —
 * there is no field to aim it elsewhere. So the UI says where the file went
 * instead of implying the student picked it. The alternative would be a new
 * host action for binary writes (doc 103 §7).
 */
export async function exportPngToVault(svg: SVGSVGElement, title: string): Promise<ExportResult> {
  const source = serializeSvg(svg);
  const width = svg.viewBox.baseVal.width || svg.clientWidth || 1000;
  const height = svg.viewBox.baseVal.height || svg.clientHeight || 1000;

  try {
    const base64 = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Two device pixels per unit: a sheet printed or zoomed at 1x looks
        // soft, and the file is small enough that the cost is not worth saving.
        canvas.width = Math.round(width * 2);
        canvas.height = Math.round(height * 2);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('NO_CANVAS_CONTEXT')); return; }
        // The sheet is drawn for a dark theme, so the PNG carries that ground
        // rather than compositing onto transparency nobody asked for.
        ctx.fillStyle = '#15121d';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL('image/png');
        const comma = url.indexOf(',');
        if (comma === -1) { reject(new Error('BAD_DATA_URL')); return; }
        resolve(url.slice(comma + 1));
      };
      img.onerror = () => reject(new Error('SVG_DID_NOT_RENDER'));
      img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(source)))}`;
    });

    const res = await invokeHost<{ success?: boolean; error?: string; path?: string }>(
      'vault.sandbox.saveImage', { name: safeFileName(title, 'png'), base64 },
    );
    if (res?.success === false) return { ok: false, code: 'WRITE_FAILED', ...(res.error ? { detail: res.error } : {}) };
    return { ok: true, path: res?.path ?? safeFileName(title, 'png') };
  } catch (err) {
    return { ok: false, code: 'WRITE_FAILED', detail: err instanceof Error ? err.message : String(err) };
  }
}
