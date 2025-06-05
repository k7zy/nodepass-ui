import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

// 确保在启动时就初始化全局 SSE 管理器
import { globalSSEManager } from '@/lib/server/global-sse';

// 导入SSE服务
import { initializeSSEService } from '@/lib/server/sse-service';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

console.log('[Server] 启动集成模式服务器...');
console.log('[Server] 全局SSE管理器已初始化:', !!globalSSEManager);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('[Server] 请求处理错误:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  })
  .once('error', (err) => {
    console.error('[Server] 服务器启动失败:', err);
    process.exit(1);
  })
  .listen(port, () => {
    console.log(`[Server] ✅ 集成模式服务器运行在 http://${hostname}:${port}`);
    
    // 初始化 SSE 服务
    console.log('[Server] 正在初始化 SSE 监听服务...');
    initializeSSEService();
    
    console.log('[Server] 🚀 所有服务已启动完成');
    console.log('[Server] - Frontend: http://localhost:3000');
    console.log('[Server] - SSE API Routes: http://localhost:3000/api/sse/*');
    console.log('[Server] - 使用全局SSE管理器实例:', globalSSEManager.getStats().instanceId);
  });
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('[Server] 接收到SIGINT信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Server] 接收到SIGTERM信号，正在关闭服务器...');
  process.exit(0);
}); 