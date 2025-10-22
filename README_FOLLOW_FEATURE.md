# Follow Feature Implementation

## 功能概述

Follow 功能允许用户关注 YouTube 频道，系统会通过 GitHub Actions 每 6 小时自动获取关注频道的最新视频并生成 AI 总结。

## 实现的功能

### 1. 数据库结构
- `followed_channels` - 存储用户关注的频道信息
- `followed_videos` - 存储关注频道的视频记录

### 2. API 端点
- `GET /api/followed-channels` - 获取关注的频道列表
- `POST /api/follow-channel` - 关注/取消关注频道
- `GET /api/followed-summary` - 获取关注频道的视频总结
- `POST /api/process-followed-channels` - 处理关注频道视频（供定时任务调用）

### 3. 前端页面
- `/follow` - Follow 频道展示页面
- 导航栏中的 "Follow" 按钮

### 4. 定时任务
- GitHub Actions 每 6 小时运行一次
- 自动获取关注频道的最新视频
- 生成 AI 总结并存储

## 环境变量配置

需要在环境变量中添加：
```
CRON_SECRET=your-secret-key-for-cron-authentication
```

## GitHub Secrets 配置

在 GitHub 仓库设置中添加以下 Secrets：
- `CRON_SECRET` - 用于验证定时任务请求
- `API_BASE_URL` - 你的应用部署 URL

## 使用方法

1. 访问任何 YouTube 视频页面
2. 使用导航栏中的 "Follow" 按钮关注频道
3. 访问 `/follow` 页面查看关注频道的视频总结
4. 系统会自动每 6 小时获取新视频并生成总结

## 技术实现

- 使用 youtubei.js 获取频道视频
- 使用现有的 AI 总结功能
- 客户端状态管理类似 block-list
- GitHub Actions 定时任务调用 API
