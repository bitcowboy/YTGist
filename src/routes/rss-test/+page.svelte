<script lang="ts">
    import { onMount } from 'svelte';
    
    let testResults: any[] = [];
    let isLoading = false;
    let error = '';
    let success = '';
    let testChannelId = '';
    
    async function testRSSMonitor() {
        isLoading = true;
        error = '';
        success = '';
        testResults = [];
        
        try {
            // 获取nonce
            const nonceResponse = await fetch('/api/generate-nonce');
            if (!nonceResponse.ok) {
                throw new Error('Failed to generate nonce');
            }
            const { nonce } = await nonceResponse.json();
            
            const response = await fetch('/api/test-rss-monitor', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    secret: nonce,
                    channelId: testChannelId || undefined
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                testResults = data.results;
                success = `RSS测试完成！测试了 ${data.totalChannels} 个频道`;
            } else {
                error = data.error || 'RSS测试失败';
            }
        } catch (err) {
            error = `测试失败: ${err}`;
        } finally {
            isLoading = false;
        }
    }
    
    async function testRSSProcess() {
        isLoading = true;
        error = '';
        success = '';
        
        try {
            // 获取nonce
            const nonceResponse = await fetch('/api/generate-nonce');
            if (!nonceResponse.ok) {
                throw new Error('Failed to generate nonce');
            }
            const { nonce } = await nonceResponse.json();
            
            const response = await fetch('/api/process-followed-channels-rss', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    secret: nonce
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                success = `RSS处理完成！处理了 ${data.totalChannels} 个频道，发现 ${data.totalNewVideos} 个新视频`;
                testResults = data.results;
            } else {
                error = data.error || 'RSS处理失败';
            }
        } catch (err) {
            error = `处理失败: ${err}`;
        } finally {
            isLoading = false;
        }
    }
    
    async function testRSSIncremental() {
        isLoading = true;
        error = '';
        success = '';
        testResults = [];
        
        try {
            // 获取nonce
            const nonceResponse = await fetch('/api/generate-nonce');
            if (!nonceResponse.ok) {
                throw new Error('Failed to generate nonce');
            }
            const { nonce } = await nonceResponse.json();
            
            const response = await fetch('/api/test-rss-incremental', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    secret: nonce,
                    channelId: testChannelId || undefined
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                testResults = data.results;
                success = `增量RSS测试完成！测试了 ${data.totalChannels} 个频道`;
            } else {
                error = data.error || '增量RSS测试失败';
            }
        } catch (err) {
            error = `测试失败: ${err}`;
        } finally {
            isLoading = false;
        }
    }
    
    async function testRSSIncrementalProcess() {
        isLoading = true;
        error = '';
        success = '';
        
        try {
            // 获取nonce
            const nonceResponse = await fetch('/api/generate-nonce');
            if (!nonceResponse.ok) {
                throw new Error('Failed to generate nonce');
            }
            const { nonce } = await nonceResponse.json();
            
            const response = await fetch('/api/process-followed-channels-rss-incremental', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    secret: nonce
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                success = `增量RSS处理完成！处理了 ${data.totalChannels} 个频道，发现 ${data.totalNewVideos} 个新视频`;
                testResults = data.results;
            } else {
                error = data.error || '增量RSS处理失败';
            }
        } catch (err) {
            error = `处理失败: ${err}`;
        } finally {
            isLoading = false;
        }
    }
    
    async function migrateDatabase() {
        isLoading = true;
        error = '';
        success = '';
        
        try {
            // 首先尝试获取nonce
            const nonceResponse = await fetch('/api/generate-nonce');
            if (!nonceResponse.ok) {
                throw new Error('Failed to generate nonce');
            }
            const { nonce } = await nonceResponse.json();
            
            const response = await fetch('/api/migrate-followed-channels-incremental', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    secret: nonce // 使用nonce作为secret
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                success = `数据库迁移完成！迁移了 ${data.migratedCount} 个频道，跳过了 ${data.skippedCount} 个频道`;
                if (data.errorCount > 0) {
                    success += `，${data.errorCount} 个错误`;
                }
            } else {
                error = data.error || '数据库迁移失败';
            }
        } catch (err) {
            error = `迁移失败: ${err}`;
        } finally {
            isLoading = false;
        }
    }
    
    async function testProxy() {
        isLoading = true;
        error = '';
        success = '';
        testResults = [];
        
        try {
            // 获取nonce
            const nonceResponse = await fetch('/api/generate-nonce');
            if (!nonceResponse.ok) {
                throw new Error('Failed to generate nonce');
            }
            const { nonce } = await nonceResponse.json();
            
            const response = await fetch('/api/test-proxy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    secret: nonce,
                    channelId: testChannelId || undefined
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                testResults = [data.results];
                success = `代理测试完成！响应时间: ${data.results.responseTime}`;
            } else {
                error = data.error || '代理测试失败';
            }
        } catch (err) {
            error = `测试失败: ${err}`;
        } finally {
            isLoading = false;
        }
    }
    
    async function testShortsFilter() {
        isLoading = true;
        error = '';
        success = '';
        testResults = [];
        
        try {
            // 获取nonce
            const nonceResponse = await fetch('/api/generate-nonce');
            if (!nonceResponse.ok) {
                throw new Error('Failed to generate nonce');
            }
            const { nonce } = await nonceResponse.json();
            
            const response = await fetch('/api/test-shorts-filter', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    secret: nonce,
                    channelId: testChannelId || undefined
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                testResults = data.results;
                success = `Shorts过滤测试完成！测试了 ${data.totalChannels} 个频道`;
            } else {
                error = data.error || 'Shorts过滤测试失败';
            }
        } catch (err) {
            error = `测试失败: ${err}`;
        } finally {
            isLoading = false;
        }
    }
</script>

<svelte:head>
    <title>RSS订阅测试 - YTGist</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-8">RSS订阅测试</h1>
    
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
        <h2 class="text-xl font-semibold mb-4">RSS订阅功能说明</h2>
        <ul class="list-disc list-inside space-y-2 text-gray-700">
            <li>使用YouTube RSS feed监控订阅频道的新视频</li>
            <li>RSS方式比API调用更轻量级，更可靠</li>
            <li>支持批量获取多个频道的视频信息</li>
            <li>自动解析视频ID、标题、发布时间等信息</li>
            <li><strong>增量更新</strong>：只处理比上次更新的视频，大大提高效率</li>
            <li><strong>智能记录</strong>：记录每个频道最新处理的视频ID</li>
        </ul>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-6 mb-8">
        <div class="bg-white border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">测试RSS监控</h3>
            <p class="text-gray-600 mb-4">测试RSS feed解析功能，查看频道视频信息</p>
            
            <div class="mb-4">
                <label for="channelId" class="block text-sm font-medium text-gray-700 mb-2">
                    频道ID (可选，留空测试所有关注频道)
                </label>
                <input
                    id="channelId"
                    type="text"
                    bind:value={testChannelId}
                    placeholder="例如: UC_x5XG1OV2P6uZZ5FSM9Ttw"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            
            <button
                on:click={testRSSMonitor}
                disabled={isLoading}
                class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? '测试中...' : '测试RSS监控'}
            </button>
        </div>
        
        <div class="bg-white border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">测试RSS处理</h3>
            <p class="text-gray-600 mb-4">测试完整的RSS处理流程，包括视频总结生成</p>
            
            <button
                on:click={testRSSProcess}
                disabled={isLoading}
                class="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? '处理中...' : '测试RSS处理'}
            </button>
        </div>
        
        <div class="bg-white border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">测试增量RSS</h3>
            <p class="text-gray-600 mb-4">测试增量RSS功能，只获取新视频</p>
            
            <button
                on:click={testRSSIncremental}
                disabled={isLoading}
                class="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? '测试中...' : '测试增量RSS'}
            </button>
        </div>
        
        <div class="bg-white border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">测试增量处理</h3>
            <p class="text-gray-600 mb-4">测试增量RSS处理流程，包括视频总结生成</p>
            
            <button
                on:click={testRSSIncrementalProcess}
                disabled={isLoading}
                class="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? '处理中...' : '测试增量处理'}
            </button>
        </div>
        
        <div class="bg-white border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">数据库迁移</h3>
            <p class="text-gray-600 mb-4">为现有频道添加增量更新字段</p>
            
            <button
                on:click={migrateDatabase}
                disabled={isLoading}
                class="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? '迁移中...' : '迁移数据库'}
            </button>
        </div>
        
        <div class="bg-white border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">代理测试</h3>
            <p class="text-gray-600 mb-4">测试代理配置和网络连接</p>
            
            <button
                on:click={testProxy}
                disabled={isLoading}
                class="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? '测试中...' : '测试代理'}
            </button>
        </div>
        
        <div class="bg-white border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">Shorts过滤</h3>
            <p class="text-gray-600 mb-4">测试YouTube Shorts过滤功能</p>
            
            <button
                on:click={testShortsFilter}
                disabled={isLoading}
                class="w-full bg-pink-600 text-white py-2 px-4 rounded-md hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? '测试中...' : '测试过滤'}
            </button>
        </div>
    </div>
    
    {#if error}
        <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p class="text-red-800">❌ {error}</p>
        </div>
    {/if}
    
    {#if success}
        <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p class="text-green-800">✅ {success}</p>
        </div>
    {/if}
    
    {#if testResults.length > 0}
        <div class="bg-white border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-semibold mb-4">测试结果</h3>
            
            <div class="space-y-4">
                {#each testResults as result}
                    <div class="border border-gray-200 rounded-lg p-4">
                        <div class="flex items-center justify-between mb-2">
                            <h4 class="font-medium">
                                {result.channelName || result.channelId}
                            </h4>
                            <span class="text-sm px-2 py-1 rounded {result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                                {result.success ? '成功' : '失败'}
                            </span>
                        </div>
                        
                        {#if result.success}
                            <div class="text-sm text-gray-600 space-y-1">
                                <p><strong>频道ID:</strong> {result.channelId}</p>
                                {#if result.rssUrl}
                                    <p><strong>RSS URL:</strong> 
                                        <a href={result.rssUrl} target="_blank" class="text-blue-600 hover:underline">
                                            {result.rssUrl}
                                        </a>
                                    </p>
                                {/if}
                                {#if result.proxyUri}
                                    <p><strong>代理URI:</strong> <code class="bg-gray-100 px-1 rounded text-xs">{result.proxyUri}</code></p>
                                {/if}
                                {#if result.responseTime}
                                    <p><strong>响应时间:</strong> {result.responseTime}</p>
                                {/if}
                                {#if result.status}
                                    <p><strong>HTTP状态:</strong> {result.status}</p>
                                {/if}
                                {#if result.contentLength}
                                    <p><strong>内容长度:</strong> {result.contentLength} 字节</p>
                                {/if}
                                {#if result.totalVideos !== undefined}
                                    <p><strong>总视频数:</strong> {result.totalVideos}</p>
                                {/if}
                                {#if result.shortsCount !== undefined}
                                    <p><strong>Shorts数量:</strong> {result.shortsCount}</p>
                                {/if}
                                {#if result.regularVideosCount !== undefined}
                                    <p><strong>普通视频:</strong> {result.regularVideosCount}</p>
                                {/if}
                                {#if result.shortsPercentage !== undefined}
                                    <p><strong>Shorts比例:</strong> {result.shortsPercentage}%</p>
                                {/if}
                                <p><strong>视频数量:</strong> {result.videoCount || result.newVideoCount || 0}</p>
                                {#if result.lastProcessedVideoId}
                                    <p><strong>上次处理视频ID:</strong> <code class="bg-gray-100 px-1 rounded text-xs">{result.lastProcessedVideoId}</code></p>
                                {/if}
                                {#if result.newVideos !== undefined}
                                    <p><strong>新视频:</strong> {result.newVideos}</p>
                                {/if}
                                {#if result.processedVideos !== undefined}
                                    <p><strong>已处理:</strong> {result.processedVideos}</p>
                                {/if}
                            </div>
                            
                            {#if result.videos && result.videos.length > 0}
                                <div class="mt-3">
                                    <h5 class="font-medium mb-2">最新视频:</h5>
                                    <div class="space-y-2">
                                        {#each result.videos.slice(0, 3) as video}
                                            <div class="flex items-center space-x-3 p-2 bg-gray-50 rounded">
                                                {#if video.thumbnailUrl}
                                                    <img src={video.thumbnailUrl} alt={video.title} class="w-16 h-12 object-cover rounded" />
                                                {/if}
                                                <div class="flex-1 min-w-0">
                                                    <p class="text-sm font-medium truncate">
                                                        {video.title}
                                                        {#if video.isShorts}
                                                            <span class="ml-2 px-2 py-1 bg-pink-100 text-pink-800 text-xs rounded">Shorts</span>
                                                        {/if}
                                                    </p>
                                                    <p class="text-xs text-gray-500">
                                                        {new Date(video.publishedAt).toLocaleString()}
                                                    </p>
                                                </div>
                                                <a href={video.link} target="_blank" class="text-blue-600 hover:underline text-xs">
                                                    查看
                                                </a>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                        {:else}
                            <div class="text-sm text-red-600">
                                <p><strong>错误:</strong> {result.error}</p>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>
