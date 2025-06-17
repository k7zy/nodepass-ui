import { HttpsProxyAgent } from 'https-proxy-agent';
import https from 'https';
import http from 'http';
import { logger } from '@/lib/server/logger';
import fetch, { RequestInit, Response } from 'node-fetch';
import type { Agent } from 'http';
import dns from 'dns';
import { promisify } from 'util';
import { constants } from 'crypto';
import type { SecureVersion } from 'tls';

const lookup = promisify(dns.lookup);

// 扩展 RequestInit 类型以支持 agent
type ExtendedRequestInit = Omit<RequestInit, 'agent'> & {
  agent?: Agent | ((parsedUrl: URL) => Agent);
};

export interface FetchOptions extends ExtendedRequestInit {
  timeout?: number;
}

// HTTPS Agent 配置类型
interface HttpsAgentOptions extends https.AgentOptions {
  rejectUnauthorized?: boolean;
  secureOptions?: number;
  ciphers?: string;
  minVersion?: SecureVersion;
  maxVersion?: SecureVersion;
  family?: number;
  all?: boolean;
}

/**
 * 支持系统代理的 fetch 函数
 * @param url 请求URL
 * @param options fetch选项
 * @returns Promise<Response>
 */
export async function proxyFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  // 获取系统代理设置
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;

  // 检查是否需要跳过代理
  const shouldUseProxy = (() => {
    if (!httpProxy && !httpsProxy) return false;
    if (!noProxy) return true;
    
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    
    // 检查是否在 NO_PROXY 列表中
    return !noProxy.split(',').some(domain => {
      domain = domain.trim();
      if (!domain) return false;
      // 支持通配符匹配
      if (domain.startsWith('*.') && hostname.endsWith(domain.slice(2))) return true;
      return hostname === domain;
    });
  })();

  if (shouldUseProxy) {
    logger.info(`[Proxy-Fetch] 检测到系统代理配置: HTTP=${httpProxy}, HTTPS=${httpsProxy}`);
  }

  // 创建agent配置
  const agentConfig: HttpsAgentOptions = {
    keepAlive: true,
    timeout: options.timeout || 30000,
    family: 0, // 启用双栈支持
    all: true,
    rejectUnauthorized: false, // 跳过 SSL 证书验证
    secureOptions: constants.SSL_OP_NO_TLSv1_3,
    ciphers: 'ALL',
    minVersion: 'TLSv1.2' as SecureVersion,
    maxVersion: 'TLSv1.2' as SecureVersion
  };

  // 检查是否为HTTPS连接
  const isHttps = url.startsWith('https:');

  // 创建代理 agent
  let agent;
  if (shouldUseProxy) {
    const proxyUrl = isHttps ? httpsProxy : httpProxy;
    if (proxyUrl) {
      agent = new HttpsProxyAgent(proxyUrl);
      logger.info(`[Proxy-Fetch] 使用代理连接: ${proxyUrl}`);
    } else {
      agent = isHttps ? new https.Agent(agentConfig) : new http.Agent(agentConfig);
    }
  } else {
    agent = isHttps ? new https.Agent(agentConfig) : new http.Agent(agentConfig);
  }

  // 解析URL
  const parsedUrl = new URL(url);
  const originalHostname = parsedUrl.hostname.replace(/[\[\]]/g, '');

  try {
    // 强制获取 IPv4 和 IPv6 地址
    const addresses = await Promise.all([
      // 尝试获取 IPv4 地址
      lookup(originalHostname, { family: 4, all: true })
        .catch(() => {
          logger.warn(`[Proxy-Fetch] IPv4 解析失败: ${originalHostname}`);
          return [];
        }),
      // 尝试获取 IPv6 地址
      lookup(originalHostname, { family: 6, all: true })
        .catch(() => {
          logger.warn(`[Proxy-Fetch] IPv6 解析失败: ${originalHostname}`);
          return [];
        })
    ]);

    // 合并地址，优先使用 IPv4
    const sortedAddresses = [
      ...(addresses[0] || []), // IPv4 地址优先
      ...(addresses[1] || [])  // IPv6 地址作为备选
    ];

    if (sortedAddresses.length === 0) {
      logger.warn(`[Proxy-Fetch] 无法解析任何IP地址: ${originalHostname}`);
      // 如果DNS解析失败，尝试使用原始地址
      return await fetch(url, {
        ...options,
        agent,
        signal: options.signal as any
      });
    }

    logger.info(`[Proxy-Fetch] DNS解析结果: ${JSON.stringify(sortedAddresses.map(addr => ({
      type: addr.family === 4 ? 'IPv4' : 'IPv6',
      address: addr.address
    })))}`);

    let lastError;
    // 依次尝试每个地址
    for (const addr of sortedAddresses) {
      try {
        // 更新URL中的主机名，确保正确处理IPv6地址和端口
        const port = parsedUrl.port;
        if (addr.family === 6) {
          // 移除可能已存在的方括号
          const cleanAddr = addr.address.replace(/[\[\]]/g, '');
          parsedUrl.hostname = `[${cleanAddr}]`;
          // 如果有端口，确保端口在方括号外面
          if (port) {
            parsedUrl.port = port;
          }
        } else {
          parsedUrl.hostname = addr.address;
          if (port) {
            parsedUrl.port = port;
          }
        }
        
        const currentUrl = parsedUrl.toString();
        logger.info(`[Proxy-Fetch] 尝试连接到 ${addr.family === 4 ? 'IPv4' : 'IPv6'} 地址: ${currentUrl}`);

        // 设置超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

        try {
          const fetchOptions = {
            ...options,
            agent,
            signal: controller.signal as any,
            // 添加自签名证书支持
            ...(isHttps && {
              agent: new https.Agent({
                rejectUnauthorized: false
              })
            })
          };

          const response = await fetch(currentUrl, fetchOptions);
          clearTimeout(timeoutId);
          return response;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      } catch (error) {
        lastError = error;
        logger.warn(`[Proxy-Fetch] ${addr.family === 6 ? 'IPv6' : 'IPv4'} 连接失败:`, error);
        continue; // 尝试下一个地址
      }
    }

    // 如果所有地址都失败了，尝试直连原始URL
    logger.warn('[Proxy-Fetch] 所有IP地址连接失败，尝试直连原始URL');
    const fallbackOptions = {
      ...options,
      agent,
      signal: options.signal as any,
      // 添加自签名证书支持
      ...(isHttps && {
        agent: new https.Agent({
          rejectUnauthorized: false
        })
      })
    };
    return await fetch(url, fallbackOptions);

  } catch (error) {
    // 如果DNS解析失败或其他错误，尝试直连
    logger.error('[Proxy-Fetch] 请求失败:', error);
    
    if (shouldUseProxy && error instanceof Error && 
       (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT') || error.message.includes('ENETUNREACH'))) {
      logger.info(`[Proxy-Fetch] 代理连接失败，尝试直连`);
      agent = isHttps ? new https.Agent({
        rejectUnauthorized: false
      }) : new http.Agent(agentConfig);
      
      const directOptions = {
        ...options,
        agent,
        signal: options.signal as any
      };
      return await fetch(url, directOptions);
    }
    
    throw error;
  }
} 