import { AgentOptions } from 'http';
import { SecureContextOptions, SecureVersion } from 'tls';

// 扩展的Agent选项接口
export interface ExtendedAgentOptions extends AgentOptions {
  family?: number;
  all?: boolean;
  timeout?: number;
  keepAlive?: boolean;
  rejectUnauthorized?: boolean;
  secureOptions?: number;
  ciphers?: string;
  minVersion?: SecureVersion;
  maxVersion?: SecureVersion;
}

// SSL配置选项接口
export interface SSLOptions {
  rejectUnauthorized: boolean;
  secureOptions?: number;
  ciphers?: string;
  minVersion?: SecureVersion;
  maxVersion?: SecureVersion;
}

// 网络连接配置接口
export interface NetworkConfig {
  timeout: number;
  family: number;
  all: boolean;
  keepAlive: boolean;
  ssl?: SSLOptions;
}

export interface NetworkOptions {
  /**
   * IP协议族
   * 0: 自动 (IPv4 + IPv6)
   * 4: 仅IPv4
   * 6: 仅IPv6
   */
  family: 0 | 4 | 6;
  
  /**
   * 是否返回所有可用地址
   */
  all: boolean;
  
  /**
   * 连接超时时间(毫秒)
   */
  timeout: number;
  
  /**
   * 重试次数
   */
  retries: number;
}

export interface SSEConfig {
  /**
   * 服务器主机地址
   */
  host: string;
  
  /**
   * 服务器端口
   */
  port: number;
  
  /**
   * API路径
   */
  path?: string;
  
  /**
   * 协议类型
   */
  protocol?: 'http' | 'https';
  
  /**
   * 网络选项
   */
  networkOptions?: Partial<NetworkOptions>;
} 