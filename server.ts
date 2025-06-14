import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { logger } from '@/lib/logger';
// 确保在启动时就初始化全局 SSE 管理器
import { globalSSEManager } from '@/lib/server/global-sse';
import { exec } from 'child_process';
import { promisify } from 'util';

// 导入SSE服务
import { initializeSSEService } from '@/lib/server/sse-service';

const execAsync = promisify(exec);

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);


const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      logger.error('[Server] 请求处理错误:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  })
  .once('error', (err) => {
    logger.error('[Server] 服务器启动失败:', err);
    process.exit(1);
  })
  .listen(port, async () => {
    logger.info(`[Server] ✅ 服务运行在 http://${hostname}:${port}`);
    
    // 初始化 SSE 服务
    logger.info('[Server] 正在初始化 SSE 监听服务...');
    initializeSSEService();
    
    logger.info('[Server] 🚀 所有服务已启动完成');
    logger.info('[Server] - 使用全局SSE管理器实例:', globalSSEManager.getStats().instanceId);
  });
});

// 优雅关闭
process.on('SIGINT', () => {
  logger.info('[Server] 接收到SIGINT信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('[Server] 接收到SIGTERM信号，正在关闭服务器...');
  process.exit(0);
}); 