import https from 'https';
import fetch, { Response as NodeFetchResponse } from 'node-fetch';

/**
 * 创建支持SSL自签名证书的fetch配置
 * @param url - 请求的URL
 * @param options - 原始的fetch选项
 * @returns 支持SSL自签名证书的fetch选项
 */
export function createSSLCompatibleFetchOptions(url: string, options: RequestInit = {}): RequestInit {
  const isHttps = url.startsWith('https:');
  
  if (isHttps) {
    // 创建自定义的 HTTPS agent 来跳过 SSL 验证
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false, // 跳过 SSL 证书验证
      keepAlive: true,
      timeout: 30000 // 30秒超时
    });
    
    return {
      ...options,
      // @ts-ignore - Node.js fetch支持agent选项
      agent: httpsAgent
    };
  }
  
  return options;
}

/**
 * 执行支持SSL自签名证书的fetch请求
 * @param url - 请求的URL
 * @param options - fetch选项
 * @returns fetch响应
 */
export async function fetchWithSSLSupport(url: string, options: RequestInit = {}): Promise<NodeFetchResponse> {
  const compatibleOptions = createSSLCompatibleFetchOptions(url, options);
  // 使用 node-fetch 替代全局 fetch
  return fetch(url, compatibleOptions as any);
} 