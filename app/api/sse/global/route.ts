import { NextRequest } from 'next/server';
import { sseManager, SSEEventTypes } from '@/lib/server/sse-manager';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  const subscriberId = uuidv4();
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      // 发送连接成功消息
      const data = `data: ${JSON.stringify({ 
        type: 'connected', 
        message: '全局事件监听已连接',
        timestamp: new Date().toISOString()
      })}\n\n`;
      controller.enqueue(encoder.encode(data));
      
      // 添加到订阅者列表
      sseManager.addSubscriber(subscriberId, controller, SSEEventTypes.GLOBAL);
      
      // 清理订阅
      request.signal.addEventListener('abort', () => {
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