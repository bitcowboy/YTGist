// transcript-parser.ts

export interface TranscriptSegment {
  durationMs: number;
  startMs: number;
  text: string;
}

export interface YouTubeSegment {
  end_ms: string;
  snippet: { text: string };
  start_ms: string;
  start_time_text: { text: string };
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function parsePTagFormat(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const pTagRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;

  let match = pTagRegex.exec(xml);
  while (match !== null) {
    const [, startMsStr, durationMsStr, rawText] = match;
    if (startMsStr && durationMsStr && rawText) {
      const text = decodeHtmlEntities(rawText.replace(/<[^>]+>/g, '')).trim();
      if (text) {
        segments.push({
          durationMs: parseInt(durationMsStr, 10),
          startMs: parseInt(startMsStr, 10),
          text,
        });
      }
    }
    match = pTagRegex.exec(xml);
  }
  return segments;
}

export function parseTextTagFormat(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const textTagRegex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;

  let match = textTagRegex.exec(xml);
  while (match !== null) {
    const [, startStr, durStr, rawText] = match;
    if (startStr && durStr && rawText) {
      const text = decodeHtmlEntities(rawText.replace(/<[^>]+>/g, '')).trim();
      if (text) {
        segments.push({
          durationMs: Math.round(parseFloat(durStr) * 1000),
          startMs: Math.round(parseFloat(startStr) * 1000),
          text,
        });
      }
    }
    match = textTagRegex.exec(xml);
  }
  return segments;
}

export function parseTimedTextXml(xml: string): TranscriptSegment[] {
  const pSegments = parsePTagFormat(xml);
  if (pSegments.length > 0) {
    return pSegments;
  }
  return parseTextTagFormat(xml);
}

export function convertToYouTubeSegments(segments: TranscriptSegment[]): YouTubeSegment[] {
  return segments.map((segment) => ({
    end_ms: String(segment.startMs + segment.durationMs),
    snippet: { text: segment.text },
    start_ms: String(segment.startMs),
    start_time_text: { text: formatTimestamp(segment.startMs) },
  }));
}

