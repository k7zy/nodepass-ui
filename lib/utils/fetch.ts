import https from 'https';
import http from 'http';
import fetch, { RequestInit as NodeFetchRequestInit, Response as NodeFetchResponse } from 'node-fetch';
import { ExtendedAgentOptions } from '../types/network';
import dns from 'dns';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

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
 * 格式化 URL，处理 IPv6 地址
 * @param url 原始URL
 * @returns 格式化后的URL
 */
function formatUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    // 如果是IPv6地址，确保使用方括号
    if (parsedUrl.hostname.includes(':')) {
      parsedUrl.hostname = `[${parsedUrl.hostname.replace(/[\[\]]/g, '')}]`;
    }
    return parsedUrl.toString();
  } catch (error) {
    console.warn('URL格式化失败:', error);
    return url;
  }
}

/**
 * 支持SSL和双栈IP的fetch函数
 */
export async function fetchWithSSLSupport(
  url: string,
  options: NodeFetchRequestInit & { timeout?: number } = {}
): Promise<NodeFetchResponse> {
  // 配置双栈支持的agent选项
  const agentConfig: ExtendedAgentOptions = {
    keepAlive: true,
    timeout: options.timeout || 30000,
    family: 0,        // 启用双栈支持
    all: true,        // 返回所有可用地址
    rejectUnauthorized: false // 跳过SSL证书验证
  };

  // 解析URL
  const parsedUrl = new URL(url);
  const isHttps = url.startsWith('https:');
  
  // 配置DNS查找选项
  const dnsOptions = {
    family: 0,  // 0: IPv4 和 IPv6, 4: 仅IPv4, 6: 仅IPv6
    all: true,  // 返回所有地址
    verbatim: true // 保持地址格式不变
  };

  try {
    // 尝试解析主机名
    const addresses = await lookup(parsedUrl.hostname, dnsOptions);
    console.debug('DNS解析结果:', addresses);

    // 根据协议创建对应的agent，并添加DNS解析结果
    const agent = isHttps 
      ? new https.Agent({
          ...agentConfig,
          lookup: (hostname, options, callback) => {
            // 使用已解析的地址
            if (Array.isArray(addresses)) {
              // 如果返回多个地址，使用第一个
              callback(null, addresses[0].address, addresses[0].family);
            } else {
              // 单个地址的情况
              callback(null, addresses.address, addresses.family);
            }
          }
        })
      : new http.Agent({
          ...agentConfig,
          lookup: (hostname, options, callback) => {
            if (Array.isArray(addresses)) {
              callback(null, addresses[0].address, addresses[0].family);
            } else {
              callback(null, addresses.address, addresses.family);
            }
          }
        });

    // 格式化URL，处理IPv6地址
    const formattedUrl = formatUrl(url);

    // 合并选项
    const fetchOptions: NodeFetchRequestInit = {
      ...options,
      agent: agent as any,
      // 如果没有设置超时，默认30秒
      ...(options.timeout ? { timeout: options.timeout } : { timeout: 30000 })
    };

    const response = await fetch(formattedUrl, fetchOptions);
    return response;
  } catch (error: any) {
    console.error('请求失败:', error);
    // 如果DNS解析失败，尝试直接使用原始URL
    if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      console.warn('DNS解析失败，尝试直接连接...');
      const basicAgent = isHttps 
        ? new https.Agent(agentConfig)
        : new http.Agent(agentConfig);

      const basicOptions: NodeFetchRequestInit = {
        ...options,
        agent: basicAgent as any,
        ...(options.timeout ? { timeout: options.timeout } : { timeout: 30000 })
      };

      return fetch(formatUrl(url), basicOptions);
    }
    throw error;
  }
} 