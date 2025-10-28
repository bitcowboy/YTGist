# DeepSeek API 兼容性解决方案

## 问题描述

DeepSeek API 不支持 `response_format` 参数中的 JSON schema 功能，而项目中的多个服务（视频总结、每日总结、评论分析等）都依赖 JSON schema 来确保 AI 返回结构化数据。

## 解决方案

创建了一个兼容性层 (`ai-compatibility.ts`)，自动检测当前使用的模型是否支持 JSON schema，并为不支持的模型提供替代方案。

## 核心功能

### 1. 模型支持检测

```typescript
import { supportsJsonSchema } from './ai-compatibility.js';

// 检测当前模型是否支持 JSON schema
const supportsSchema = supportsJsonSchema();
```

支持的模型包括：
- OpenAI GPT 系列
- Anthropic Claude 系列  
- Meta Llama 系列
- Google Gemini 系列

不支持的模型包括：
- DeepSeek 系列
- 其他未知模型

### 2. JSON 格式指令生成

对于不支持 JSON schema 的模型，系统会自动在 prompt 中添加详细的 JSON 格式说明：

```typescript
import { generateJsonFormatInstruction } from './ai-compatibility.js';

const instruction = generateJsonFormatInstruction(schema);
// 生成人类可读的 JSON 格式说明
```

### 3. 智能 JSON 解析

提供强大的 JSON 解析功能，能够处理多种响应格式：

```typescript
import { parseJsonResponse } from './ai-compatibility.js';

// 解析各种格式的响应
const result = parseJsonResponse(content, fallbackData);
```

支持的格式：
- 标准 JSON
- Markdown 代码块中的 JSON
- 文本中的 JSON 对象
- 提供 fallback 数据

### 4. 统一的 API 调用接口

```typescript
import { createApiRequestOptions } from './ai-compatibility.js';

// 创建兼容的 API 请求选项
const options = createApiRequestOptions(messages, schema, fallbackData);
const response = await openai.chat.completions.create(options);
```

## 使用方法

### 基本用法

```typescript
import { createApiRequestOptions, parseJsonResponse } from './ai-compatibility.js';

// 定义 schema
const schema = {
  type: "object",
  required: ["keyTakeaway", "summary"],
  properties: {
    keyTakeaway: { type: "string" },
    summary: { type: "string" }
  }
};

// 创建请求
const response = await openai.chat.completions.create(
  createApiRequestOptions([
    { role: "system", content: "你是一个AI助手" },
    { role: "user", content: "请分析这个视频" }
  ], schema, {
    keyTakeaway: "无法生成要点",
    summary: "无法生成总结"
  })
);

// 解析响应
const result = parseJsonResponse(response.choices[0].message.content, {
  keyTakeaway: "无法生成要点",
  summary: "无法生成总结"
});
```

### 配置示例

**场景1：使用 DeepSeek 模型，自动检测**
```env
OPENROUTER_MODEL=deepseek/deepseek-chat
# 不设置 USE_JSON_SCHEMA，系统会自动检测并禁用 JSON schema
```

**场景2：强制使用 JSON schema**
```env
OPENROUTER_MODEL=deepseek/deepseek-chat
USE_JSON_SCHEMA=true
# 强制使用 JSON schema（可能会失败，但可以测试）
```

**场景3：强制禁用 JSON schema**
```env
OPENROUTER_MODEL=openai/gpt-4o
USE_JSON_SCHEMA=false
# 即使 GPT-4 支持 JSON schema，也使用 prompt 指令方式
```

### 在现有服务中使用

所有现有的 AI 服务都已更新为使用兼容性层：

- `src/lib/server/summary.ts` - 视频总结
- `src/lib/server/daily-summary.ts` - 每日总结
- `src/lib/server/comments-summary.ts` - 评论分析
- `src/routes/api/projects/[projectId]/summary/+server.ts` - 项目总结

## 配置

### 环境变量

确保在 `.env` 文件中正确配置：

```env
# OpenRouter API Configuration
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=your_api_key_here
OPENROUTER_MODEL=deepseek/deepseek-chat

# JSON Schema Control (Optional)
# Default: true (enable JSON schema for supported models)
# Options: true/false, 1/0, yes/no
# Set to false to force all models to use prompt instructions instead of JSON schema
USE_JSON_SCHEMA=true

# Proxy Configuration (Optional)
PROXY_URI=

# Other API Keys
FREE_TRANSCRIPT_ENDPOINT=
CRON_SECRET=your_cron_secret
NONCE_SECRET=your_nonce_secret
```

**注意：** `USE_JSON_SCHEMA` 环境变量使用标准的 `process.env` 方式读取，不需要在 SvelteKit 的类型声明中定义。

### JSON Schema 控制

通过 `USE_JSON_SCHEMA` 环境变量可以强制控制是否使用 JSON schema：

- **`USE_JSON_SCHEMA=true`**（默认）：启用 JSON schema，对于支持的模型使用 `response_format`
- **`USE_JSON_SCHEMA=false`**：禁用 JSON schema，所有模型都使用 prompt 指令方式
- **不设置**：自动检测模型支持情况

**使用场景：**
- 强制使用 JSON schema：`USE_JSON_SCHEMA=true`
- 强制禁用 JSON schema：`USE_JSON_SCHEMA=false`
- 让系统自动决定：不设置此变量

### 支持的模型

**支持 JSON Schema 的模型：**
- `openai/gpt-4o`
- `openai/gpt-4o-mini`
- `openai/gpt-4-turbo`
- `anthropic/claude-3-5-sonnet`
- `meta-llama/llama-3.1-8b-instruct`
- `google/gemini-pro-1.5`

**不支持 JSON Schema 的模型：**
- `deepseek/deepseek-chat`
- `deepseek/deepseek-coder`
- `deepseek/deepseek-v2`

## 测试

运行测试脚本验证兼容性：

```bash
node src/lib/server/test-compatibility.js
```

## 优势

1. **自动适配**：根据模型自动选择最佳策略
2. **向后兼容**：不影响现有功能
3. **错误处理**：提供 fallback 机制
4. **易于维护**：统一的接口，便于更新

## 注意事项

1. 对于不支持 JSON schema 的模型，响应质量可能略有下降
2. 建议在使用 DeepSeek 等模型时，在 prompt 中明确要求 JSON 格式
3. 定期测试不同模型的兼容性

## 故障排除

### 常见问题

1. **JSON 解析失败**
   - 检查 `USE_JSON_SCHEMA` 环境变量设置
   - 确认 prompt 中包含了 JSON 格式说明
   - 使用 fallback 数据

2. **模型检测错误**
   - 检查 `OPENROUTER_MODEL` 环境变量
   - 确认模型名称拼写正确
   - 检查 `USE_JSON_SCHEMA` 是否覆盖了自动检测

3. **响应格式异常**
   - 查看控制台日志
   - 检查 AI 响应内容
   - 调整 prompt 说明
   - 尝试设置 `USE_JSON_SCHEMA=false` 强制使用 prompt 指令

4. **环境变量不生效**
   - 确认 `.env` 文件格式正确
   - 重启应用使环境变量生效
   - 检查变量名拼写：`USE_JSON_SCHEMA`

### 调试

启用详细日志：

```typescript
import { testJsonSchemaConfig, supportsJsonSchema } from './ai-compatibility.js';

// 测试当前配置
const config = testJsonSchemaConfig();
console.log('JSON Schema Configuration:', config);

// 单独检查
console.log('Model supports schema:', supportsJsonSchema());
console.log('USE_JSON_SCHEMA env var:', process.env.USE_JSON_SCHEMA);
```

`testJsonSchemaConfig()` 函数返回详细信息：
```typescript
{
  model: "deepseek/deepseek-chat",
  useJsonSchemaEnv: "false",
  supportsSchema: false,
  reason: "Environment variable USE_JSON_SCHEMA=false overrides automatic detection"
}
```

### 测试不同配置

```bash
# 测试自动检测
OPENROUTER_MODEL=deepseek/deepseek-chat npm run dev

# 测试强制启用 JSON schema
USE_JSON_SCHEMA=true OPENROUTER_MODEL=deepseek/deepseek-chat npm run dev

# 测试强制禁用 JSON schema
USE_JSON_SCHEMA=false OPENROUTER_MODEL=openai/gpt-4o npm run dev
```
