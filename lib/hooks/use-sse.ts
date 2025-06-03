import { useEffect, useRef } from 'react';

interface SSEOptions {
  onMessage?: (event: any) => void;
  onError?: (error: any) => void;
  onConnected?: () => void;
}

// 全局事件订阅 - 连接到SSE后端服务
export function useGlobalSSE(options: SSEOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // 连接到SSE后端服务的全局端点
    const eventSource = new EventSource('http://localhost:3001/sse/global');
    eventSourceRef.current = eventSource;

    console.log('[前端SSE] 开始建立全局SSE连接到后端服务', {
      url: 'http://localhost:3001/sse/global'
    });

    eventSource.onmessage = (event) => {
      console.log('[前端SSE] 收到全局SSE后端服务的消息', {
        原始数据: event.data,
        时间戳: new Date().toISOString()
      });
      
      try {
        const data = JSON.parse(event.data);
        console.log('[前端SSE] 解析后的全局数据', data);
        
        // 检查是否是空对象确认消息
        if (Object.keys(data).length === 0) {
          console.log('[前端SSE] ✅ 收到全局SSE后端服务连接确认消息');
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

    eventSource.onopen = (event) => {
      console.log('[前端SSE] ✅ 全局SSE连接到后端服务已打开', event);
    };

    eventSource.onerror = (error) => {
      console.error('[前端SSE] ❌ 全局SSE后端服务连接错误', error);
      if (options.onError) {
        options.onError(error);
      }
    };

    return () => {
      console.log('[前端SSE] 🔌 关闭全局SSE后端服务连接');
      eventSource.close();
    };
  }, []);

  return eventSourceRef.current;
}

// 隧道详情订阅 - 基于 endpointId+instanceId
export function useTunnelSSE(
  endpointId: string,
  instanceId: string,
  options: SSEOptions = {}
) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/sse/${endpointId}/tunnel/${instanceId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'connected' && options.onConnected) {
        options.onConnected();
      } else if (options.onMessage) {
        options.onMessage(data);
      }
    };

    eventSource.onerror = (error) => {
      if (options.onError) {
        options.onError(error);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [endpointId, instanceId]);

  return eventSourceRef.current;
}

// 仪表盘订阅
export function useDashboardSSE(options: SSEOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/sse/dashboard');
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'connected' && options.onConnected) {
        options.onConnected();
      } else if (options.onMessage) {
        options.onMessage(data);
      }
    };

    eventSource.onerror = (error) => {
      if (options.onError) {
        options.onError(error);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return eventSourceRef.current;
} 