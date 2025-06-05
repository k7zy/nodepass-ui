import { NextRequest } from 'next/server';
import { getGlobalSSEManager } from '@/lib/server/global-sse';
import { SSEEventTypes } from '@/lib/server/sse-manager';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ instanceId: string }> }
) {
  // 正确地 await params
  const params = await context.params;
  const instanceId = params.instanceId;
  
  // 使用全局 SSE 管理器
  const sseManager = getGlobalSSEManager();
  
  console.log(`[SSE-Route] 隧道SSE连接请求: ${instanceId}`, {
    url: request.url,
    userAgent: request.headers.get('user-agent'),
    SSE管理器实例: sseManager.getStats().instanceId
  });

  const encoder = new TextEncoder();

  // 创建流式响应
  const stream = new ReadableStream({
    start(controller) {
      // 生成唯一的订阅者ID
      const subscriberId = `tunnel-${instanceId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`[SSE-Route] 创建隧道订阅者: ${subscriberId} (instanceId: ${instanceId})`);

      // 添加到SSE管理器，使用instanceId
      sseManager.addSubscriber(
        subscriberId,
        controller,
        SSEEventTypes.TUNNEL,
        instanceId  // 传递instanceId
      );

      // 发送连接确认消息
      const welcomeMessage = {
        type: 'connection',
        message: `隧道 ${instanceId} SSE连接已建立`,
        timestamp: new Date().toISOString(),
        subscriberId,
        instanceId
      };

      try {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(welcomeMessage)}\n\n`)
        );
        console.log(`[SSE-Route] ✅ 隧道连接确认消息已发送: ${subscriberId}`);
      } catch (error) {
        console.error(`[SSE-Route] ❌ 发送连接确认消息失败: ${subscriberId}`, error);
      }

      // 清理函数
      const cleanup = () => {
        console.log(`[SSE-Route] 清理隧道订阅者: ${subscriberId}`);
        sseManager.removeSubscriber(subscriberId);
      };

      // 监听连接关闭
      request.signal.addEventListener('abort', cleanup);
    }
  });

  // 返回 SSE 响应
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
} 