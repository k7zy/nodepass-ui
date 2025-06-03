import { NextRequest } from 'next/server';
import { sseService } from '@/lib/server/sse-service';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      // 发送连接成功消息
      const data = `data: ${JSON.stringify({ 
        type: 'connected', 
        message: '隧道事件监听已连接',
        timestamp: new Date().toISOString()
      })}\n\n`;
      controller.enqueue(encoder.encode(data));
      
      // 定义事件处理器
      const eventHandlers = {
        created: (eventData: any) => {
          const data = `data: ${JSON.stringify({
            type: 'tunnel:created',
            data: eventData,
            timestamp: new Date().toISOString()
          })}\n\n`;
          controller.enqueue(encoder.encode(data));
        },
        updated: (eventData: any) => {
          const data = `data: ${JSON.stringify({
            type: 'tunnel:updated',
            data: eventData,
            timestamp: new Date().toISOString()
          })}\n\n`;
          controller.enqueue(encoder.encode(data));
        },
        deleted: (eventData: any) => {
          const data = `data: ${JSON.stringify({
            type: 'tunnel:deleted',
            data: eventData,
            timestamp: new Date().toISOString()
          })}\n\n`;
          controller.enqueue(encoder.encode(data));
        },
        shutdown: (eventData: any) => {
          const data = `data: ${JSON.stringify({
            type: 'endpoint:shutdown',
            data: eventData,
            timestamp: new Date().toISOString()
          })}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      };
      
      // 订阅所有隧道事件
      sseService.subscribeToAllTunnelEvents(eventHandlers);
      
      // 清理事件监听器
      request.signal.addEventListener('abort', () => {
        sseService.unsubscribeFromAllTunnelEvents(eventHandlers);
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