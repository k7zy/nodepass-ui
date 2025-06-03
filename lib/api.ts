import { CustomEventSource } from './sse';

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
  private apiKey: string;
  private apiHost: string;
  private apiPrefix: string;
  private abortController: AbortController | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly BASE_RECONNECT_DELAY = 1000; // 基础重连延迟（1秒）
  private isConnected = false;
  private callbacks: {
    onInitial?: (instance: Instance) => void;
    onCreate?: (instance: Instance) => void;
    onUpdate?: (instance: Instance) => void;
    onDelete?: (instanceId: string) => void;
    onLog?: (instanceId: string, logs: string) => void;
    onShutdown?: () => void;
    onError?: (error: Event) => void;
  } = {};

  constructor(apiKey: string, apiHost?: string, apiPrefix?: string) {
    this.apiKey = apiKey;
    this.apiHost = apiHost || process.env.NEXT_PUBLIC_API_HOST || 'http://localhost:8080';
    this.apiPrefix = apiPrefix || process.env.NEXT_PUBLIC_API_PREFIX || '';
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
  }

  private getBaseURL(): string {
    return `${this.apiHost}${this.apiPrefix}`;
  }

  // 测试连接（不使用重试机制）
  async testConnection(timeout: number = 10000): Promise<void> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeout);

    try {
      const response = await fetch(`${this.getBaseURL()}/v1/events`, {
        headers: this.getHeaders(),
        signal: abortController.signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || response.statusText);
      }

      // 如果响应成功，说明连接正常
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('连接超时，请检查 URL 地址是否正确');
        } else if (error.message.includes('Failed to fetch')) {
          throw new Error('网络连接失败，请检查网络是否正常');
        } else {
          throw error;
        }
      }
      throw new Error('连接失败，请检查配置是否正确');
    }
  }

  // 获取所有实例
  async getInstances(): Promise<Instance[]> {
    const response = await fetch(`${this.getBaseURL()}/v1/instances`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || response.statusText);
    }

    return response.json();
  }

  // 创建新实例
  async createInstance(data: CreateInstanceRequest): Promise<Instance> {
    const response = await fetch(`${this.getBaseURL()}/v1/instances`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || response.statusText);
    }

    return response.json();
  }

  // 获取特定实例
  async getInstance(id: string): Promise<Instance> {
    const response = await fetch(`${this.getBaseURL()}/v1/instances/${id}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || response.statusText);
    }

    return response.json();
  }

  // 更新实例
  async updateInstance(id: string, data: UpdateInstanceRequest): Promise<Instance> {
    const response = await fetch(`${this.getBaseURL()}/v1/instances/${id}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || response.statusText);
    }

    return response.json();
  }

  // 删除实例
  async deleteInstance(id: string): Promise<void> {
    const response = await fetch(`${this.getBaseURL()}/v1/instances/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
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
    this.callbacks = callbacks;
    this.connect();

    // 返回取消订阅函数
    return () => {
      this.cleanupEventSource();
      this.callbacks = {};
      this.reconnectAttempts = 0;
      this.isConnected = false;
    };
  }

  private async connect() {
    // 清理现有连接
    this.cleanupEventSource();

    try {
      // 创建新的 AbortController
      this.abortController = new AbortController();

      // 使用 fetch API 建立 SSE 连接
      const response = await fetch(`${this.getBaseURL()}/v1/events`, {
        headers: this.getHeaders(),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || response.statusText);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // 标记连接成功
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('SSE连接成功');

      // 创建 reader
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // 读取数据流
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        // 解码并处理数据
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // 保留最后一行（可能不完整）
        buffer = lines.pop() || '';

        // 处理完整的行
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              this.handleEvent(data);
            } catch (error) {
              console.error('解析SSE事件数据失败:', error);
            }
          }
        }
      }

    } catch (error) {
      this.isConnected = false;
      console.error('SSE连接错误:', error);

      if (this.isConnected) {
        // 如果之前连接成功，说明是连接中断
        this.handleConnectionError(new Event('error'));
      } else {
        // 首次连接失败，可能是配置错误
        await this.handleInitialConnectionError(new Event('error'));
      }
    }
  }

  private async handleInitialConnectionError(error: Event) {
    // 尝试发送一个普通请求来获取具体错误信息
    try {
      const response = await fetch(`${this.getBaseURL()}/v1/events`, {
        headers: this.getHeaders()
      });
      const errorData = await response.json();
      this.callbacks.onError?.(new ErrorEvent('error', {
        error: new Error(errorData.error || errorData.message || response.statusText),
        message: errorData.error || errorData.message || response.statusText
      }));
    } catch (fetchError) {
      // 如果是网络错误，返回网络错误信息
      if (fetchError instanceof TypeError && fetchError.message.includes('Failed to fetch')) {
        this.callbacks.onError?.(new ErrorEvent('error', {
          error: new Error('网络连接失败，请检查网络是否正常'),
          message: '网络连接失败，请检查网络是否正常'
        }));
      } else {
        this.callbacks.onError?.(error);
      }
    }
    this.cleanupEventSource();
  }

  private handleConnectionError(error: Event) {
    this.isConnected = false;
    this.cleanupEventSource();

    // 检查是否超过最大重试次数
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.log('SSE连接失败，已达到最大重试次数');
      this.callbacks.onError?.(new ErrorEvent('error', {
        error: new Error(`连接失败，已达到最大重试次数 (${this.MAX_RECONNECT_ATTEMPTS})`),
        message: `连接失败，已达到最大重试次数 (${this.MAX_RECONNECT_ATTEMPTS})`
      }));
      return;
    }

    // 使用指数退避算法计算下次重试延迟
    const delay = Math.min(
      this.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      30000 // 最大延迟30秒
    );

    console.log(`将在 ${delay/1000} 秒后进行第 ${this.reconnectAttempts + 1}/${this.MAX_RECONNECT_ATTEMPTS} 次重试`);

    // 设置重连定时器
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private handleEvent(data: SSEEvent) {
    switch (data.type) {
      case 'initial':
        if (data.instance && this.callbacks.onInitial) {
          this.callbacks.onInitial(data.instance);
        }
        break;
      case 'create':
        if (data.instance && this.callbacks.onCreate) {
          this.callbacks.onCreate(data.instance);
        }
        break;
      case 'update':
        if (data.instance && this.callbacks.onUpdate) {
          this.callbacks.onUpdate(data.instance);
        }
        break;
      case 'delete':
        if (data.instance && this.callbacks.onDelete) {
          this.callbacks.onDelete(data.instance.id);
        }
        break;
      case 'log':
        if (data.instance && data.logs && this.callbacks.onLog) {
          this.callbacks.onLog(data.instance.id, data.logs);
        }
        break;
      case 'shutdown':
        if (this.callbacks.onShutdown) {
          this.callbacks.onShutdown();
        }
        this.cleanupEventSource();
        break;
    }
  }

  private cleanupEventSource() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.isConnected = false;
  }
} 