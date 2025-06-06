import { useEffect, useRef } from 'react';
import { buildClientSSEUrl, SSE_ENDPOINTS } from '@/lib/config/sse-config';

interface SSEOptions {
  onMessage?: (event: any) => void;
  onError?: (error: any) => void;
  onConnected?: () => void;
}

// 全局事件订阅 - 用于监听所有系统事件（包括隧道更新、仪表盘更新等）
export function useGlobalSSE(options: SSEOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = buildClientSSEUrl(SSE_ENDPOINTS.global);
    console.log(`[前端SSE] 尝试建立SSE连接`, { url });

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    
    eventSource.onmessage = (event) => {
      console.log(`[前端SSE] 收到SSE消息`, {
        原始数据: event.data,
        时间戳: new Date().toISOString()
      });
      
      try {
        const data = JSON.parse(event.data);
        console.log('[前端SSE] 解析后的全局数据', data);
        
        // 检查是否是空对象确认消息
        if (Object.keys(data).length === 0) {
          console.log(`[前端SSE] ✅ 收到SSE连接确认消息`);
          if (options.onConnected) {
            options.onConnected();
          }
          return;
        }
        
        if (options.onMessage) {
          options.onMessage(data);
        }
      } catch (error) {
        console.error('[前端SSE] ❌ 解析全局SSE数据失败', error, '原始数据:', event.data);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error(`[前端SSE] SSE连接错误`, error);
      if (options.onError) {
        options.onError(error);
      }
    };

    return () => {
      if (eventSourceRef.current) {
        console.log('[前端SSE] 清理全局SSE连接');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  return eventSourceRef.current;
}

// 隧道事件订阅 - 用于监听特定隧道的事件
export function useTunnelSSE(instanceId: string, options: SSEOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!instanceId) {
      console.log('[前端SSE] instanceId为空，跳过SSE订阅');
      return;
    }

    const url = buildClientSSEUrl(SSE_ENDPOINTS.tunnel(instanceId));
    console.log(`[前端SSE] 尝试建立隧道SSE连接`, { url, instanceId });

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // 检查是否是空对象确认消息
        if (Object.keys(data).length === 0) {
          console.log(`[前端SSE] ✅ 收到隧道连接确认消息`);
          if (options.onConnected) {
            options.onConnected();
          }
          return;
        }
        
        console.log(`[前端SSE] 收到隧道SSE消息:`, {
          instanceId,
          事件类型: data.type,
          数据: data
        });
        
        if (options.onMessage) {
          options.onMessage(data);
        }
      } catch (error) {
        console.error('[前端SSE] ❌ 解析隧道SSE数据失败', error, '原始数据:', event.data);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error(`[前端SSE] 隧道SSE连接错误`, error);
      if (options.onError) {
        options.onError(error);
      }
    };

    return () => {
      if (eventSourceRef.current) {
        console.log('[前端SSE] 清理隧道SSE连接');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [instanceId]);

  return eventSourceRef.current;
} 