// transcript-service.ts
import { Innertube } from 'youtubei.js';
import { parseTimedTextXml, convertToYouTubeSegments, type YouTubeSegment } from './transcript-parser.js';
import { getProxyFetch } from './proxy.js';

export async function fetchTimedTextXml(captionUrl: string, videoId: string): Promise<string> {
  const proxyFetch = getProxyFetch() || fetch;
  const response = await proxyFetch(captionUrl, {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch timedtext for ${videoId}: ${response.status}`);
  }

  const xml = await response.text();
  if (!xml || xml.length === 0) {
    throw new Error(`Empty timedtext response for ${videoId}`);
  }

  return xml;
}

export async function fetchTranscriptForVideo(
  youtube: Innertube,
  videoId: string
): Promise<{ error: string } | { segments: YouTubeSegment[] }> {
  const info = await youtube.getBasicInfo(videoId, {client: 'ANDROID'});

  const captionTracks = info.captions?.caption_tracks;

  if (!captionTracks || captionTracks.length === 0) {
    return { error: 'No transcript available' };
  }

  const englishTrack =
    captionTracks.find((t) => t.language_code === 'en' && t.kind !== 'asr') ||
    captionTracks.find((t) => t.language_code?.startsWith('en')) ||
    captionTracks[0];

  if (!englishTrack?.base_url) {
    return { error: 'No transcript url found' };
  }

  console.log('English track', englishTrack);

  const xml = await fetchTimedTextXml(englishTrack.base_url, videoId);
  const segments = parseTimedTextXml(xml);

  if (segments.length === 0) {
    throw new Error(`Failed to parse transcript for ${videoId}`);
  }

  return { segments: convertToYouTubeSegments(segments) };
}

