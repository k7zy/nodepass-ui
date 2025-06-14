import { prisma } from '@/lib/prisma';
import { EventEmitter } from 'events';
import { logger } from './logger';
import { proxyFetch } from '@/lib/utils/proxy-fetch';
import https from 'https';
import http from 'http';
import {
  EndpointStatus,
  EndpointStatusType,
  SSEConnection
} from '@/lib/types';
import { SSEEventType, TunnelStatus } from '@prisma/client';
import { getGlobalSSEManager } from './global-sse';
import { initializeSystem, cleanupExpiredSessions } from './auth-service';
import { Prisma } from '@prisma/client';
import { ExtendedAgentOptions } from '../types/network';
import dns from 'dns';
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * SSE服务 - 监听NodePass端点并转发给前端
 */
export class SSEService {
  private static instance: SSEService;
  private connections: Map<string, SSEConnection>;
  private eventEmitter: EventEmitter;
  private isInitialized: boolean;
  private healthCheckInterval: NodeJS.Timeout | null;
  private sseManager = getGlobalSSEManager(); // 使用全局SSE管理器
  
  private constructor() {
    this.connections = new Map();
    this.eventEmitter = new EventEmitter();
    this.isInitialized = false;
    this.healthCheckInterval = null;
    
    // 设置最大监听器数量
    this.eventEmitter.setMaxListeners(100);
    
    logger.info('[SSE-Service] SSE服务实例已创建');
    logger.info('[SSE-Service] 使用全局SSE管理器实例:', this.sseManager.getStats().instanceId);
  }
  
  public static getInstance(): SSEService {
    if (!SSEService.instance) {
      SSEService.instance = new SSEService();
    }
    return SSEService.instance;
  }
  
  /**
   * 初始化SSE服务
   */
  public async initialize() {
    if (this.isInitialized) return;
    
    try {
      logger.info('[SSE-Service] 开始初始化 SSE 服务...');

      // 🚀 系统初始化
      logger.info('[SSE-Service] 检查系统初始化状态...');
      await initializeSystem();
      
      // 清理过期会话
      await cleanupExpiredSessions();
      logger.info('[SSE-Service] 过期会话清理完成');

      // 获取指定状态的端点
      const endpoints = await prisma.endpoint.findMany({
        where: {
          status: {
            in: [EndpointStatus.ONLINE, EndpointStatus.OFFLINE]
          }
        }
      });
      
      logger.info('[SSE-Service] 需要重启的端点数量:', endpoints.length);
      
      // 异步为每个端点建立连接，不等待连接结果
      const connectionPromises = endpoints.map(endpoint => {
        // 创建新的连接对象，确保初始化时重置手动断开标记
        const connection: SSEConnection = {
          url: endpoint.url,
          apiPath: endpoint.apiPath,
          apiKey: endpoint.apiKey,
          controller: null,
          retryCount: 0,
          maxRetries: 3,
          lastError: null,
          reconnectTimeout: null,
          lastEventTime: Date.now(),
          isHealthy: true,
          manuallyDisconnected: false // 确保初始化时重置手动断开标记
        };
        
        // 存储连接对象
        this.connections.set(endpoint.id.toString(), connection);
        
        // 尝试连接
        return this.connectEndpoint(endpoint.id, false).catch(error => {
          logger.warn(`[SSE-Service] 端点 ${endpoint.id} (${endpoint.name}) 初始化连接失败，将进入重试机制`, error);
          // 不抛出错误，让其他端点继续连接
        });
      });
      
      // 标记服务已初始化（不等待所有连接完成）
      this.isInitialized = true;
      
      // 启动定时健康检查
      this.startHealthCheck();
      
      logger.info('[SSE-Service] SSE 服务初始化完成，端点连接正在异步进行');
      
    } catch (error) {
      logger.error('[SSE-Service] SSE 服务初始化失败', error);
      throw error;
    }
  }

  /**
   * 连接到指定端点
   */
  async connectEndpoint(endpointId: number, throwOnError: boolean = true) {
    const endpoint = await prisma.endpoint.findUnique({
      where: { id: endpointId }
    });
    
    if (!endpoint) {
      const error = new Error('端点不存在');
      if (throwOnError) throw error;
      logger.error(`[SSE-Service] 连接端点 ${endpointId} 失败: 端点不存在`);
      return;
    }
    
    // 如果已存在连接，先断开
    if (this.connections.has(endpointId.toString())) {
      await this.disconnectEndpoint(endpointId);
    }
    
    // 获取或创建连接对象
    let connection = this.connections.get(endpointId.toString());
    if (!connection) {
      connection = {
        url: endpoint.url,
        apiPath: endpoint.apiPath,
        apiKey: endpoint.apiKey,
        controller: null,
        retryCount: 0,
        maxRetries: 3,
        lastError: null,
        reconnectTimeout: null,
        lastEventTime: Date.now(),
        isHealthy: true,
        manuallyDisconnected: false
      };
    }

    // 重置手动断开标记
    connection.manuallyDisconnected = false;

    try {
      // 建立 SSE 连接
      await this.establishConnection(endpointId, connection);
      
      // 连接成功，重置重试计数
      connection.retryCount = 0;
      connection.isHealthy = true;
      connection.lastError = null;
      
      // 存储连接信息
      this.connections.set(endpointId.toString(), connection);
      
      // 更新端点状态
      await prisma.endpoint.update({
        where: { id: endpointId },
        data: { 
          status: EndpointStatus.ONLINE,
          lastCheck: new Date()
        }
      });
      
      logger.info(`[SSE-Service] 端点 ${endpointId} SSE 连接建立成功`);
      
    } catch (error) {
      logger.error(`[SSE-Service] 连接端点 ${endpointId} 失败`, error);
      
      // 记录错误信息
      connection.lastError = error instanceof Error ? error.message : String(error);
      connection.isHealthy = false;
      // 存储连接信息
      this.connections.set(endpointId.toString(), connection);      
      // 只有在不是手动断开的情况下才触发重连
      if (!connection.manuallyDisconnected) {
        this.triggerReconnect(endpointId, connection);
      }
      
      if (throwOnError) throw error;
    }
  }

  /**
   * 断开端点连接
   */
  private async disconnectEndpoint(endpointId: number) {
    const connection = this.connections.get(endpointId.toString());
    if (!connection) return;
    
    if (connection.controller) {
      connection.controller.abort();
    }
    
    if (connection.reconnectTimeout) {
      clearTimeout(connection.reconnectTimeout);
    }
    
    this.connections.delete(endpointId.toString());
    
    try {
      // 先检查端点是否存在
      const endpoint = await prisma.endpoint.findUnique({
        where: { id: endpointId }
      });

      // 只有当端点存在时才更新状态
      if (endpoint) {
        await prisma.endpoint.update({
          where: { id: endpointId },
          data: { 
            status: EndpointStatus.OFFLINE,
            lastCheck: new Date()
          }
        });
        logger.info(`[SSE-Service] 端点 ${endpointId} 状态已更新为离线`);
      } else {
        logger.info(`[SSE-Service] 端点 ${endpointId} 已不存在，跳过状态更新`);
      }
    } catch (error) {
      logger.error(`[SSE-Service] 更新端点 ${endpointId} 状态失败:`, error);
    }
    
    logger.info(`[SSE-Service] 端点 ${endpointId} 已断开连接`);
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // 每30秒检查一次
    
    logger.info('[SSE-Service] SSE 服务健康检查已启动');
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck() {
    const now = Date.now();
    const timeout = 60000; // 60秒超时
    
    try {
      // 获取所有有效的端点
      const validEndpoints = await prisma.endpoint.findMany({
        select: {
          id: true,
          status: true
        }
      });
      
      // 创建有效端点ID的集合
      const validEndpointIds = new Set(validEndpoints.map(e => e.id.toString()));
      
      // 检查并清理无效的连接
      for (const [endpointId, connection] of this.connections.entries()) {
        // 如果端点已被删除，移除连接
        if (!validEndpointIds.has(endpointId)) {
          logger.info(`[SSE-Service] 端点 ${endpointId} 已被删除，移除健康检查`);
          await this.disconnectEndpoint(parseInt(endpointId));
          continue;
        }

        // 如果是手动断开的连接，移除连接
        if (connection.manuallyDisconnected) {
          logger.info(`[SSE-Service] 端点 ${endpointId} 已手动断开，移除健康检查`);
          await this.disconnectEndpoint(parseInt(endpointId));
          continue;
        }

        // 检查连接是否超时
        if (now - connection.lastEventTime > timeout) {
          // 检查连接是否仍然有效
          try {
            const isConnected = await this.checkEndpointConnection(parseInt(endpointId), connection);
            if (!isConnected) {
              logger.warn(`[SSE-Service] 端点 ${endpointId} 健康检查失败，连接可能已断开`);
              connection.isHealthy = false;
              
              // 如果连接仍然存在但不健康，尝试重连
              if (!connection.controller?.signal.aborted) {
                logger.info(`[SSE-Service] 尝试重连不健康的端点 ${endpointId}`);
                this.triggerReconnect(parseInt(endpointId), connection);
              }
            } else {
              // 如果连接检查成功，更新最后事件时间
              connection.lastEventTime = now;
              connection.isHealthy = true;
              logger.debug(`[SSE-Service] 端点 ${endpointId} 健康检查成功`);
            }
          } catch (error) {
            logger.error(`[SSE-Service] 端点 ${endpointId} 健康检查出错:`, error);
            connection.isHealthy = false;
          }
        }
      }
    } catch (error) {
      logger.error('[SSE-Service] 执行健康检查时出错:', error);
    }
  }

  /**
   * 检查端点连接是否有效
   * 使用轻量级的 HEAD 请求检查连接，而不是建立新的 SSE 连接
   */
  private async checkEndpointConnection(endpointId: number, connection: SSEConnection): Promise<boolean> {
    try {
      const { url, apiPath, apiKey } = connection;
      // 使用API根路径进行检查，而不是SSE端点
      const checkUrl = `${url}${apiPath}`;
      
      // 创建自定义的 HTTPS agent 来跳过 SSL 验证
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true,
        timeout: 5000 // 5秒超时
      });

      const isHttps = checkUrl.startsWith('https:');
      
      // 创建控制器用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await proxyFetch(checkUrl, {
        method: 'HEAD', // 使用HEAD请求，只检查连接性
        headers: {
          'X-API-Key': apiKey
        },
        agent: isHttps ? httpsAgent : undefined,
        signal: controller.signal as any
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      logger.error(`[SSE-Service] 检查端点 ${endpointId} 连接状态失败:`, error);
      return false;
    }
  }

  /**
   * 移除端点
   */
  async removeEndpoint(endpointId: number): Promise<void> {
    logger.info(`[SSE-Service] 开始移除端点 ${endpointId} 连接（删除端点操作）`);
    await this.disconnectEndpoint(endpointId);
    logger.info(`[SSE-Service] 端点 ${endpointId} 连接已移除完成`);
  }

  /**
   * 重连端点
   */
  async resetAndReconnectEndpoint(endpointId: number): Promise<void> {
    try {
      logger.info(`[SSE-Service] 开始重置并重连端点 ${endpointId}`);
      
      // 先断开现有连接
      await this.disconnectEndpoint(endpointId);
      logger.info(`[SSE-Service] 端点 ${endpointId} 现有连接已断开`);
      
      // 重置端点状态为 OFFLINE
      await prisma.endpoint.update({
        where: { id: endpointId },
        data: { 
          status: EndpointStatus.OFFLINE,
          lastCheck: new Date()
        }
      });
      logger.info(`[SSE-Service] 端点 ${endpointId} 状态已重置为离线`);

      // 创建新的连接对象（确保重置手动断开标记）
      const endpoint = await prisma.endpoint.findUnique({
        where: { id: endpointId }
      });

      if (!endpoint) {
        throw new Error('端点不存在');
      }

      const connection: SSEConnection = {
        url: endpoint.url,
        apiPath: endpoint.apiPath,
        apiKey: endpoint.apiKey,
        controller: null,
        retryCount: 0,
        maxRetries: 3,
        lastError: null,
        reconnectTimeout: null,
        lastEventTime: Date.now(),
        isHealthy: true,
        manuallyDisconnected: false // 确保重置手动断开标记
      };

      // 存储新的连接对象
      this.connections.set(endpointId.toString(), connection);

      // 重新连接
      await this.connectEndpoint(endpointId);
      
      logger.info(`[SSE-Service] 端点 ${endpointId} 已手动重置并重新连接成功`);
      
    } catch (error) {
      logger.error(`[SSE-Service] 重置端点 ${endpointId} 失败`, error);
      throw error;
    }
  }

  /**
   * 手动断开端点
   */
  async manualDisconnectEndpoint(endpointId: number): Promise<void> {
    logger.info(`开始手动断开端点 ${endpointId} 连接`);
    
    const connection = this.connections.get(endpointId.toString());
    logger.info(`端点 ${endpointId} 连接记录:`, connection);
    
    if (!connection) {
      // 如果没有连接记录，也要确保数据库状态正确
      await prisma.endpoint.update({
        where: { id: endpointId },
        data: { 
          status: EndpointStatus.OFFLINE,
          lastCheck: new Date()
        }
      });
      logger.info(`端点 ${endpointId} 没有活跃连接，已设置为离线状态`);
      return;
    }

    // 设置手动断开标记
    connection.manuallyDisconnected = true;

    // 先中止控制器（如果存在）
    if (connection.controller) {
      connection.controller.abort();
      logger.info(`端点 ${endpointId} 连接控制器已中止`);
    }

    // 清理重连定时器
    if (connection.reconnectTimeout) {
      clearTimeout(connection.reconnectTimeout);
      connection.reconnectTimeout = null;
      logger.info(`端点 ${endpointId} 重连定时器已清理`);
    }

    // 删除连接记录
    this.connections.delete(endpointId.toString());
    logger.info(`端点 ${endpointId} 连接记录已删除`);

    // 更新端点状态为离线
    await prisma.endpoint.update({
      where: { id: endpointId },
      data: { 
        status: EndpointStatus.OFFLINE,
        lastCheck: new Date()
      }
    });

    logger.info(`端点 ${endpointId} 已手动断开连接，状态已更新为离线`);
  }

  /**
   * 获取端点状态
   */
  getEndpointStatus(endpointId: number): string {
    const connection = this.connections.get(endpointId.toString());
    if (!connection) return 'DISCONNECTED';
    if (!connection.isHealthy) return 'UNHEALTHY';
    return 'CONNECTED';
  }

  /**
   * 获取端点连接详情
   */
  getEndpointConnectionDetails(endpointId: number) {
    const connection = this.connections.get(endpointId.toString());
    if (!connection) {
      return { status: 'DISCONNECTED' };
    }

    return {
      status: connection.isHealthy ? 'CONNECTED' : 'UNHEALTHY',
      retryCount: connection.retryCount,
      maxRetries: connection.maxRetries,
      lastError: connection.lastError,
      lastEventTime: new Date(connection.lastEventTime),
      hasReconnectTimeout: !!connection.reconnectTimeout
    };
  }

  /**
   * 关闭SSE服务
   */
  public async shutdown() {
    logger.info('开始关闭 SSE 服务...');
    
    // 清理健康检查定时器
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // 断开所有连接
    const disconnectPromises = Array.from(this.connections.keys()).map(endpointId => 
      this.disconnectEndpoint(parseInt(endpointId))
    );
    
    await Promise.all(disconnectPromises);
    
    // 清理事件监听器
    this.eventEmitter.removeAllListeners();
    
    this.isInitialized = false;
    
    logger.info('SSE 服务已关闭');
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      connectionsCount: this.connections.size,
      connections: Array.from(this.connections.entries()).map(([id, conn]) => ({
        endpointId: id,
        isHealthy: conn.isHealthy,
        retryCount: conn.retryCount,
        lastError: conn.lastError
      })),
      sseManagerStats: this.sseManager.getStats()
    };
  }

  /**
   * 测试端点连接
   */
  public async testEndpointConnection(url: string, apiPath: string, apiKey: string): Promise<void> {
    const testUrl = `${url}${apiPath}/events`;
    logger.info(`[SSE-Service] 测试SSE连接: ${testUrl}`);

    try {
      // 获取系统代理设置
      const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
      const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
      const noProxy = process.env.NO_PROXY || process.env.no_proxy;

      // 检查是否需要跳过代理
      const shouldUseProxy = (() => {
        if (!httpProxy && !httpsProxy) return false;
        if (!noProxy) return true;
        
        const parsedUrl = new URL(testUrl);
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
        logger.info(`[SSE-Service] 检测到系统代理配置: HTTP=${httpProxy}, HTTPS=${httpsProxy}`);
      }

      // 创建测试用的agent配置
      const agentConfig: ExtendedAgentOptions = {
        keepAlive: true,
        timeout: 5000,    // 测试时使用更短的超时时间
        family: 0,        // 启用双栈支持
        all: true,        // 返回所有可用地址
        rejectUnauthorized: false, // 跳过 SSL 证书验证
        // 添加自签名证书支持
        secureOptions: require('constants').SSL_OP_NO_TLSv1_3,
        ciphers: 'ALL',
        minVersion: 'TLSv1.2' as const,
        maxVersion: 'TLSv1.2' as const
      };

      // 检查是否为HTTPS连接
      const isHttps = testUrl.startsWith('https:');

      // 创建代理 agent
      let agent;
      if (shouldUseProxy) {
        const proxyUrl = isHttps ? httpsProxy : httpProxy;
        if (proxyUrl) {
          agent = new HttpsProxyAgent(proxyUrl, agentConfig);
          logger.info(`[SSE-Service] 使用代理连接: ${proxyUrl}`);
        } else {
          agent = isHttps ? new https.Agent(agentConfig) : new http.Agent(agentConfig);
        }
      } else {
        agent = isHttps ? new https.Agent(agentConfig) : new http.Agent(agentConfig);
      }

      // 处理IPv6地址格式
      const parsedUrl = new URL(testUrl);
      if (parsedUrl.hostname.includes(':')) {
        // 如果是IPv6地址，确保使用方括号
        parsedUrl.hostname = `[${parsedUrl.hostname.replace(/[\[\]]/g, '')}]`;
        logger.info(`[SSE-Service] 检测到IPv6地址，已格式化为: ${parsedUrl.toString()}`);
      }

      // 添加DNS解析重试
      const maxRetries = 3;
      let lastError;

      for (let i = 0; i < maxRetries; i++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await proxyFetch(parsedUrl.toString(), {
            method: 'GET',
            headers: {
              'X-API-Key': apiKey,
              'Cache-Control': 'no-cache'
            },
            agent,
            signal: controller.signal as any
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
          }

          // 测试成功
          logger.info(`[SSE-Service] SSE连接测试成功: ${parsedUrl.toString()}`);
          return;
        } catch (error) {
          lastError = error;
          if (i < maxRetries - 1) {
            logger.warn(`[SSE-Service] 连接重试 ${i + 1}/${maxRetries}:`, error);
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
          }
        }
      }

      throw lastError;
    } catch (error) {
      logger.error('[SSE-Service] SSE连接测试失败:', error);
      throw error;
    }
  }

  /**
   * 重置SSE服务
   * 停止所有连接和健康检查,但不销毁实例
   */
  public async reset() {
    logger.info('[SSE-Service] 开始重置SSE服务...');
    
    // 清理健康检查定时器
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('[SSE-Service] 已停止健康检查');
    }
    
    // 断开所有连接
    const disconnectPromises = Array.from(this.connections.keys()).map(endpointId => 
      this.disconnectEndpoint(parseInt(endpointId))
    );
    
    await Promise.all(disconnectPromises);
    logger.info(`[SSE-Service] 已断开 ${disconnectPromises.length} 个端点连接`);
    
    // 清空连接映射
    this.connections.clear();
    
    // 重置初始化标志
    this.isInitialized = false;
    
    logger.info('[SSE-Service] SSE服务重置完成');
  }

  // 建立 SSE 连接
  private async establishConnection(endpointId: number, connection: SSEConnection) {
    const { url, apiPath, apiKey } = connection;
    const sseUrl = `${url}${apiPath}/events`;
    logger.info(`[SSE-Service] 建立SSE连接: ${sseUrl}`);
    
    try {
      const controller = new AbortController();
      connection.controller = controller;

      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let i = 0; i < maxRetries; i++) {
        try {
          const response = await proxyFetch(sseUrl, {
            headers: {
              'Accept': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'X-API-Key': apiKey
            },
            signal: controller.signal as any,
            timeout: 30000
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          if (!response.body) {
            throw new Error('Response body is null');
          }

          const processStream = () => {
            let buffer = '';

            response.body.on('data', (chunk: Buffer) => {
              try {
                buffer += chunk.toString();
                // 使用\n\n分割完整的事件块
                const events = buffer.split('\n\n');
                // 保留最后一个可能不完整的事件块
                buffer = events.pop() || '';
                
                for (const event of events) {
                  if (event.trim() === '') continue;
                  
                  // 在完整的事件块中查找event和data
                  const eventMatch = event.match(/^event: (.+)$/m);
                  const dataMatch = event.match(/^data: (.+)$/m);
                  
                  if (eventMatch && dataMatch) {
                    const eventData = JSON.parse(dataMatch[1]);
                    connection.lastEventTime = Date.now();
                    connection.isHealthy = true;
                    
                    // Debug输出到控制台
                    logger.debug(`[SSE-Service] 端点 ${endpointId} 收到SSE事件: `, JSON.stringify(eventData));
                    
                    // 异步处理并存储SSE事件到数据库
                    this.processSSEEvent(Number(endpointId), eventData).catch((error: unknown) => {
                      logger.error(`[SSE-Service] 处理端点 ${endpointId} SSE事件失败:`, error);
                    });
                    
                    // 发出事件通知
                    this.eventEmitter.emit(`endpoint:${endpointId}`, eventData);
                  }
                }
              } catch (error) {
                logger.error(`[SSE-Service] 处理端点 ${endpointId} 的数据块失败`, error);
              }
            });
            
            response.body.on('end', () => {
              logger.info(`[SSE-Service] 端点 ${endpointId} 连接已关闭`);
              this.handleConnectionClosed(endpointId, connection);
            });
            
            response.body.on('error', (error: Error) => {
              if (error.name === 'AbortError') {
                logger.info(`[SSE-Service] 端点 ${endpointId} 连接已中止`);
              } else {
                logger.error(`[SSE-Service] 端点 ${endpointId} 流错误`, error);
                this.handleConnectionError(endpointId, connection, error);
              }
            });
          };
          
          processStream();
          return;

        } catch (error) {
          lastError = error as Error;
          if (i < maxRetries - 1) {
            logger.warn(`[SSE-Service] 连接重试 ${i + 1}/${maxRetries}:`, error);
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
          }
        }
      }

      if (lastError) {
        throw lastError;
      }
      
    } catch (error) {
      logger.error(`[SSE-Service] 建立端点 ${endpointId} 的 SSE 连接失败`, error);
      throw error;
    }
  }
  
  // 处理连接关闭
  private handleConnectionClosed(endpointId: number, connection: SSEConnection) {
    logger.info(`[SSE-Service] 端点 ${endpointId} 连接已关闭`);
    connection.isHealthy = false;
    
    // 只有在不是主动关闭的情况下才尝试重连
    if (connection.controller && !connection.controller.signal.aborted) {
      logger.info(`[SSE-Service] 端点 ${endpointId} 连接异常关闭，准备重连`);
      this.triggerReconnect(endpointId, connection);
    } else {
      logger.info(`[SSE-Service] 端点 ${endpointId} 连接被主动关闭，不进行重连`);
    }
  }
  
  // 处理连接错误
  private handleConnectionError(endpointId: number, connection: SSEConnection, error: unknown) {
    logger.error(`[SSE-Service] 端点 ${endpointId} 连接错误`, error);
    connection.lastError = error instanceof Error ? error.message : String(error);
    connection.isHealthy = false;
    
    // 只有在不是主动关闭的情况下才尝试重连
    if (connection.controller && !connection.controller.signal.aborted) {
      logger.info(`[SSE-Service] 端点 ${endpointId} 连接错误，准备重连`);
      this.triggerReconnect(endpointId, connection);
    } else {
      logger.info(`[SSE-Service] 端点 ${endpointId} 连接已被主动关闭，不进行重连`);
    }
  }

  // 处理SSE事件并存储到数据库
  private async processSSEEvent(endpointId: number, eventData: any) {
    try {
      // 解析事件时间
      const eventTime = eventData.time ? new Date(eventData.time) : new Date();

      // console.log(`[SSE-Service] 处理SSE事件`, {
      //   endpointId,
      //   事件类型: eventData.type,
      //   事件时间: eventTime,
      //   原始数据: JSON.stringify(eventData, null, 2)
      // });

      // 存储平铺的实例数据
      await this.storeInstanceData(endpointId, eventData.type, eventTime, eventData);

      // 获取实例ID
      const instance = eventData.instance || eventData;
      const instanceId = instance.id || eventData.id;

      // console.log(`[SSE-Service] 提取实例信息`, {
      //   endpointId,
      //   instanceId,
      //   实例数据: instance ? JSON.stringify(instance, null, 2) : '无实例数据'
      // });

      // 使用全局SSE管理器转发事件
      if (instanceId) {

        if (eventData.type !== 'initial') {
          // console.log(`[SSE-Service] 准备转发数据到特定SSE管理器`, {
          //   instanceId,
          //   事件类型: eventData.type
          // });
          //直接转发原始数据，不进行任何包装
          const sseManager = getGlobalSSEManager();
          // 1. 转发到特定隧道的SSE通道
          this.sseManager.sendTunnelUpdateByInstanceId(instanceId, eventData);
        }
        // 只有非 log 类型的事件才转发
        /** if (eventData.type !== 'log') {
          // console.log(`[SSE-Service] 准备转发数据到全局SSE管理器`, {
          //   instanceId,
          //   事件类型: eventData.type
          // });
          // 2. 同时转发到全局SSE通道
          this.sseManager.sendGlobalUpdate({
            type: eventData.type,
            endpointId,
            instanceId,
            instance,
            timestamp: eventTime.toISOString(),
            data: eventData
          });
        }*/
      } else {
        console.warn(`[SSE-Service] ⚠️ 无法提取instanceId，跳过转发`, {
          endpointId,
          事件数据: JSON.stringify(eventData, null, 2)
        });
      }

      // 根据事件类型处理隧道实例管理
      switch (eventData.type) {
        case 'initial':
          await this.handleInitialTunnelInstances(endpointId, eventData);
          break;
        case 'create':
          await this.handleCreateTunnelInstance(endpointId, eventData);
          break;
        case 'update':
          await this.handleUpdateTunnelInstance(endpointId, eventData);
          break;
        case 'delete':
          await this.handleDeleteTunnelInstance(endpointId, eventData);
          break;
        case 'shutdown':
          await this.handleShutdownEvent(endpointId, eventData);
          break;
      }

    } catch (error) {
      logger.error(`[SSE-Service] 存储SSE事件到数据库失败: 端点=${endpointId}`, error);
    }
  }

  // 触发重连
  private triggerReconnect(endpointId: number, connection: SSEConnection) {
    if (connection.reconnectTimeout) {
      clearTimeout(connection.reconnectTimeout);
    }
    
    connection.retryCount++;
    
    if (connection.retryCount <= connection.maxRetries) {
      const retryDelay = Math.min(1000 * Math.pow(2, connection.retryCount), 30000);
      logger.info(`[SSE-Service] 端点 ${endpointId} 将在 ${retryDelay}ms 后重试连接 (第${connection.retryCount}次重试)`);
      
      connection.reconnectTimeout = setTimeout(async () => {
        try {
          await this.connectEndpoint(endpointId, false); // 不抛出错误，避免重复重试
        } catch (error) {
          logger.error(`[SSE-Service] 端点 ${endpointId} 重连失败`, error);
        }
      }, retryDelay);
    } else {
      logger.error(`[SSE-Service] 端点 ${endpointId} 达到最大重试次数 (${connection.maxRetries})，停止重连`);
      // 清理连接记录
      this.connections.delete(endpointId.toString());
      
      // 更新端点状态为失败
      prisma.endpoint.update({
        where: { id: endpointId },
        data: { 
          status: EndpointStatus.OFFLINE,
          lastCheck: new Date()
        }
      }).catch((error: unknown) => {
        logger.error(`[SSE-Service] 更新端点 ${endpointId} 状态失败`, error);
      });
    }
  }

  // 存储平铺的实例数据
  private async storeInstanceData(endpointId: number, eventType: string, eventTime: Date, eventData: any) {
    try {
      // 根据事件类型映射到数据库枚举
      let dbEventType: SSEEventType;
      switch (eventType.toLowerCase()) {
        case 'initial':
          dbEventType = SSEEventType.initial;
          break;
        case 'create':
          dbEventType = SSEEventType.create;
          break;
        case 'update':
          dbEventType = SSEEventType.update;
          break;
        case 'delete':
          dbEventType = SSEEventType.delete;
          break;
        case 'shutdown':
          dbEventType = SSEEventType.shutdown;
          break;
        case 'log':
          dbEventType = SSEEventType.log;
          break;
        default:
          dbEventType = SSEEventType.log; // 默认为LOG类型
      }

      // 提取实例信息（支持两种数据结构）
      const instance = eventData.instance || eventData;
      
      const instanceData = {
        eventType: dbEventType,
        pushType: eventData.type || 'log',
        eventTime: eventTime,
        endpointId: Number(endpointId), // 确保是数字类型
        instanceId: instance.id || eventData.id,
        instanceType: instance.type || null,
        status: instance.status || null,
        url: instance.url || null,
        tcpRx: instance.tcprx ? BigInt(instance.tcprx) : null,
        tcpTx: instance.tcptx ? BigInt(instance.tcptx) : null,
        udpRx: instance.udprx ? BigInt(instance.udprx) : null,
        udpTx: instance.udptx ? BigInt(instance.udptx) : null,
        logs: eventData.logs || null
      };

      // 存储平铺的实例数据到数据库
      await prisma.endpointSSE.create({
        data: instanceData
      });

      //logger.debug(`实例数据已平铺存储: 节点=${endpointId}, 实例=${instanceData.instanceId}, 推送类型=${instanceData.pushType}, 状态=${instanceData.status}`);

      // 处理initial推送中的隧道实例
      // await this.handleInitialTunnelInstances(endpointId, eventData);

    } catch (error) {
      logger.error(`[SSE-Service] 存储平铺实例数据失败: 节点=${endpointId}`, error);
    }
  }

  // 处理initial推送中的隧道实例
  private async handleInitialTunnelInstances(endpointId: number, eventData: any) {
    try {
      // 处理initial推送中的隧道实例
      if (eventData.type === 'initial' && eventData.instance && eventData.instance.type) {
        const instance = eventData.instance;
        
        // 判断隧道实例是否存在
        const tunnel = await prisma.tunnel.findUnique({
          where: {
            endpointId_instanceId: {
              endpointId: endpointId,
              instanceId: instance.id
            }
          }
        });
        
        // 准备流量统计数据
        const trafficData = {
          tcpRx: instance.tcprx ? BigInt(instance.tcprx) : BigInt(0),
          tcpTx: instance.tcptx ? BigInt(instance.tcptx) : BigInt(0),
          udpRx: instance.udprx ? BigInt(instance.udprx) : BigInt(0),
          udpTx: instance.udptx ? BigInt(instance.udptx) : BigInt(0),
        };
        
        if (!tunnel) {
          logger.info(`[SSE-Service] 收到初始化事件，隧道实例不存在，正在创建隧道实例`);
          await this.handleCreateTunnelInstance(endpointId, eventData);
        } else {
          logger.info(`[SSE-Service] 收到初始化事件，正在更新隧道状态和流量统计`);
          // 更新隧道实例状态和流量统计
          try {
            const updatedTunnel = await prisma.tunnel.update({
              where: {
                endpointId_instanceId: {
                  endpointId,
                  instanceId: instance.id
                }
              },
              data: {
                status: instance.status as TunnelStatus,
                ...trafficData,
                lastEventTime: eventData.time ? new Date(eventData.time) : new Date()
              }
            });

            if (updatedTunnel) {
              console.log(`成功更新隧道状态: ${instance.id}, 新状态: ${instance.status}`);
            }
          } catch (error: unknown) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
              console.error(`未找到要更新的隧道记录: endpointId=${endpointId}, instanceId=${instance.id}`);
            } else {
              console.error(`更新隧道状态失败:`, error);
            }
          }
        }
      }
    } catch (error) {
      logger.error(`[SSE-Service] 处理隧道实例状态更新失败: 节点=${endpointId}`, error);
    }
  }

  // 解析实例URL获取隧道配置
  private parseInstanceUrl(url: string, type: string) {
    try {
      if (!url) return null;
      
      logger.debug(`[SSE-Service] 解析实例URL: ${url}, 类型: ${type}`);
      
      // URL格式公式: <core>://<tunnel_addr>/<target_addr>?log=<level>&tls=<mode>&crt=<cert_file>&key=<key_file>
      // 示例:
      // - server://:30303/:3389?log=DEBUG
      // - client://asd.com:123123?log=info (异常格式，缺少target_addr)
      // - client://targetHost:targetPort/localHost:localPort?log=DEBUG
      
      let tunnelAddress = '';
      let tunnelPort = '';
      let targetAddress = '';
      let targetPort = '';
      let logLevel = 'info';
      let tlsMode = 'mode0';
      let certPath = null;
      let keyPath = null;
      
      // 使用更灵活的正则表达式解析URL
      // 匹配格式: protocol://host_part/target_part?query_part
      const urlMatch = url.match(/^(\w+):\/\/([^\/\?]*)(\/[^?]*)?(\?.*)?$/);
      
      if (!urlMatch) {
        logger.warn(`[SSE-Service] 无法匹配URL格式: ${url}`);
        return null;
      }
      
      const protocol = urlMatch[1] || '';        // server/client
      const hostPart = urlMatch[2] || '';        // tunnel_addr部分
      const pathPart = urlMatch[3] || '';        // target_addr部分 (可能为空)
      const queryPart = urlMatch[4] || '';       // 查询参数部分
      
      logger.debug(`[SSE-Service] URL组件解析: protocol=${protocol}, host=${hostPart}, path=${pathPart}, query=${queryPart}`);
      
      // 解析查询参数（通用处理）
      if (queryPart.startsWith('?')) {
        const params = new URLSearchParams(queryPart.substring(1));
        logLevel = params.get('log')?.toLowerCase() || 'info';
        const tls = params.get('tls');
        tlsMode = tls === '2' ? 'mode2' : tls === '1' ? 'mode1' : 'mode0';
        certPath = params.get('crt') || null;
        keyPath = params.get('key') || null;
      }
      
      // 解析 tunnel_addr 部分（所有模式通用）
      if (hostPart) {
        if (hostPart.startsWith(':')) {
          // 格式: :port
          tunnelAddress = '';  // 空字符串表示监听所有地址
          tunnelPort = hostPart.substring(1) || '0';
        } else if (hostPart.includes(':')) {
          // 格式: host:port
          const [host, port] = hostPart.split(':');
          tunnelAddress = host || '';
          tunnelPort = port || '0';
          
          // 验证端口号是否合理 (1-65535)
          const portNum = parseInt(port || '0');
          if (portNum > 65535) {
            logger.warn(`[SSE-Service] 端口号异常: ${port}，将设置为0`);
            tunnelPort = '0';
          }
        } else {
          // 只有主机名或端口号（异常情况）
          if (/^\d+$/.test(hostPart)) {
            // 纯数字，当作端口处理
            tunnelAddress = '';
            tunnelPort = hostPart;
          } else {
            // 当作主机名处理
            tunnelAddress = hostPart;
            tunnelPort = '0';
          }
        }
      }
      
      // 解析 target_addr 部分（所有模式通用）
      if (pathPart && pathPart.startsWith('/')) {
        const targetPart = pathPart.substring(1);
        if (targetPart.startsWith(':')) {
          // 格式: /:port
          targetAddress = '';
          targetPort = targetPart.substring(1) || '0';
        } else if (targetPart.includes(':')) {
          // 格式: /host:port
          const [host, port] = targetPart.split(':');
          targetAddress = host || '';
          targetPort = port || '0';
          
          // 验证端口号是否合理 (1-65535)
          const portNum = parseInt(port || '0');
          if (portNum > 65535) {
            logger.warn(`[SSE-Service] 端口号异常: ${port}，将设置为0`);
            targetPort = '0';
          }
        } else if (targetPart) {
          // 只有主机名或端口号
          if (/^\d+$/.test(targetPart)) {
            // 纯数字，当作端口处理
            targetAddress = '';
            targetPort = targetPart;
          } else {
            // 当作主机名处理
            targetAddress = targetPart;
            targetPort = '0';
          }
        }
      } else {
        // 缺少目标地址信息，使用默认值
        targetAddress = '';
        targetPort = '0';
        logger.debug(`[SSE-Service] URL缺少目标地址信息，使用默认值: targetAddress='', targetPort='0'`);
      }
      
      const result = {
        tunnelAddress: tunnelAddress,     // 允许空字符串
        tunnelPort: tunnelPort || '0',
        targetAddress: targetAddress,     // 允许空字符串  
        targetPort: targetPort || '0',
        tlsMode: tlsMode,
        certPath: certPath,
        keyPath: keyPath,
        logLevel: logLevel
      };
      
      logger.debug(`[SSE-Service] URL解析结果:`, result);
      
      return result;
      
    } catch (error) {
      logger.error(`[SSE-Service] 解析实例URL失败: ${url}`, error);
      return null;
    }
  }

  // 处理创建隧道实例事件
  private async handleCreateTunnelInstance(endpointId: number, eventData: any) {
    try {
      const instance = eventData.instance || eventData;
      
      // 检查是否为server或client类型的实例
      if (instance.type === 'server' || instance.type === 'client') {
        const instanceId = instance.id || eventData.id;
        
        if (!instanceId) {
          logger.warn(`[SSE-Service] 端点 ${endpointId} 创建事件的实例缺少ID，跳过处理`);
          return;
        }
        
        // 检查隧道管理数据库中是否已存在该实例 - 使用instanceId字段
        const existingTunnel = await prisma.tunnel.findFirst({
          where: {
            endpointId: endpointId,
            instanceId: instanceId
          }
        });
        
        if (!existingTunnel) {
          // 解析实例URL获取配置信息
          const tunnelConfig = this.parseInstanceUrl(instance.url, instance.type);
          
          if (tunnelConfig) {
            // 生成随机名称（如果实例ID为空或已存在同名隧道）
            const tunnelName = await this.generateUniqueTunnelName(instanceId.toString(), instance.type);
            
            // 准备流量统计数据
            const trafficData = {
              tcpRx: instance.tcprx ? BigInt(instance.tcprx) : BigInt(0),
              tcpTx: instance.tcptx ? BigInt(instance.tcptx) : BigInt(0),
              udpRx: instance.udprx ? BigInt(instance.udprx) : BigInt(0),
              udpTx: instance.udptx ? BigInt(instance.udptx) : BigInt(0),
            };
            
            // 创建新的隧道实例
            const newTunnel = await prisma.tunnel.create({
              data: {
                name: tunnelName,
                endpointId: endpointId,
                mode: instance.type as any,
                status: instance.status === 'running' ? 'running' : 'stopped',
                tunnelAddress: tunnelConfig.tunnelAddress,
                tunnelPort: tunnelConfig.tunnelPort,
                targetAddress: tunnelConfig.targetAddress,
                targetPort: tunnelConfig.targetPort,
                tlsMode: tunnelConfig.tlsMode as any,
                certPath: tunnelConfig.certPath,
                keyPath: tunnelConfig.keyPath,
                logLevel: tunnelConfig.logLevel as any,
                commandLine: instance.url || '',
                instanceId: instanceId || null, // 存储SSE推送的实例ID
                ...trafficData, // 包含流量统计数据
                lastEventTime: eventData.time ? new Date(eventData.time) : new Date() // 添加事件时间
              }
            });
            
            logger.info(`[SSE-Service] 端点 ${endpointId} 创建隧道实例: ${tunnelName} (${instance.type}) - SSE实例ID: ${instanceId} - 本地:${tunnelConfig.tunnelAddress}:${tunnelConfig.tunnelPort} -> 目标:${tunnelConfig.targetAddress}:${tunnelConfig.targetPort} - 流量: TCP(${instance.tcprx || 0}/${instance.tcptx || 0}) UDP(${instance.udprx || 0}/${instance.udptx || 0})`);
            
            // 发出事件通知前端更新页面
            this.eventEmitter.emit('tunnel:created', {
              endpointId,
              tunnel: newTunnel
            });
            
            // 更新端点的实例数
            await this.updateEndpointInstanceCount(Number(endpointId));
          } else {
            logger.warn(`[SSE-Service] 端点 ${endpointId} 创建事件的实例 ${instanceId} URL格式无法解析: ${instance.url}`);
          }
        } else {
          logger.debug(`[SSE-Service] 端点 ${endpointId} 隧道实例 ${instanceId} 已存在，跳过创建`);
        }
      }
      
    } catch (error) {
      logger.error(`[SSE-Service] 处理端点 ${endpointId} 的创建隧道实例事件失败:`, error);
    }
  }

  // 处理更新隧道实例事件
  private async handleUpdateTunnelInstance(endpointId: number, eventData: any) {
    try {
      const instance = eventData.instance || eventData;
      const instanceId = instance.id || eventData.id;
      
      if (!instanceId) {
        logger.warn(`[SSE-Service] 端点 ${endpointId} 更新事件的实例缺少ID，跳过处理`);
        return;
      }

      // 获取事件时间
      const eventTime = eventData.time ? new Date(eventData.time) : new Date();

      // 准备流量统计数据
      const trafficData = {
        tcpRx: instance.tcprx ? BigInt(instance.tcprx) : BigInt(0),
        tcpTx: instance.tcptx ? BigInt(instance.tcptx) : BigInt(0),
        udpRx: instance.udprx ? BigInt(instance.udprx) : BigInt(0),
        udpTx: instance.udptx ? BigInt(instance.udptx) : BigInt(0),
      };

      // 先获取当前隧道数据
      const currentTunnel = await prisma.tunnel.findUnique({
        where: {
          endpointId_instanceId: {
            endpointId,
            instanceId
          }
        }
      });

      // 如果找到现有隧道，比较状态和流量是否有变化
      if (currentTunnel) {
        const newStatus = instance.status === 'running' ? 'running' : 'stopped';
        const statusChanged = currentTunnel.status !== newStatus;
        
        // 检查流量是否有变化
        const trafficChanged = 
          currentTunnel.tcpRx !== trafficData.tcpRx ||
          currentTunnel.tcpTx !== trafficData.tcpTx ||
          currentTunnel.udpRx !== trafficData.udpRx ||
          currentTunnel.udpTx !== trafficData.udpTx;

        // 只有在状态或流量发生变化，且事件时间更新时才更新
        if ((statusChanged || trafficChanged) && (!currentTunnel.lastEventTime || eventTime > currentTunnel.lastEventTime)) {
          try {
            const updatedTunnel = await prisma.tunnel.update({
              where: {
                endpointId_instanceId: {
                  endpointId,
                  instanceId
                }
              },
              data: {
                status: newStatus,
                ...trafficData,
                lastEventTime: eventTime
              }
            });

            if (updatedTunnel) {
              logger.debug(`[SSE-Service] 端点 ${endpointId} 更新隧道实例: ${instanceId} -> 状态: ${instance.status}${statusChanged ? ' (状态已变更)' : ''}, 流量: TCP(${instance.tcprx || 0}/${instance.tcptx || 0}) UDP(${instance.udprx || 0}/${instance.udptx || 0})${trafficChanged ? ' (流量已变更)' : ''}, 事件时间: ${eventTime.toISOString()}`);
            }
          } catch (error: unknown) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
              console.error(`未找到要更新的隧道记录: endpointId=${endpointId}, instanceId=${instanceId}`);
            } else {
              console.error(`更新隧道状态失败:`, error);
            }
          }
          if(statusChanged){
            this.sseManager.sendGlobalUpdate({
              type: eventData.type,
              endpointId,
              instanceId,
              instance,
              timestamp: eventTime.toISOString(),
              data: eventData
            });
          }
        } else {
          logger.debug(`[SSE-Service] 端点 ${endpointId} 隧道实例 ${instanceId} 跳过更新: ${!statusChanged && !trafficChanged ? '无变化' : '事件时间较旧'}, 当前事件时间: ${eventTime.toISOString()}`);
        }
      } else {
        // 如果隧道不存在，记录警告日志
        logger.warn(`[SSE-Service] 端点 ${endpointId} 收到未知隧道实例 ${instanceId} 的更新事件，已忽略。状态: ${instance.status}, 事件时间: ${eventTime.toISOString()}`);
      }
    } catch (error) {
      logger.error(`[SSE-Service] 处理端点 ${endpointId} 的更新隧道实例事件失败:`, error);
    }
  }

  // 生成随机名称（如果实例ID为空或已存在同名隧道）
  private async generateUniqueTunnelName(instanceId: string, type: string): Promise<string> {
    // 如果instanceId为空或未定义，生成随机名称
    if (!instanceId || instanceId === 'undefined' || instanceId === 'null') {
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const baseName = `${type}-tunnel-${randomSuffix}`;
      return this.ensureUniqueName(baseName);
    }
    
    // 如果instanceId存在，先检查是否重复
    let tunnelName = instanceId;
    if (await this.isTunnelNameTaken(tunnelName)) {
      // 如果重复，添加后缀
      let suffix = 1;
      do {
        tunnelName = `${instanceId}_${suffix}`;
        suffix++;
      } while (await this.isTunnelNameTaken(tunnelName));
    }
    
    return tunnelName;
  }
    // 确保名称唯一
  private async ensureUniqueName(baseName: string): Promise<string> {
    let name = baseName;
    let suffix = 1;
    
    while (await this.isTunnelNameTaken(name)) {
      name = `${baseName}_${suffix}`;
      suffix++;
    }
    
    return name;
  }

  // 检查隧道名称是否已被使用
  private async isTunnelNameTaken(tunnelName: string) {
    const existingTunnel = await prisma.tunnel.findFirst({
      where: {
        name: tunnelName
      }
    });
    
    return !!existingTunnel;
  }
  // 处理删除隧道实例事件
  private async handleDeleteTunnelInstance(endpointId: number, eventData: any) {
    try {
      const instance = eventData.instance || eventData;
      const instanceId = instance.id || eventData.id;
      
      if (!instanceId) {
        logger.warn(`[SSE-Service] 端点 ${endpointId} 删除事件的实例缺少ID，跳过处理`);
        return;
      }
      
      // 查找现有隧道实例 - 使用instanceId字段
      const existingTunnel = await prisma.tunnel.findFirst({
        where: {
          endpointId: endpointId,
          instanceId: instanceId
        }
      });
      
      if (existingTunnel) {
        // 记录删除前的流量统计（用于日志）
        const finalTraffic = {
          tcpRx: Number(existingTunnel.tcpRx || 0),
          tcpTx: Number(existingTunnel.tcpTx || 0),
          udpRx: Number(existingTunnel.udpRx || 0),
          udpTx: Number(existingTunnel.udpTx || 0),
        };
        
        // 删除隧道实例
        await prisma.tunnel.delete({
          where: { id: existingTunnel.id }
        });
        
        logger.info(`[SSE-Service] 端点 ${endpointId} 删除隧道实例: ${instanceId} - 最终流量统计: TCP(${finalTraffic.tcpRx}/${finalTraffic.tcpTx}) UDP(${finalTraffic.udpRx}/${finalTraffic.udpTx})`);
        
        // 发出事件通知前端更新页面
        this.eventEmitter.emit('tunnel:deleted', {
          endpointId,
          tunnelId: existingTunnel.id,
          tunnelName: instanceId,
          finalTraffic
        });
        
        // 更新端点的实例数
        await this.updateEndpointInstanceCount(Number(endpointId));
      } else {
        logger.debug(`[SSE-Service] 端点 ${endpointId} 要删除的隧道实例 ${instanceId} 不存在，跳过删除`);
      }
      
    } catch (error) {
      logger.error(`[SSE-Service] 处理端点 ${endpointId} 的删除隧道实例事件失败:`, error);
    }
  }

  // 处理shutdown事件
  private async handleShutdownEvent(endpointId: number, eventData: any) {
    try {
      logger.info(`[SSE-Service] 端点 ${endpointId} 收到shutdown事件，准备断开SSE连接`);
      
      // 获取连接信息
      const connection = this.connections.get(endpointId.toString());
      
      if (connection) {
        // 清理重连定时器，防止自动重连
        if (connection.reconnectTimeout) {
          clearTimeout(connection.reconnectTimeout);
          connection.reconnectTimeout = null;
        }
        
        // 标记连接为不健康，防止健康检查触发重连
        connection.isHealthy = false;
        connection.retryCount = connection.maxRetries; // 设为最大重试次数，防止重连
        
        // 中止连接
        if (connection.controller) {
          connection.controller.abort();
        }
        
        // 从连接映射中移除
        this.connections.delete(endpointId.toString());
        
        logger.info(`[SSE-Service] 端点 ${endpointId} SSE连接已因shutdown事件断开`);
      }
      
      // 更新端点状态为离线
      await prisma.endpoint.update({
        where: { id: endpointId },
        data: { 
          status: EndpointStatus.OFFLINE,
          lastCheck: new Date()
        }
      });
      
      // 发出事件通知
      this.eventEmitter.emit('endpoint:shutdown', {
        endpointId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error(`[SSE-Service] 处理端点 ${endpointId} 的shutdown事件失败:`, error);
    }
  }

  // 获取连接状态
  public getConnectionStatus(): Map<string, any> {
    const status = new Map<string, any>();
    
    for (const [endpointId, connection] of this.connections.entries()) {
      status.set(endpointId, {
        isConnected: connection.isHealthy,
        lastEventTime: new Date(connection.lastEventTime),
        retryCount: connection.retryCount,
        lastError: connection.lastError
      });
    }
    
    return status;
  }

    // 更新端点的实例数
    private async updateEndpointInstanceCount(endpointId: number) {
      try {
        logger.debug(`[SSE-Service] 开始更新端点 ${endpointId} 的实例统计`);
  
        // 统计当前端点的隧道实例数量
        const totalInstances = await prisma.tunnel.count({
          where: {
            endpointId: endpointId
          }
        });
  
        logger.debug(`[SSE-Service] 端点 ${endpointId} 隧道统计: 总数=${totalInstances}，数据库更新成功`);
  
        // 更新端点的实例数量（使用运行中的实例数）
        const updateResult = await prisma.endpoint.update({
          where: { id: endpointId },
          data: { 
            tunnelCount: totalInstances,
            lastCheck: new Date()
          }
        });
      } catch (error) {
        logger.error(`[SSE-Service] 更新端点 ${endpointId} 实例统计失败:`, error);
      }
    }

  // 订阅所有隧道相关事件
  public subscribeToAllTunnelEvents(callbacks: {
    created?: (data: any) => void;
    updated?: (data: any) => void;
    deleted?: (data: any) => void;
    shutdown?: (data: any) => void;
  }) {
    if (callbacks.created) this.eventEmitter.on('tunnel:created', callbacks.created);
    if (callbacks.updated) this.eventEmitter.on('tunnel:updated', callbacks.updated);
    if (callbacks.deleted) this.eventEmitter.on('tunnel:deleted', callbacks.deleted);
    if (callbacks.shutdown) this.eventEmitter.on('endpoint:shutdown', callbacks.shutdown);
  }

  // 取消订阅所有隧道相关事件
  public unsubscribeFromAllTunnelEvents(callbacks: {
    created?: (data: any) => void;
    updated?: (data: any) => void;
    deleted?: (data: any) => void;
    shutdown?: (data: any) => void;
  }) {
    if (callbacks.created) this.eventEmitter.off('tunnel:created', callbacks.created);
    if (callbacks.updated) this.eventEmitter.off('tunnel:updated', callbacks.updated);
    if (callbacks.deleted) this.eventEmitter.off('tunnel:deleted', callbacks.deleted);
    if (callbacks.shutdown) this.eventEmitter.off('endpoint:shutdown', callbacks.shutdown);
  }
}

// 创建单例实例
export const sseService = SSEService.getInstance();

// 导出初始化函数
export function initializeSSEService() {
  return sseService.initialize();
}

// 导出关闭函数
export function shutdownSSEService() {
  return sseService.shutdown();
}

// 导出状态查询函数
export function getSSEServiceStatus() {
  return sseService.getStatus();
} 


