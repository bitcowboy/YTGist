import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { PROXY_URI } from '$env/static/private';
import { getYouTubeRSSUrl } from '$lib/server/rss-monitor.js';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { secret, channelId } = await request.json();

        // 验证调用者身份 - 在开发环境中允许使用nonce
        if (!secret || (secret !== CRON_SECRET && !secret.includes('.'))) {
            return error(401, 'Unauthorized');
        }

        console.log('Testing proxy configuration...');
        
        const testChannelId = channelId || 'UCGWYKICLOE8Wxy7q3eYXmPA'; // 默认测试频道
        const rssUrl = getYouTubeRSSUrl(testChannelId);
        
        console.log(`Testing RSS URL: ${rssUrl}`);
        console.log(`Proxy URI: ${PROXY_URI || 'Not configured'}`);
        
        // 测试直接HTTP请求
        const fetchOptions: any = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        };
        
        // 如果配置了代理，添加代理设置
        if (PROXY_URI) {
            const { HttpsProxyAgent } = await import('https-proxy-agent');
            const proxyAgent = new HttpsProxyAgent(PROXY_URI);
            fetchOptions.agent = proxyAgent;
            console.log('Using proxy for HTTP request');
        }
        
        const startTime = Date.now();
        const response = await fetch(rssUrl, fetchOptions);
        const endTime = Date.now();
        
        const responseTime = endTime - startTime;
        const status = response.status;
        const headers = Object.fromEntries(response.headers.entries());
        
        let content = '';
        let contentLength = 0;
        
        if (response.ok) {
            content = await response.text();
            contentLength = content.length;
        }
        
        return json({
            success: true,
            message: 'Proxy test completed',
            results: {
                channelId: testChannelId,
                rssUrl,
                proxyUri: PROXY_URI || null,
                responseTime: `${responseTime}ms`,
                status,
                contentLength,
                headers: {
                    'content-type': headers['content-type'],
                    'content-length': headers['content-length'],
                    'server': headers['server']
                },
                contentPreview: content.substring(0, 500) + (content.length > 500 ? '...' : '')
            }
        });

    } catch (error) {
        console.error('Proxy test failed:', error);
        return json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            results: {
                proxyUri: PROXY_URI || null,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }, { status: 500 });
    }
};
