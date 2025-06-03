import { sseService } from '../lib/server/sse-service';
import { logger } from '../lib/server/logger';
import { sseManager } from '../lib/server/sse-manager';
import { initializeSystem, cleanupExpiredSessions } from '../lib/server/auth-service';
import { createServer } from 'http';
import { parse } from 'url';
import { v4 as uuidv4 } from 'uuid';

async function startSSEService() {
  try {
    logger.info('正在启动 SSE 后台服务...');
    
    // 🚀 系统初始化
    logger.info('检查系统初始化状态...');
    const result = await initializeSystem();
    if (result) {
      logger.info('系统初始化完成', { username: result.username });
    } else {
      logger.info('系统已经初始化过了');
    }
    
    // 清理过期会话
    await cleanupExpiredSessions();
    logger.info('过期会话清理完成');
    
    // 启动SSE服务
    await sseService.initialize();
    logger.info('SSE 后台服务已启动并运行');
    
    // 创建HTTP服务器用于处理前端SSE连接
    const server = createServer((req, res) => {
      const parsedUrl = parse(req.url || '', true);
      const pathname = parsedUrl.pathname;
      
      // 设置CORS头
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      // 处理全局SSE连接
      if (pathname === '/sse/global') {
        const subscriberId = uuidv4();
        
        console.log(`[SSE-Backend] 新的全局SSE连接请求`, {
          路径: pathname,
          订阅者ID: subscriberId
        });
        
        // 设置SSE响应头
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        
        // 立即发送一个空对象确认连接
        res.write(`data: ${JSON.stringify({})}\n\n`);
        console.log(`[SSE-Backend] 全局连接确认消息已发送给订阅者: ${subscriberId}`);
        
        // 创建控制器模拟
        const controller = {
          enqueue: (data: Uint8Array) => {
            if (!res.destroyed) {
              res.write(Buffer.from(data));
            }
          }
        };
        
        // 添加到SSE管理器 - 全局订阅者
        sseManager.addSubscriber(
          subscriberId,
          controller as any,
          'global' as any,
          undefined // 全局订阅者没有instanceId
        );
        
        console.log(`[SSE-Backend] 全局订阅者已注册到SSE管理器: ${subscriberId}`);
        sseManager.listSubscribers();
        
        // 处理连接关闭
        req.on('close', () => {
          console.log(`[SSE-Backend] 全局连接中断，移除订阅者: ${subscriberId}`);
          sseManager.removeSubscriber(subscriberId);
        });
        
        req.on('error', (error) => {
          console.error(`[SSE-Backend] 全局连接错误: ${subscriberId}`, error);
          sseManager.removeSubscriber(subscriberId);
        });
        
        return;
      }
      
      // 处理SSE隧道连接
      if (pathname?.match(/^\/sse\/tunnel\/(.+)$/)) {
        const instanceId = pathname.split('/').pop();
        
        if (!instanceId) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('缺少instanceId参数');
          return;
        }
        
        const subscriberId = uuidv4();
        
        console.log(`[SSE-Backend] 新的隧道SSE连接请求`, {
          路径: pathname,
          订阅者ID: subscriberId,
          instanceId
        });
        
        // 设置SSE响应头
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        
        // 立即发送一个空对象确认连接
        res.write(`data: ${JSON.stringify({})}\n\n`);
        console.log(`[SSE-Backend] 隧道连接确认消息已发送给订阅者: ${subscriberId}`);
        
        // 创建控制器模拟
        const controller = {
          enqueue: (data: Uint8Array) => {
            if (!res.destroyed) {
              res.write(Buffer.from(data));
            }
          }
        };
        
        // 添加到SSE管理器
        sseManager.addSubscriber(
          subscriberId,
          controller as any,
          'tunnel' as any,
          instanceId
        );
        
        console.log(`[SSE-Backend] 隧道订阅者已注册到SSE管理器: ${subscriberId}`);
        sseManager.listSubscribers();
        
        // 处理连接关闭
        req.on('close', () => {
          console.log(`[SSE-Backend] 隧道连接中断，移除订阅者: ${subscriberId}`);
          sseManager.removeSubscriber(subscriberId);
        });
        
        req.on('error', (error) => {
          console.error(`[SSE-Backend] 隧道连接错误: ${subscriberId}`, error);
          sseManager.removeSubscriber(subscriberId);
        });
        
        return;
      }
      
      // 处理其他请求
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
    
    // 启动HTTP服务器
    const port = 3001; // 使用不同的端口避免与Next.js冲突
    server.listen(port, () => {
      console.log(`[SSE-Backend] HTTP服务器已启动，监听端口: ${port}`);
      console.log(`[SSE-Backend] SSE端点:`);
      console.log(`  - 全局SSE: http://localhost:${port}/sse/global`);
      console.log(`  - 隧道SSE: http://localhost:${port}/sse/tunnel/{instanceId}`);
    });
    
    // 处理进程退出信号
    const handleExit = async () => {
      logger.info('正在关闭 SSE 服务...');
      server.close();
      await sseService.shutdown();
      logger.info('SSE 服务已关闭');
      process.exit(0);
    };
    
    // 监听退出信号
    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);
    process.on('SIGHUP', handleExit);
    
    // 处理未捕获的异常
    process.on('uncaughtException', async (error) => {
      logger.error('未捕获的异常', error);
      await handleExit();
    });
    
    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('未处理的 Promise 拒绝', { reason, promise });
      await handleExit();
    });
    
  } catch (error) {
    logger.error('启动 SSE 服务失败', error);
    process.exit(1);
  }
}

startSSEService(); 