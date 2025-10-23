# RSS订阅功能实现

## 功能概述

RSS订阅功能使用YouTube RSS feed来监控订阅频道的新视频，相比API调用方式更加轻量级、可靠且高效。

## 主要优势

### 相比API方式的优势
- **更轻量级**: RSS feed数据量小，解析速度快
- **更可靠**: 不依赖复杂的API认证和配额限制
- **更高效**: 批量获取多个频道信息，减少网络请求
- **更稳定**: RSS是标准协议，兼容性好
- **更经济**: 减少API调用成本

### 增量更新优势
- **智能记录**: 记录每个频道最新处理的视频ID
- **增量处理**: 只处理比上次更新的视频，大大提高效率
- **减少重复**: 避免重复处理已有视频
- **更快响应**: 增量更新可以更频繁运行（每2小时）
- **资源节约**: 减少不必要的视频数据处理

### YouTube Shorts屏蔽
- **自动过滤**: 自动识别并屏蔽YouTube Shorts视频
- **多种检测**: 通过URL、标题、描述等多维度检测
- **智能识别**: 支持多种Shorts识别模式
- **日志记录**: 记录被屏蔽的Shorts视频信息

## 技术实现

### 1. RSS解析器 (`src/lib/server/rss-monitor.ts`)
- 使用 `rss-parser` 库解析YouTube RSS feed
- 支持代理配置（通过 `PROXY_URI` 环境变量）
- 自动提取视频ID、标题、发布时间等信息
- 支持批量处理多个频道
- **YouTube Shorts屏蔽**: 自动识别并过滤Shorts视频

### 2. API端点
- `POST /api/process-followed-channels-rss` - RSS方式处理订阅频道
- `POST /api/process-followed-channels-rss-incremental` - 增量RSS方式处理订阅频道
- `POST /api/test-rss-monitor` - 测试RSS监控功能
- `POST /api/test-rss-incremental` - 测试增量RSS监控功能
- `POST /api/migrate-followed-channels-incremental` - 数据库迁移（添加增量更新字段）

### 3. GitHub Actions工作流
- `.github/workflows/process-followed-channels-rss.yml` - RSS定时任务（每4小时）
- `.github/workflows/process-followed-channels-rss-incremental.yml` - 增量RSS定时任务（每2小时）

### 4. 测试界面
- `/rss-test` - RSS功能测试页面
- 支持测试特定频道或所有关注频道
- 实时显示RSS解析结果
- 支持增量更新测试

## 使用方法

### 1. 环境配置
确保已安装依赖：
```bash
pnpm add rss-parser
```

### 2. 环境变量
```env
CRON_SECRET=your-secret-key-for-cron-authentication
PROXY_URI=your-proxy-uri-if-needed
```

### 3. GitHub Secrets配置
在GitHub仓库设置中添加：
- `CRON_SECRET` - 用于验证定时任务请求
- `API_BASE_URL` - 你的应用部署URL

### 4. 测试RSS功能
1. 访问 `/rss-test` 页面
2. 选择测试特定频道或所有关注频道
3. 查看RSS解析结果和视频信息

### 5. 启用RSS定时任务
1. 确保GitHub Actions工作流已配置
2. 设置正确的GitHub Secrets
3. 工作流将自动运行：
   - 普通RSS任务：每4小时
   - 增量RSS任务：每2小时（推荐）

### 6. 增量更新功能
1. 系统自动记录每个频道最新处理的视频ID
2. 下次运行时只处理比上次更新的视频
3. 大大提高处理效率，减少资源消耗
4. 支持更频繁的检查（每2小时）

### 7. 数据库迁移
1. 如果已有followed_channels数据，需要运行迁移脚本
2. 访问 `/rss-test` 页面，点击"迁移数据库"按钮
3. 或调用API: `POST /api/migrate-followed-channels-incremental`
4. 迁移会为现有频道添加增量更新字段

## RSS Feed格式

YouTube频道RSS URL格式：
```
https://www.youtube.com/feeds/videos.xml?channel_id={channelId}
```

支持的频道URL格式：
- `https://www.youtube.com/channel/{channelId}`
- `https://www.youtube.com/c/{channelName}`
- `https://www.youtube.com/user/{userName}`
- `https://www.youtube.com/@{handle}`

## 数据结构

### RSS视频信息
```typescript
interface RSSVideo {
    videoId: string;
    title: string;
    publishedAt: string;
    thumbnailUrl?: string;
    duration?: string;
    description?: string;
    link: string;
}
```

### RSS频道信息
```typescript
interface RSSChannelInfo {
    channelId: string;
    channelName: string;
    channelUrl: string;
    thumbnailUrl?: string;
    rssUrl: string;
}
```

## 性能优化

### 1. 批量处理
- 一次性获取多个频道的RSS feed
- 减少网络请求次数

### 2. 智能过滤
- 只处理指定天数内的视频
- 跳过已有总结的视频
- **YouTube Shorts屏蔽**: 自动过滤Shorts视频

### 3. 错误处理
- 单个频道失败不影响其他频道
- 详细的错误日志和状态报告

## YouTube Shorts屏蔽技术

### 检测方法
1. **URL检测**: 检查视频链接是否包含 `/shorts/` 路径
2. **标题检测**: 检查标题是否包含 `#Shorts` 或 `#shorts` 标签
3. **描述检测**: 检查视频描述中是否包含 "shorts" 关键词
4. **视频ID模式**: 分析视频ID是否符合Shorts特征

### 屏蔽效果
- **自动过滤**: 在RSS解析阶段就过滤掉Shorts
- **日志记录**: 记录被屏蔽的Shorts视频信息
- **性能提升**: 减少不必要的视频处理
- **内容质量**: 专注于长视频内容

## 监控和调试

### 1. 日志输出
- 详细的处理日志
- 成功/失败统计信息
- 错误详情和堆栈跟踪

### 2. 测试工具
- RSS解析测试
- 频道信息验证
- 视频数据完整性检查

### 3. 状态报告
- 处理结果统计
- 新视频数量
- 错误汇总

## 迁移指南

### 数据库迁移（必需）

如果您的系统已有followed_channels数据，需要运行数据库迁移来添加增量更新字段：

1. **运行数据库迁移**
   ```bash
   # 方法1：通过测试页面
   # 访问 /rss-test 页面，点击"迁移数据库"按钮
   
   # 方法2：通过API调用
   curl -X POST http://localhost:5173/api/migrate-followed-channels-incremental \
     -H "Content-Type: application/json" \
     -d '{"secret":"your-secret"}'
   ```

2. **验证迁移结果**
   - 检查迁移日志
   - 确认所有频道都已添加增量更新字段

### 从API方式迁移到RSS方式

1. **备份现有配置**
   ```bash
   # 备份现有的GitHub Actions工作流
   cp .github/workflows/process-followed-channels.yml .github/workflows/process-followed-channels-api-backup.yml
   ```

2. **运行数据库迁移**
   - 按照上述步骤运行数据库迁移

3. **启用RSS工作流**
   - 确保 `.github/workflows/process-followed-channels-rss-incremental.yml` 存在
   - 在GitHub仓库设置中启用工作流

4. **测试RSS功能**
   - 访问 `/rss-test` 页面
   - 验证RSS解析和增量更新是否正常工作

5. **监控运行状态**
   - 检查GitHub Actions运行日志
   - 确认RSS处理结果

### 回滚到API方式
如果需要回滚到API方式：
1. 禁用RSS工作流
2. 启用原有的API工作流
3. 更新定时任务配置

## 故障排除

### 常见问题

1. **RSS解析失败**
   - 检查频道ID是否正确
   - 验证网络连接和代理设置
   - 查看详细错误日志

2. **视频信息不完整**
   - 检查RSS feed是否包含完整信息
   - 验证视频链接格式

3. **定时任务不运行**
   - 检查GitHub Actions权限
   - 验证环境变量配置
   - 查看工作流运行日志

### 调试步骤

1. **本地测试**
   ```bash
   # 测试RSS解析
   curl -X POST http://localhost:5173/api/test-rss-monitor \
     -H "Content-Type: application/json" \
     -d '{"secret":"your-secret","channelId":"UC_x5XG1OV2P6uZZ5FSM9Ttw"}'
   ```

2. **检查日志**
   - 查看控制台输出
   - 检查GitHub Actions日志
   - 验证数据库记录

3. **性能监控**
   - 监控RSS解析时间
   - 检查内存使用情况
   - 验证网络请求效率

## 最佳实践

1. **定期测试**: 定期运行RSS测试确保功能正常
2. **监控日志**: 关注错误日志和性能指标
3. **备份配置**: 定期备份工作流和配置
4. **版本控制**: 使用Git管理配置变更
5. **文档更新**: 及时更新相关文档

## 未来改进

1. **缓存机制**: 实现RSS feed缓存减少重复请求
2. **增量更新**: 只处理新增的视频
3. **智能调度**: 根据频道活跃度调整检查频率
4. **多源支持**: 支持其他平台的RSS feed
5. **实时通知**: 新视频发现时发送通知
