import { FREE_TRANSCRIPT_ENDPOINT, PROXY_URI } from '$env/static/private';
import { ProxyAgent } from 'undici';
import { Innertube, Platform, UniversalCache } from 'youtubei.js';


// Only create proxy agent if PROXY_URI is available
const proxyAgent = PROXY_URI ? new ProxyAgent(PROXY_URI) : null;

export const getTranscript = async (videoId: string) => {
    // If FREE_TRANSCRIPT_ENDPOINT is not available, go straight to methodTwo
    if (!FREE_TRANSCRIPT_ENDPOINT) {
        console.log('FREE_TRANSCRIPT_ENDPOINT not available, using methodTwo');
        try {
            return await methodTwo(videoId);
        } catch (error) {
            // Avoid noisy stack traces for known no-subtitles cases
            if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
                // downgrade log level to debug/info
                console.info('Transcript not available (no subtitles).');
                throw error;
            }
            console.warn('methodTwo failed (non-NO_SUBTITLES error):', error);
            throw new Error('Failed to get transcript: FREE_TRANSCRIPT_ENDPOINT not configured and methodTwo failed');
        }
    }

    // FREE_TRANSCRIPT_ENDPOINT is available, try methodOne with multiple languages
    const languages = ['zh', 'en', 'auto']; // Try Chinese first, then English, then auto-detect
    
    for (const lang of languages) {
        try {
            console.log(`Trying methodOne with language: ${lang}`);
            // Try methodOne without proxy first
            return await methodOne(videoId, false, lang);
        } catch (error) {
            // If it's a no subtitles error, try next language
            if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
                console.log(`No subtitles found for language: ${lang}, trying next...`);
                continue;
            }
            
            console.warn(`methodOne without proxy failed for language ${lang}:`, error);
        }

        // Only try with proxy if PROXY_URI is available
        if (proxyAgent) {
            try {
                console.log(`Trying methodOne with proxy for language: ${lang}`);
                return await methodOne(videoId, true, lang);
            } catch (error) {
                // If it's a no subtitles error, try next language
                if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
                    console.log(`No subtitles found for language ${lang} with proxy, trying next...`);
                    continue;
                }
                console.warn(`methodOne with proxy failed for language ${lang}:`, error);
            }
        }
    }

    // Try methodTwo as last resort
    try {
        console.log('All methodOne attempts failed, trying methodTwo...');
        return await methodTwo(videoId);
    } catch (error) {
        // If it's a no subtitles error, preserve it with low-noise log
        if (error instanceof Error && error.message === 'NO_SUBTITLES_AVAILABLE') {
            console.info('Transcript not available via methodTwo');
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

const methodTwo = async (videoId: string) => {
    console.log(`[methodTwo] Starting transcript extraction for video: ${videoId}`);
    
    const innertubeOptions: any = {
        cache: new UniversalCache(false)
    };

    // Only use proxy if proxyAgent is available
    if (proxyAgent) {
        console.log('[methodTwo] Using proxy agent');
        innertubeOptions.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
            const options: Record<string, unknown> = { ...init, dispatcher: proxyAgent };
            return Platform.shim.fetch(input, options)
        };
    } else {
        console.log('[methodTwo] No proxy agent, using direct connection');
    }

    try {
        console.log('[methodTwo] Creating Innertube instance...');
        const innertube = await Innertube.create(innertubeOptions);
        console.log('[methodTwo] Innertube instance created successfully');

        console.log('[methodTwo] Getting video info...');
        const info = await innertube.getInfo(videoId);
        console.log('[methodTwo] Video info retrieved successfully');
        
        try {
            console.log('[methodTwo] Attempting to get transcript...');
            
            // Try to get transcript (youtubei.js doesn't support language parameter)
            console.log('[methodTwo] Attempting to get transcript with default settings...');
            let transcriptInfo = await info.getTranscript();
            console.log('[methodTwo] Transcript info:', transcriptInfo.languages);

            console.log('[methodTwo] Transcript info retrieved:', {
                hasTranscript: !!transcriptInfo,
                hasContent: !!transcriptInfo?.transcript,
                hasBody: !!transcriptInfo?.transcript?.content,
                hasSegments: !!transcriptInfo?.transcript?.content?.body,
                segmentsCount: transcriptInfo?.transcript?.content?.body?.initial_segments?.length || 0
            });
            
            // Check if transcript data is available
            if (!transcriptInfo?.transcript?.content?.body?.initial_segments) {
                console.log('[methodTwo] No transcript segments found');
                throw new Error('NO_SUBTITLES_AVAILABLE');
            }
            
            const segments = transcriptInfo.transcript.content.body.initial_segments;
            console.log('[methodTwo] Processing segments:', {
                count: segments.length,
                firstSegment: segments[0] ? {
                    text: segments[0].snippet?.text?.substring(0, 50) + '...',
                    hasStartTime: 'start_time_ms' in segments[0],
                    hasDuration: 'duration_ms' in segments[0]
                } : null
            });
            
            const transcript = segments
                .map((segment) => segment.snippet.text)
                .join('\n');
                
            console.log('[methodTwo] Generated transcript length:', transcript.length);
            console.log('[methodTwo] Transcript preview:', transcript.substring(0, 200) + '...');
                
            // Check if transcript is empty or just whitespace
            if (!transcript || transcript.trim() === '') {
                console.log('[methodTwo] Transcript is empty or whitespace only');
                throw new Error('NO_SUBTITLES_AVAILABLE');
            }

            console.log('[methodTwo] Successfully extracted transcript');
            return transcript;
        } catch (transcriptError) {
            console.error('[methodTwo] Failed to get transcript:', transcriptError);
            
            // If the error is already our specific error, re-throw it
            if (transcriptError instanceof Error && transcriptError.message === 'NO_SUBTITLES_AVAILABLE') {
                throw transcriptError;
            }
            
            // Log the actual error for debugging
            console.error('[methodTwo] Transcript error details:', {
                message: transcriptError instanceof Error ? transcriptError.message : String(transcriptError),
                name: transcriptError instanceof Error ? transcriptError.name : 'Unknown',
                stack: transcriptError instanceof Error ? transcriptError.stack : undefined
            });
            
            throw new Error('NO_SUBTITLES_AVAILABLE');
        }
    } catch (error) {
        console.error('[methodTwo] Innertube error:', error);
        throw new Error('NO_SUBTITLES_AVAILABLE');
    }
}

