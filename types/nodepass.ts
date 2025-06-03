// NodePass 实例类型定义
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

// 创建实例请求
export interface CreateInstanceRequest {
  url: string;
}

// 更新实例请求
export interface UpdateInstanceRequest {
  action: 'start' | 'stop' | 'restart';
}

// SSE 事件类型
export interface SSEEvent {
  type: 'initial' | 'create' | 'update' | 'delete' | 'log' | 'shutdown';
  instance?: Instance;
  logs?: string;
}

// 流量统计历史记录
export interface TrafficHistory {
  timestamps: number[];
  tcp_in_rates: number[];
  tcp_out_rates: number[];
  udp_in_rates: number[];
  udp_out_rates: number[];
}

// 流量统计
export interface TrafficStats {
  timestamp: number;
  tcp_in: number;
  tcp_out: number;
  udp_in: number;
  udp_out: number;
}

// 实例配置
export interface InstanceConfig {
  id: string;
  originalConfig: {
    port: number;
    target: string;
    tls: boolean;
  };
  url: string;
} 