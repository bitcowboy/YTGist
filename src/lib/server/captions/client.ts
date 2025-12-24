import { Innertube } from 'youtubei.js';
import { getProxyFetch } from './proxy.js';

export async function initializeYouTube(): Promise<[Innertube, null] | [null, Error]> {
  try {
    const proxyFetch = getProxyFetch();
    const client = await Innertube.create({
      generate_session_locally: true,
      lang: 'en',
      location: 'US',
      retrieve_player: false,
      fetch: proxyFetch as typeof fetch | undefined,
    });
    return [client, null];
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(String(error))];
  }
}

