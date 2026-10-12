/** Incremental Server-Sent Events parser shared by the planner adapter (OpenAI stream) and the
 * browser client (desaing-server stream). It only splits frames; callers validate every payload. */
export interface SseEvent { event: string; data: string }

export function createSseParser() {
  let buffer = '';
  return {
    /** Feeds decoded text and returns the complete events it closed (a frame ends with a blank line). */
    push(text: string): SseEvent[] {
      buffer += text.replace(/\r\n?/g, '\n');
      const events: SseEvent[] = [];
      let end = buffer.indexOf('\n\n');
      while (end >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let event = 'message';
        const data: string[] = [];
        for (const line of frame.split('\n')) {
          if (!line || line.startsWith(':')) continue;
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
          if (field === 'event') event = value;
          else if (field === 'data') data.push(value);
        }
        if (data.length) events.push({ event, data: data.join('\n') });
        end = buffer.indexOf('\n\n');
      }
      return events;
    },
    /** Text received after the last complete frame (a truncated stream). */
    rest: () => buffer,
  };
}

/** One SSE frame. JSON data never contains a raw newline, so a single data line is enough. */
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
