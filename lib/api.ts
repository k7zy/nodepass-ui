import { buildApiUrl } from './utils';

// API 类型定义
export interface Instance {
  id: string;
  type: 'client';
  status: 'running' | 'stopped' | 'error';
  url: string;
  tcprx: number;
  tcptx: number;
  udprx: number;
  udptx: number;
}

export interface CreateInstanceRequest {
  url: string;
}

export interface UpdateInstanceRequest {
  action: 'start' | 'stop' | 'restart';
}

// SSE 事件类型定义
export interface SSEEvent {
  type: 'initial' | 'create' | 'update' | 'delete' | 'log' | 'shutdown';
  instance?: Instance;
  logs?: string;
}

// API 客户端类
export class NodePassAPI {
  private endpointId: string;

  constructor(endpointId: string) {
    this.endpointId = endpointId;
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
    };
  }

  // 测试连接
  async testConnection(): Promise<void> {
    const response = await fetch(buildApiUrl(`/api/endpoints/${this.endpointId}/test`), {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || response.statusText);
    }
  }

  // 获取所有实例
  async getInstances(): Promise<Instance[]> {
    const response = await fetch(buildApiUrl(`/api/endpoints/${this.endpointId}/instances`), {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || response.statusText);
    }

    return response.json();
  }

  // 创建新实例
  async createInstance(data: CreateInstanceRequest): Promise<Instance> {
    const response = await fetch(buildApiUrl(`/api/endpoints/${this.endpointId}/instances`), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || response.statusText);
    }

    return response.json();
  }

  // 获取特定实例
  async getInstance(id: string): Promise<Instance> {
    const response = await fetch(buildApiUrl(`/api/endpoints/${this.endpointId}/instances/${id}`), {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || response.statusText);
    }

    return response.json();
  }

  // 更新实例
  async updateInstance(id: string, data: UpdateInstanceRequest): Promise<Instance> {
    const response = await fetch(buildApiUrl(`/api/endpoints/${this.endpointId}/instances/${id}`), {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || response.statusText);
    }

    return response.json();
  }

  // 删除实例
  async deleteInstance(id: string): Promise<void> {
    const response = await fetch(buildApiUrl(`/api/endpoints/${this.endpointId}/instances/${id}`), {
      method: 'DELETE',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || response.statusText);
    }
  }

  // 订阅事件
  subscribeToEvents(callbacks: {
    onInitial?: (instance: Instance) => void;
    onCreate?: (instance: Instance) => void;
    onUpdate?: (instance: Instance) => void;
    onDelete?: (instanceId: string) => void;
    onLog?: (instanceId: string, logs: string) => void;
    onShutdown?: () => void;
    onError?: (error: Event) => void;
  }): () => void {
    const eventSource = new EventSource(buildApiUrl(`/api/endpoints/${this.endpointId}/events`));

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent;
        switch (data.type) {
          case 'initial':
            if (data.instance && callbacks.onInitial) {
              callbacks.onInitial(data.instance);
            }
            break;
          case 'create':
            if (data.instance && callbacks.onCreate) {
              callbacks.onCreate(data.instance);
            }
            break;
          case 'update':
            if (data.instance && callbacks.onUpdate) {
              callbacks.onUpdate(data.instance);
            }
            break;
          case 'delete':
            if (data.instance && callbacks.onDelete) {
              callbacks.onDelete(data.instance.id);
            }
            break;
          case 'log':
            if (data.instance && data.logs && callbacks.onLog) {
              callbacks.onLog(data.instance.id, data.logs);
            }
            break;
          case 'shutdown':
            if (callbacks.onShutdown) {
              callbacks.onShutdown();
            }
            eventSource.close();
            break;
        }
      } catch (error) {
        console.error('解析 SSE 消息失败:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE 连接错误:', error);
      callbacks.onError?.(error);
    };

    // 返回取消订阅函数
    return () => {
      eventSource.close();
    };
  }
} 