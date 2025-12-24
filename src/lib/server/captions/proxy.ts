// proxy.ts
import { ProxyAgent, fetch as undiciFetch } from 'undici';

let proxyAgent: ProxyAgent | null = null;
let proxyFailed = false;
let proxyConfigured = false;

function parseProxyUrl(proxyUrl: string): string {
  // If already has protocol, return as-is
  if (proxyUrl.startsWith('http://') || proxyUrl.startsWith('https://')) {
    return proxyUrl;
  }

  // If has @ but no protocol (user:pass@host:port format), add http://
  if (proxyUrl.includes('@')) {
    return `http://${proxyUrl}`;
  }

  // Strip http:// or https:// prefix if present for Floxy format parsing
  let rawUrl = proxyUrl;
  if (rawUrl.startsWith('http://')) {
    rawUrl = rawUrl.slice(7);
  } else if (rawUrl.startsWith('https://')) {
    rawUrl = rawUrl.slice(8);
  }

  // Parse Floxy format: host:port:username:password
  const parts = rawUrl.split(':');
  if (parts.length === 4) {
    const [host, port, username, password] = parts;
    return `http://${username}:${password}@${host}:${port}`;
  }

  // Fallback: return original (may fail if invalid)
  return proxyUrl;
}

export function getProxyFetch(): typeof fetch | undefined {
  // Skip proxy in test environment
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return undefined;
  }

  const proxyUrl = process.env.PROXY_URL;
  if (!proxyUrl || proxyFailed) {
    if (!proxyConfigured) {
      proxyConfigured = true;
    }
    return undefined;
  }

  if (!proxyAgent) {
    try {
      const parsedUrl = parseProxyUrl(proxyUrl);
      proxyAgent = new ProxyAgent(parsedUrl);
      proxyConfigured = true;
    } catch (error) {
      proxyFailed = true;
      proxyConfigured = true;
      return undefined;
    }
  }

  // At this point, proxyAgent is guaranteed to be non-null
  const agent = proxyAgent;

  return ((input: RequestInfo | URL, init?: RequestInit) => {
    // Handle Request objects - extract URL and merge options
    if (input instanceof Request) {
      const url = input.url;
      const options: Record<string, unknown> = {
        method: input.method,
        headers: input.headers,
        body: input.body,
        ...init,
        dispatcher: agent
      };
      return undiciFetch(url, options as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;
    }
    const options: Record<string, unknown> = {
      ...init,
      dispatcher: agent
    };
    return undiciFetch(input, options as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;
  }) as typeof fetch;
}

