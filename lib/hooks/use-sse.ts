import { useEffect, useRef } from 'react';
import { buildClientSSEUrl, SSE_ENDPOINTS } from '@/lib/config/sse-config';

interface SSEOptions {
  onMessage?: (event: any) => void;
  onError?: (error: any) => void;
  onConnected?: () => void;
}

// 全局事件订阅 - 自动适配集成模式和分离模式
export function useGlobalSSE(options: SSEOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // 优先尝试集成模式（Next.js API Routes）
    const integratedUrl = buildClientSSEUrl(SSE_ENDPOINTS.global);
    // 后备使用分离模式（独立后端服务）
    const separatedUrl = 'http://localhost:3001/sse/global';

    let eventSource: EventSource;
    let isUsingIntegratedMode = true;

    const tryConnect = (url: string, isIntegrated: boolean) => {
      console.log(`[前端SSE] 尝试${isIntegrated ? '集成' : '分离'}模式SSE连接`, {
        url,
        模式: isIntegrated ? '集成模式' : '分离模式'
      });

      const es = new EventSource(url);
      
      es.onmessage = (event) => {
        console.log(`[前端SSE] 收到${isIntegrated ? '集成' : '分离'}模式SSE消息`, {
          原始数据: event.data,
          时间戳: new Date().toISOString(),
          模式: isIntegrated ? '集成模式' : '分离模式'
        });
        
        try {
          const data = JSON.parse(event.data);
          console.log('[前端SSE] 解析后的全局数据', data);
          
          // 检查是否是空对象确认消息
          if (Object.keys(data).length === 0) {
            console.log(`[前端SSE] ✅ 收到${isIntegrated ? '集成' : '分离'}模式SSE连接确认消息`);
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

      es.onopen = (event) => {
        console.log(`[前端SSE] ✅ ${isIntegrated ? '集成' : '分离'}模式SSE连接已打开`, event);
      };

      es.onerror = (error) => {
        console.error(`[前端SSE] ❌ ${isIntegrated ? '集成' : '分离'}模式SSE连接错误`, error);
        
        // 如果集成模式失败，尝试分离模式
        if (isIntegrated && isUsingIntegratedMode) {
          console.log('[前端SSE] 集成模式连接失败，尝试分离模式...');
          es.close();
          isUsingIntegratedMode = false;
          // 延迟重试分离模式
          setTimeout(() => {
            eventSource = tryConnect(separatedUrl, false);
            eventSourceRef.current = eventSource;
          }, 1000);
          return;
        }
        
        if (options.onError) {
          options.onError(error);
        }
      };

      return es;
    };

    // 首先尝试集成模式
    eventSource = tryConnect(integratedUrl, true);
    eventSourceRef.current = eventSource;

    return () => {
      console.log('[前端SSE] 🔌 关闭全局SSE连接');
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  return eventSourceRef.current;
}

// 隧道事件订阅 - 自动适配集成模式和分离模式
export function useTunnelSSE(instanceId: string, options: SSEOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!instanceId) {
      console.log('[前端SSE] instanceId为空，跳过SSE订阅');
      return;
    }

    // 优先尝试集成模式（Next.js API Routes）
    const integratedUrl = buildClientSSEUrl(SSE_ENDPOINTS.tunnel(instanceId));
    // 后备使用分离模式（独立后端服务）
    const separatedUrl = `http://localhost:3001/sse/tunnel/${instanceId}`;

    let eventSource: EventSource;
    let isUsingIntegratedMode = true;

    const tryConnect = (url: string, isIntegrated: boolean) => {
      console.log(`[前端SSE] 尝试${isIntegrated ? '集成' : '分离'}模式隧道SSE连接`, {
        url,
        instanceId,
        模式: isIntegrated ? '集成模式' : '分离模式'
      });

      const es = new EventSource(url);
      
      es.onmessage = (event) => {
        console.log(`[前端SSE] 收到${isIntegrated ? '集成' : '分离'}模式隧道SSE消息`, {
          原始数据: event.data,
          时间戳: new Date().toISOString(),
          instanceId,
          模式: isIntegrated ? '集成模式' : '分离模式'
        });
        
        try {
          const data = JSON.parse(event.data);
          console.log('[前端SSE] 解析后的隧道数据', data);
          
          // 检查是否是空对象确认消息
          if (Object.keys(data).length === 0) {
            console.log(`[前端SSE] ✅ 收到${isIntegrated ? '集成' : '分离'}模式隧道SSE连接确认消息`);
            if (options.onConnected) {
              options.onConnected();
            }
            return;
          }
          
          if (options.onMessage) {
            options.onMessage(data);
          }
        } catch (error) {
          console.error('[前端SSE] ❌ 解析隧道SSE数据失败', error, '原始数据:', event.data);
        }
      };

      es.onopen = (event) => {
        console.log(`[前端SSE] ✅ ${isIntegrated ? '集成' : '分离'}模式隧道SSE连接已打开`, event);
      };

      es.onerror = (error) => {
        console.error(`[前端SSE] ❌ ${isIntegrated ? '集成' : '分离'}模式隧道SSE连接错误`, error);
        
        // 如果集成模式失败，尝试分离模式
        if (isIntegrated && isUsingIntegratedMode) {
          console.log('[前端SSE] 集成模式连接失败，尝试分离模式...');
          es.close();
          isUsingIntegratedMode = false;
          // 延迟重试分离模式
          setTimeout(() => {
            eventSource = tryConnect(separatedUrl, false);
            eventSourceRef.current = eventSource;
          }, 1000);
          return;
        }
        
        if (options.onError) {
          options.onError(error);
        }
      };

      return es;
    };

    // 首先尝试集成模式
    eventSource = tryConnect(integratedUrl, true);
    eventSourceRef.current = eventSource;

    return () => {
      console.log('[前端SSE] 🔌 关闭隧道SSE连接');
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [instanceId]);

  return eventSourceRef.current;
}

// 仪表盘订阅
export function useDashboardSSE(options: SSEOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(buildClientSSEUrl(SSE_ENDPOINTS.dashboard));
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