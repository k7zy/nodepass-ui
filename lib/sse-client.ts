import { SSEEvent } from '../types/nodepass';

export class SSEClient {
  private apiKey: string;
  private baseUrl: string;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private decoder: TextDecoder;
  private buffer: string = '';
  private isConnected: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private readonly RECONNECT_DELAY = 5000;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.decoder = new TextDecoder();
  }

  async connect(callbacks: {
    onMessage?: (event: SSEEvent) => void;
    onError?: (error: Error) => void;
    onClose?: () => void;
  }): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/events`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('响应体为空');
      }

      this.isConnected = true;
      this.reader = response.body.getReader();
      this.processStream(callbacks);
    } catch (error) {
      this.handleError(error as Error, callbacks);
    }
  }

  private async processStream(callbacks: {
    onMessage?: (event: SSEEvent) => void;
    onError?: (error: Error) => void;
    onClose?: () => void;
  }): Promise<void> {
    if (!this.reader) return;

    try {
      while (this.isConnected) {
        const { value, done } = await this.reader.read();

        if (done) {
          this.isConnected = false;
          if (callbacks.onClose) {
            callbacks.onClose();
          }
          this.scheduleReconnect(callbacks);
          return;
        }

        this.buffer += this.decoder.decode(value, { stream: true });
        const lines = this.buffer.split('\n\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;

          const eventMatch = line.match(/^event: (.+)$/m);
          const dataMatch = line.match(/^data: (.+)$/m);

          if (eventMatch && dataMatch) {
            try {
              const data = JSON.parse(dataMatch[1]) as SSEEvent;
              if (callbacks.onMessage) {
                callbacks.onMessage(data);
              }
            } catch (error) {
              console.error('解析SSE事件数据失败:', error);
            }
          }
        }
      }
    } catch (error) {
      this.handleError(error as Error, callbacks);
    }
  }

  private handleError(error: Error, callbacks: {
    onError?: (error: Error) => void;
  }): void {
    console.error('SSE连接错误:', error);
    this.isConnected = false;
    if (callbacks.onError) {
      callbacks.onError(error);
    }
    this.scheduleReconnect(callbacks);
  }

  private scheduleReconnect(callbacks: {
    onMessage?: (event: SSEEvent) => void;
    onError?: (error: Error) => void;
    onClose?: () => void;
  }): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.connect(callbacks);
    }, this.RECONNECT_DELAY);
  }

  disconnect(): void {
    this.isConnected = false;
    if (this.reader) {
      this.reader.cancel();
      this.reader = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
} 