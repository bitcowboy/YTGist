# 浏览器控制台操作指南

## 数据库初始化

### 1. 初始化数据库结构
在浏览器控制台中运行以下命令来初始化数据库：

```javascript
// 初始化数据库
fetch('/api/init-database', { method: 'POST' })
  .then(response => response.json())
  .then(data => {
    console.log('数据库初始化结果:', data);
    if (data.success) {
      console.log('✅ 数据库初始化成功！');
    } else {
      console.log('❌ 数据库初始化失败:', data);
    }
  })
  .catch(error => {
    console.error('❌ 数据库初始化错误:', error);
  });
```

### 2. 检查数据库状态
```javascript
// 检查数据库是否已初始化
fetch('/api/init-database', { method: 'POST' })
  .then(response => response.json())
  .then(data => console.log('数据库状态:', data))
  .catch(error => console.error('检查失败:', error));
```

## 测试评论功能

### 1. 测试视频总结（包含评论）
```javascript
// 测试获取视频总结（会自动获取评论）
const videoId = 'dQw4w9WgXcQ'; // 替换为实际的YouTube视频ID
const nonce = 'your-nonce-here'; // 需要先获取nonce

fetch(`/api/get-summary?v=${videoId}&nonce=${nonce}`)
  .then(response => response.json())
  .then(data => {
    console.log('视频总结数据:', data);
    console.log('评论总结:', data.commentsSummary);
    console.log('评论关键点:', data.commentsKeyPoints);
    console.log('评论数量:', data.commentsCount);
  })
  .catch(error => console.error('获取总结失败:', error));
```

### 2. 获取nonce（用于API调用）
```javascript
// 获取nonce
fetch('/api/generate-nonce')
  .then(response => response.json())
  .then(data => {
    console.log('Nonce:', data.nonce);
    // 保存nonce用于后续API调用
    window.currentNonce = data.nonce;
  })
  .catch(error => console.error('获取nonce失败:', error));
```

### 3. 测试评论获取功能
```javascript
// 直接测试评论获取（需要后端API）
const videoId = 'dQw4w9WgXcQ'; // 替换为实际的YouTube视频ID

// 注意：这个API可能不存在，需要创建
fetch(`/api/get-comments?v=${videoId}`)
  .then(response => response.json())
  .then(data => {
    console.log('评论数据:', data);
    console.log('评论数量:', data.comments.length);
    console.log('总评论数:', data.totalCount);
  })
  .catch(error => console.error('获取评论失败:', error));
```

## 数据库操作

### 1. 查看现有数据
```javascript
// 查看所有总结数据
fetch('/api/get-summary?v=test&nonce=test')
  .then(response => {
    if (response.ok) {
      return response.json();
    } else {
      console.log('API响应状态:', response.status);
      return response.text();
    }
  })
  .then(data => console.log('API响应:', data))
  .catch(error => console.error('请求失败:', error));
```

### 2. 检查特定视频的评论数据
```javascript
// 检查特定视频是否有评论数据
const checkVideoComments = (videoId) => {
  fetch(`/api/get-summary?v=${videoId}&nonce=${window.currentNonce || 'test'}`)
    .then(response => response.json())
    .then(data => {
      console.log(`视频 ${videoId} 的评论数据:`);
      console.log('- 评论总结:', data.commentsSummary || '无');
      console.log('- 评论关键点:', data.commentsKeyPoints || '无');
      console.log('- 评论数量:', data.commentsCount || 0);
    })
    .catch(error => console.error('检查失败:', error));
};

// 使用示例
checkVideoComments('dQw4w9WgXcQ');
```

## 调试和故障排除

### 1. 检查环境变量
```javascript
// 检查是否配置了YouTube API密钥
fetch('/api/test-appwrite')
  .then(response => response.json())
  .then(data => console.log('Appwrite连接状态:', data))
  .catch(error => console.error('连接测试失败:', error));
```

### 2. 查看网络请求
在浏览器开发者工具中：
1. 打开 Network 标签
2. 刷新页面或执行API调用
3. 查看 `/api/get-summary` 请求的响应
4. 检查响应中是否包含 `commentsSummary`、`commentsKeyPoints`、`commentsCount` 字段

### 3. 检查控制台错误
```javascript
// 监听所有网络错误
window.addEventListener('error', (event) => {
  console.error('页面错误:', event.error);
});

// 监听未处理的Promise拒绝
window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的Promise拒绝:', event.reason);
});
```

## 功能验证清单

### ✅ 数据库初始化验证
```javascript
// 1. 运行数据库初始化
fetch('/api/init-database', { method: 'POST' })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      console.log('✅ 数据库初始化成功');
    } else {
      console.log('❌ 数据库初始化失败');
    }
  });
```

### ✅ 评论功能验证
```javascript
// 2. 测试视频总结（包含评论）
const testVideoId = 'dQw4w9WgXcQ'; // 使用一个已知有评论的视频
const testNonce = 'test-nonce';

fetch(`/api/get-summary?v=${testVideoId}&nonce=${testNonce}`)
  .then(response => response.json())
  .then(data => {
    console.log('=== 评论功能验证 ===');
    console.log('视频标题:', data.title);
    console.log('评论总结存在:', !!data.commentsSummary);
    console.log('评论关键点存在:', !!data.commentsKeyPoints);
    console.log('评论数量:', data.commentsCount);
    
    if (data.commentsSummary) {
      console.log('✅ 评论总结功能正常');
    } else {
      console.log('⚠️ 评论总结为空（可能是视频无评论或API限制）');
    }
  });
```

### ✅ UI组件验证
```javascript
// 3. 检查页面是否显示评论组件
const checkCommentsUI = () => {
  const commentsSummary = document.querySelector('[class*="comments-summary"]');
  const commentsKeyPoints = document.querySelector('[class*="comments-key-points"]');
  
  console.log('=== UI组件验证 ===');
  console.log('评论总结组件存在:', !!commentsSummary);
  console.log('评论关键点组件存在:', !!commentsKeyPoints);
  
  if (commentsSummary || commentsKeyPoints) {
    console.log('✅ 评论UI组件已加载');
  } else {
    console.log('⚠️ 评论UI组件未找到（可能视频无评论数据）');
  }
};

// 在页面加载后运行
setTimeout(checkCommentsUI, 2000);
```

## 常见问题解决

### 问题1：评论数据为空
**可能原因：**
- YouTube API密钥未配置
- 视频没有评论
- API限制或错误

**解决方法：**
```javascript
// 检查API密钥配置
console.log('检查环境变量配置...');
fetch('/api/test-appwrite')
  .then(response => response.json())
  .then(data => console.log('配置状态:', data));
```

### 问题2：数据库字段不存在
**解决方法：**
```javascript
// 重新初始化数据库
fetch('/api/init-database', { method: 'POST' })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      console.log('✅ 数据库已更新，包含评论字段');
    }
  });
```

### 问题3：UI组件不显示
**检查步骤：**
1. 确认数据中包含评论信息
2. 检查组件是否正确导入
3. 查看控制台是否有JavaScript错误

```javascript
// 检查页面数据
console.log('当前页面数据:', window.__SVELTE_DATA__);
```

## 完整测试流程

```javascript
// 完整的测试流程
const runFullTest = async () => {
  console.log('🚀 开始完整测试...');
  
  try {
    // 1. 初始化数据库
    console.log('1. 初始化数据库...');
    const initResponse = await fetch('/api/init-database', { method: 'POST' });
    const initData = await initResponse.json();
    console.log('数据库初始化:', initData.success ? '✅' : '❌');
    
    // 2. 获取nonce
    console.log('2. 获取nonce...');
    const nonceResponse = await fetch('/api/generate-nonce');
    const nonceData = await nonceResponse.json();
    const nonce = nonceData.nonce;
    console.log('Nonce获取:', nonce ? '✅' : '❌');
    
    // 3. 测试视频总结
    console.log('3. 测试视频总结...');
    const videoId = 'dQw4w9WgXcQ'; // 替换为实际视频ID
    const summaryResponse = await fetch(`/api/get-summary?v=${videoId}&nonce=${nonce}`);
    const summaryData = await summaryResponse.json();
    
    console.log('视频总结测试结果:');
    console.log('- 标题:', summaryData.title);
    console.log('- 评论总结:', summaryData.commentsSummary ? '✅' : '❌');
    console.log('- 评论关键点:', summaryData.commentsKeyPoints?.length || 0);
    console.log('- 评论数量:', summaryData.commentsCount || 0);
    
    console.log('🎉 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
};

// 运行完整测试
runFullTest();
```

这个指南提供了完整的浏览器控制台操作步骤，你可以按照这些步骤来测试和验证评论功能是否正常工作。
