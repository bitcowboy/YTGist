import { FREE_TRANSCRIPT_ENDPOINT, PROXY_URI } from '$env/static/private';
import { ProxyAgent } from 'undici';
import { fetchTranscriptForVideo } from './captions/transcript-service';
import { fetchTimedTextXml } from './captions/transcript-service';
import { parseTimedTextXml } from './captions/transcript-parser';
import { convertToYouTubeSegments, formatTimestamp } from './captions/transcript-parser';
import type { TranscriptSegment } from './captions/transcript-parser';
import { initializeYouTube } from './captions/client';

// Only create proxy agent if PROXY_URI is available
const proxyAgent = PROXY_URI ? new ProxyAgent(PROXY_URI) : null;

// Helper function to add timeout to promises
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
        )
    ]);
};

export const getTranscript = async (videoId: string) => {
    // If FREE_TRANSCRIPT_ENDPOINT is not available, go straight to methodThree
    if (!FREE_TRANSCRIPT_ENDPOINT) {
        console.log('FREE_TRANSCRIPT_ENDPOINT not available, using methodThree');
        try {
            return await withTimeout(
                methodThree(videoId), 
                15000, 
                'Transcript fetch timeout after 15 seconds'
            );
        } catch (error) {
            // Avoid noisy stack traces for known no-subtitles cases
            if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
                console.info('Transcript not available (no subtitles).');
                throw error;
            }
            console.warn('methodThree failed:', error);
            throw new Error('Failed to get transcript: methodThree failed');
        }
    }

    // If FREE_TRANSCRIPT_ENDPOINT is available, try methodOne first with timeout
    try {
        console.log('Trying methodOne with timeout...');
        return await withTimeout(
            methodOne(videoId, false, 'auto'), 
            10000, 
            'MethodOne timeout after 10 seconds'
        );
    } catch (error) {
        console.warn('methodOne failed, falling back to methodThree:', error);
    }

    // Fallback to methodThree with timeout
    try {
        console.log('Using methodThree as fallback...');
        return await withTimeout(
            methodThree(videoId), 
            15000, 
            'Transcript fetch timeout after 15 seconds'
        );
    } catch (error) {
        // If it's a no subtitles error, preserve it with low-noise log
        if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
            console.info('Transcript not available via methodThree');
            throw error;
        }
        console.error('All transcript methods failed:', error);
        throw new Error('Failed to get transcript using all available methods');
    }
}

const methodOne = async (videoId: string, useProxy = false, langCode = "en") => {
    const options: Record<string, unknown> = {
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({
            videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
            langCode: langCode
        }),
        method: "POST",
    }

    if (useProxy && proxyAgent) {
        options.dispatcher = proxyAgent;
    }

    const res = await fetch(FREE_TRANSCRIPT_ENDPOINT, options);
    
    if (!res.ok) {
        throw new Error(`Transcript API error: ${res.status}`);
    }
    
    const segments = await res.json() as { captions: { text: string }[] };
    
    // Check if no captions are available
    if (!segments.captions || segments.captions.length === 0) {
        throw new Error('NO_SUBTITLES_AVAILABLE');
    }
    
    const transcript = segments.captions.map(segment => segment.text).join("\n");
    
    // Check if transcript is empty or just whitespace
    if (!transcript || transcript.trim() === '') {
        throw new Error('NO_SUBTITLES_AVAILABLE');
    }

    return transcript;
}

const methodThree = async (videoId: string) => {
    console.log(`[methodThree] Starting transcript extraction for video: ${videoId}`);
    
    const [youtube, clientError] = await initializeYouTube();
    if (clientError) {
      console.error('[methodThree] Failed to initialize YouTube client:', clientError);
      throw new Error('Failed to initialize YouTube client');
    }

    if (!youtube) {
      console.error('[methodThree] Failed to initialize YouTube client');
      throw new Error('Failed to initialize YouTube client');
    }

    console.log('[methodThree] Fetching transcript for video:', videoId);
    const result = await fetchTranscriptForVideo(youtube, videoId);

    if (result && 'segments' in result) {
      const transcript = result.segments
        .map(s => {
          const text = s.snippet.text;
          const timestamp = s.start_time_text?.text || formatTimestamp(parseInt(s.start_ms));
          return `[${timestamp}] ${text}`;
        })
        .join(' ');
      return transcript;
    }

    throw new Error('NO_SUBTITLES_AVAILABLE');
}
