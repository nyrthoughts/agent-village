export interface SseFrame { event: string; id?: string; data: string }

/** Incremental text/event-stream parser (comments ignored, multi-line data joined). */
export function parseSse(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  const normalized = buffer.replace(/\r\n?/g, '\n');
  let start = 0;
  let index: number;
  while ((index = normalized.indexOf('\n\n', start)) >= 0) {
    const block = normalized.slice(start, index);
    start = index + 2;
    const frame: SseFrame = { event: 'message', data: '' };
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') frame.event = value;
      else if (field === 'id') frame.id = value;
      else if (field === 'data') data.push(value);
    }
    frame.data = data.join('\n');
    if (data.length || frame.id) frames.push(frame);
  }
  return { frames, rest: normalized.slice(start) };
}
