export interface CustomEventSourceInit {
  withCredentials?: boolean;
  headers?: Record<string, string>;
}

export class CustomEventSource {
  private xhr!: XMLHttpRequest;
  private url: string;
  private options: CustomEventSourceInit;
  private eventListeners: { [key: string]: ((event: MessageEvent) => void)[] } = {};
  private readyState: number = 0;
  private retry: number = 3000;

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  constructor(url: string, options: CustomEventSourceInit = {}) {
    this.url = url;
    this.options = options;
    this.connect();
  }

  private connect() {
    this.xhr = new XMLHttpRequest();
    this.xhr.open('GET', this.url, true);
    this.xhr.withCredentials = this.options.withCredentials || false;

    // 设置自定义请求头
    if (this.options.headers) {
      Object.entries(this.options.headers).forEach(([key, value]) => {
        this.xhr.setRequestHeader(key, value);
      });
    }

    this.xhr.setRequestHeader('Accept', 'text/event-stream');
    let data = '';

    this.xhr.onreadystatechange = () => {
      if (this.xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        if (this.xhr.status === 200) {
          this.readyState = CustomEventSource.OPEN;
          this.dispatchEvent(new Event('open'));
        } else {
          this.readyState = CustomEventSource.CLOSED;
          this.dispatchEvent(new Event('error'));
          return;
        }
      }

      if (this.xhr.readyState === XMLHttpRequest.LOADING) {
        // 获取新数据
        const newData = this.xhr.responseText.substr(data.length);
        data = this.xhr.responseText;

        // 处理新数据
        this.processChunk(newData);
      }

      if (this.xhr.readyState === XMLHttpRequest.DONE) {
        this.readyState = CustomEventSource.CLOSED;
        this.dispatchEvent(new Event('error'));
      }
    };

    this.xhr.onerror = () => {
      this.readyState = CustomEventSource.CLOSED;
      this.dispatchEvent(new Event('error'));
    };

    this.xhr.send();
  }

  private processChunk(chunk: string) {
    const lines = chunk.split('\n');
    let eventName = 'message';
    let data: string[] = [];

    lines.forEach(line => {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data.push(line.slice(5).trim());
      } else if (line.startsWith('retry:')) {
        this.retry = parseInt(line.slice(6).trim(), 10);
      } else if (line === '') {
        if (data.length) {
          const event = new MessageEvent(eventName, {
            data: data.join('\n'),
            origin: window.location.origin
          });
          this.dispatchEvent(event);
          data = [];
          eventName = 'message';
        }
      }
    });
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (!this.eventListeners[type]) {
      this.eventListeners[type] = [];
    }
    this.eventListeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (this.eventListeners[type]) {
      this.eventListeners[type] = this.eventListeners[type].filter(l => l !== listener);
    }
  }

  dispatchEvent(event: Event): boolean {
    if (event instanceof MessageEvent && this.eventListeners[event.type]) {
      this.eventListeners[event.type].forEach(listener => listener(event));
    } else if (event instanceof Event) {
      const listeners = this.eventListeners[event.type] || [];
      listeners.forEach(listener => listener(new MessageEvent(event.type)));
    }
    return true;
  }

  close(): void {
    if (this.readyState !== CustomEventSource.CLOSED) {
      this.xhr.abort();
      this.readyState = CustomEventSource.CLOSED;
    }
  }

  get CONNECTING() { return CustomEventSource.CONNECTING; }
  get OPEN() { return CustomEventSource.OPEN; }
  get CLOSED() { return CustomEventSource.CLOSED; }

  set onmessage(handler: ((event: MessageEvent) => void) | null) {
    this.eventListeners['message'] = handler ? [handler] : [];
  }

  set onerror(handler: ((event: Event) => void) | null) {
    this.eventListeners['error'] = handler ? [handler as (event: MessageEvent) => void] : [];
  }

  set onopen(handler: ((event: Event) => void) | null) {
    this.eventListeners['open'] = handler ? [handler as (event: MessageEvent) => void] : [];
  }
} 