import { NextRequest } from 'next/server';
import { sseManager, SSEEventTypes } from '@/lib/server/sse-manager';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ instanceId: string }> }
) {
  const params = await context.params;
  const { instanceId } = params;
  const subscriberId = uuidv4();
  const encoder = new TextEncoder();
  
  console.log(`[SSE-Route] 新的隧道SSE连接请求`, {
    路径: `/api/sse/tunnel/${instanceId}`,
    订阅者ID: subscriberId,
    instanceId
  });
  
  const stream = new ReadableStream({
    start(controller) {
      // 立即发送一个空对象确认连接
      const confirmMessage = `data: ${JSON.stringify({})}\n\n`;
      controller.enqueue(encoder.encode(confirmMessage));
      
      console.log(`[SSE-Route] 连接确认消息已发送给订阅者: ${subscriberId}`);
      
      // 添加到订阅者列表
      sseManager.addSubscriber(
        subscriberId,
        controller,
        SSEEventTypes.TUNNEL,
        instanceId
      );
      
      console.log(`[SSE-Route] 订阅者已注册到SSE管理器: ${subscriberId}`);
      
      // 打印当前所有订阅者（调试用）
      sseManager.listSubscribers();
      
      // 清理订阅
      request.signal.addEventListener('abort', () => {
        console.log(`[SSE-Route] 连接中断，移除订阅者: ${subscriberId}`);
        sseManager.removeSubscriber(subscriberId);
        controller.close();
      });
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
} 