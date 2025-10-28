# YTGist 视频总结流式架构详解

## 概述

YTGist 的视频总结功能采用 Server-Sent Events (SSE) 实现流式输出，让用户能够实时看到 AI 生成总结的过程，而不是等待完整结果。

## 整体架构

```
客户端 (watch页面) 
    ↓ EventSource 连接
服务端 API (/api/get-summary)
    ↓ 调用生成器
视频总结生成服务 (video-summary-service)
    ↓ OpenAI 流式调用
AI 模型 (OpenRouter)
```

## 详细流程

### 1. 客户端发起请求

**文件**: `src/routes/watch/+page.svelte`

```javascript
// 当没有缓存数据时，使用 SSE 流式获取
streamController = await openSummaryStream(urlVideoId, {
    onDelta: (delta) => {
        streamingText += delta;  // 实时追加文本
    },
    onComplete: (full) => {
        streamingText = full;    // 确保完整文本显示
    },
    onPartial: (partial) => {
        // 处理局部字段更新
        if (partial.keyTakeaway) partialKeyTakeaway = partial.keyTakeaway;
        if (partial.keyPoints) partialKeyPoints = [...partialKeyPoints, ...partial.keyPoints];
    },
    onFinal: (data) => {
        summaryData = data;      // 最终完整数据
        // 更新 UI 状态...
    }
});
```

**关键点**:
- 使用 `openSummaryStream` 建立 EventSource 连接
- 监听不同类型的事件：`summary-delta`, `summary-complete`, `summary-partial`, `summary-final`
- 实时更新 UI 显示流式内容

### 2. SSE 客户端工具

**文件**: `src/lib/client/summary-stream.ts`

```javascript
export const openSummaryStream = async (videoId: string, handlers) => {
    const source = new EventSource(url.toString());
    
    source.addEventListener('summary-delta', (event) => {
        const { delta } = JSON.parse(event.data);
        handlers.onDelta?.(delta);
    });
    
    source.addEventListener('summary-complete', (event) => {
        const { summary } = JSON.parse(event.data);
        handlers.onComplete?.(summary);
    });
    
    source.addEventListener('summary-partial', (event) => {
        const payload = JSON.parse(event.data);
        handlers.onPartial?.(payload);
    });
    
    source.addEventListener('summary-final', (event) => {
        const payload = JSON.parse(event.data);
        handlers.onFinal?.(payload);
        source.close();
    });
};
```

**关键点**:
- 建立 EventSource 连接到 `/api/get-summary`
- 解析不同类型的 SSE 事件
- 调用对应的回调函数

### 3. 服务端 API 端点

**文件**: `src/routes/api/get-summary/+server.ts`

#### 3.1 缓存检查
```javascript
// 首先检查缓存
const cached = await databases.listDocuments('main', 'summaries', [
    Query.equal('videoId', videoId),
    Query.limit(1)
]);
if (cached.total > 0) {
    return json(cached.documents[0]);  // 直接返回 JSON
}
```

#### 3.2 SSE 流式响应
```javascript
const stream = new ReadableStream({
    start(controller) {
        const encoder = new TextEncoder();
        
        const send = (event: string, data: any) => {
            const payload = typeof data === 'string' ? data : JSON.stringify(data);
            const chunk = `event: ${event}\n` + `data: ${payload}\n\n`;
            controller.enqueue(encoder.encode(chunk));
        };
        
        // 心跳机制
        const heartbeat = setInterval(() => {
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
        }, 15000);
        
        // 调用流式生成器
        generateVideoSummaryStream(videoId, {
            onDelta: (delta) => {
                controller.enqueue(encoder.encode(
                    `event: summary-delta\n` + 
                    `data: ${JSON.stringify({ delta })}\n\n`
                ));
            },
            onComplete: (full) => {
                send('summary-complete', { summary: full });
            },
            onPartial: (partial) => {
                send('summary-partial', partial);
            }
        }).then((result) => {
            if (result.success) {
                send('summary-final', result.summaryData);
            } else {
                send('error', { message: result.error });
            }
            clearInterval(heartbeat);
            controller.close();
        });
    }
});

return new Response(stream, {
    headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
    }
});
```

**关键点**:
- 缓存命中时返回 JSON，未命中时返回 SSE 流
- 使用 `ReadableStream` 创建流式响应
- 设置正确的 SSE 头部
- 心跳机制防止代理超时
- 将生成器的事件转发为 SSE 事件

### 4. 视频总结生成服务

**文件**: `src/lib/server/video-summary-service.ts`

#### 4.1 结构化 NDJSON 协议
```javascript
const systemInstruction = `${prompt}\n\n按照如下NDJSON事件逐行输出：\n` +
    `1) {"event":"summary-delta","delta":"..."} 用于摘要正文的增量片段\n` +
    `2) {"event":"summary-complete"} 摘要正文结束\n` +
    `3) {"event":"keyTakeaway-complete","value":"..."}\n` +
    `4) {"event":"keyPoints-item","value":"..."} 可重复多次\n` +
    `5) {"event":"coreTerms-item","value":"..."} 可重复多次`;
```

#### 4.2 OpenAI 流式调用
```javascript
const stream = await openai.chat.completions.create({
    model: OPENROUTER_MODEL,
    stream: true,
    messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: JSON.stringify(userPayload) }
    ],
});

let buffer = '';
for await (const chunk of stream) {
    const part = chunk?.choices?.[0]?.delta?.content ?? '';
    if (!part) continue;
    buffer += part;
    
    // 解析完整 JSON 对象
    let startIdx = -1;
    let depth = 0;
    let inString = false;
    for (let i = 0; i < buffer.length; i++) {
        const ch = buffer[i];
        if (ch === '"' && buffer[i - 1] !== '\\') {
            inString = !inString;
        }
        if (inString) continue;
        if (ch === '{') {
            if (depth === 0) startIdx = i;
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0 && startIdx !== -1) {
                const jsonStr = buffer.slice(startIdx, i + 1);
                buffer = buffer.slice(i + 1);
                i = -1;
                
                try {
                    const evt = JSON.parse(jsonStr);
                    const type = evt?.event;
                    
                    if (type === 'summary-delta') {
                        streamedContent += evt.delta;
                        emitters.onDelta?.(evt.delta);  // 发送增量文本
                    } else if (type === 'summary-complete') {
                        emitters.onComplete?.(streamedContent);
                    } else if (type === 'keyTakeaway-complete') {
                        emitters.onPartial?.({ keyTakeaway: evt.value });
                    } else if (type === 'keyPoints-item') {
                        emitters.onPartial?.({ keyPoints: [evt.value] });
                    } else if (type === 'coreTerms-item') {
                        emitters.onPartial?.({ coreTerms: [evt.value] });
                    }
                } catch {
                    // 忽略解析错误
                }
            }
        }
    }
}
```

**关键点**:
- 要求 AI 模型输出结构化的 NDJSON 事件
- 使用花括号栈解析完整的 JSON 对象
- 处理字符串转义，避免在字符串内误判括号
- 将解析的事件转发给 SSE 层

## 事件类型详解

### 1. summary-delta
- **用途**: 实时传输摘要正文的增量内容
- **格式**: `{"event":"summary-delta","delta":"文本片段"}`
- **客户端处理**: 追加到 `streamingText` 并实时显示

### 2. summary-complete
- **用途**: 标记摘要正文生成完成
- **格式**: `{"event":"summary-complete"}`
- **客户端处理**: 确保完整文本显示

### 3. summary-partial
- **用途**: 传输结构化字段的局部更新
- **格式**: 
  - `{"event":"keyTakeaway-complete","value":"关键要点"}`
  - `{"event":"keyPoints-item","value":"要点内容"}`
  - `{"event":"coreTerms-item","value":"核心术语"}`
- **客户端处理**: 更新对应的 UI 组件

### 4. summary-final
- **用途**: 传输完整的最终数据
- **格式**: 完整的 `SummaryData` 对象
- **客户端处理**: 替换流式数据，完成整个流程

### 5. error
- **用途**: 传输错误信息
- **格式**: `{"event":"error","message":"错误信息"}`
- **客户端处理**: 显示错误状态

## 时序图

```
客户端         服务端API        生成服务        AI模型
  |              |               |              |
  |--EventSource->|              |              |
  |              |--generateVideoSummaryStream->|
  |              |               |--OpenAI API-->|
  |              |               |<--stream------|
  |<--summary-delta--|           |              |
  |<--summary-delta--|           |              |
  |<--summary-delta--|           |              |
  |<--summary-complete--|        |              |
  |<--summary-partial--|         |              |
  |<--summary-partial--|         |              |
  |<--summary-final----|         |              |
  |              |               |              |
```

## 性能优化

### 1. 缓存策略
- 优先检查数据库缓存
- 缓存命中时直接返回 JSON，避免不必要的流式处理

### 2. 心跳机制
- 每 15 秒发送 `: keep-alive` 心跳
- 防止代理服务器超时断开连接

### 3. 缓冲控制
- 设置 `X-Accel-Buffering: no` 禁用代理缓冲
- 设置 `Cache-Control: no-cache, no-transform`

### 4. 错误处理
- 流式生成失败时回退到非流式生成
- 完善的错误分类和状态码

## 调试和监控

### 服务端日志
```javascript
console.log(`[get-summary] ▶️ request start v=${videoId}`);
console.log(`[get-summary] ✅ cache hit v=${videoId} in ${elapsed}ms`);
console.log(`[get-summary] 🚀 start streaming generation v=${videoId}`);
console.log(`[video-summary-stream] chunk len=${part.length}`);
console.log(`[video-summary-stream] summary-complete len=${streamedContent.length}`);
console.log(`[get-summary] 🎉 final payload persisted v=${videoId} total=${total}ms`);
```

### 客户端调试
- 在浏览器 Network 面板查看 SSE 连接
- 在 Console 中监听 EventSource 事件
- 检查 `streamingText` 的实时更新

## 扩展性考虑

### 1. 支持更多事件类型
- 可以轻松添加新的事件类型
- 客户端通过 `onPartial` 处理未知字段

### 2. 多语言支持
- 修改 prompt 和系统指令
- 调整 JSON 解析逻辑

### 3. 自定义流式速度
- 在服务端控制 delta 发送频率
- 客户端可以实现打字机效果

## 总结

YTGist 的流式架构通过以下关键设计实现了流畅的用户体验：

1. **分层架构**: 客户端、API、生成服务各司其职
2. **结构化协议**: NDJSON 事件确保数据完整性
3. **实时更新**: SSE 提供低延迟的实时通信
4. **容错机制**: 多层错误处理和回退策略
5. **性能优化**: 缓存、心跳、缓冲控制等优化措施

这种架构既保证了用户体验的流畅性，又确保了系统的稳定性和可扩展性。
