// Web Serial transport: line-based text protocol, both directions.
let port = null;
let reader = null;
let writer = null;
let readableClosed = null;
const encoder = new TextEncoder();

export const isSupported = () => 'serial' in navigator;

/**
 * Opens a port (must be called from a user gesture).
 * Resolves once the port is open; reading continues in the background.
 */
export async function connect({ onData, onReady, onClose }) {
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });

  writer = port.writable.getWriter();

  // pipeTo (instead of pipeThrough) gives us a promise to await on close
  const decoder = new TextDecoderStream();
  readableClosed = port.readable.pipeTo(decoder.writable).catch(() => {});
  reader = decoder.readable.getReader();

  // The Uno resets when the port opens; wait for its READY line.
  // Fallback timer covers boards that don't auto-reset.
  let ready = false;
  const markReady = () => { if (!ready) { ready = true; onReady?.(); } };
  const fallback = setTimeout(markReady, 2500);

  readLines((line) => {
    if (line === 'READY') { clearTimeout(fallback); markReady(); return; }
    // D is optional so older firmware still works; corrupted lines are rejected
    const m = line.match(/^L:(\d{1,4}),B:([01])(?:,D:(\d{1,3}))?$/);
    if (m) onData({ raw: +m[1], button: m[2] === '1', cm: m[3] == null ? null : +m[3] });
  }).finally(async () => {
    clearTimeout(fallback);
    await cleanup();
    onClose?.();
  });
}

async function readLines(onLine) {
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const lines = buf.split('\n');
      buf = lines.pop();               // keep the incomplete tail for next chunk
      for (const line of lines) onLine(line.trim());
    }
  } catch (err) {
    console.warn('[serial] read ended:', err.message); // e.g. cable unplugged
  }
}

/** Cancelling the reader ends readLines(), whose finally() does cleanup. */
export async function disconnect() {
  await reader?.cancel().catch(() => {});
}

async function cleanup() {
  try { reader?.releaseLock(); } catch {}
  await readableClosed;
  try { writer?.releaseLock(); } catch {}
  try { await port?.close(); } catch {}
  port = reader = writer = readableClosed = null;
}

export function send(cmd) {
  if (!writer) return;
  writer.write(encoder.encode(cmd + '\n')).catch(() => {});
}
