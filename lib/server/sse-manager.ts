import { EventEmitter } from 'events';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// 定义事件类型
export enum SSEEventTypes {
  GLOBAL = 'global',
  TUNNEL = 'tunnel',
  DASHBOARD = 'dashboard'
}

// 订阅者接口 - 简化为只使用instanceId
interface Subscriber {
  id: string;
  controller: ReadableStreamDefaultController;
  type: SSEEventTypes;
  instanceId?: string; // 只保留instanceId
}

// 全局符号用于确保真正的单例
const SSE_MANAGER_SYMBOL = Symbol.for('nodepass.sse.manager');

export class SSEManager {
  private subscribers: Map<string, Subscriber>;
  private eventEmitter: EventEmitter;

  private constructor() {
    this.subscribers = new Map();
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);
  }

  public static getInstance(): SSEManager {
    // 使用全局符号确保跨模块共享同一个实例
    const globalThis = global as any;
    
    if (!globalThis[SSE_MANAGER_SYMBOL]) {
      logger.info('[SSE-Manager] 创建全局SSEManager单例实例');
      globalThis[SSE_MANAGER_SYMBOL] = new SSEManager();
    } else {
      logger.info('[SSE-Manager] 使用现有的全局SSEManager实例');
    }
    
    return globalThis[SSE_MANAGER_SYMBOL];
  }

  // 添加订阅者 - 简化为只使用instanceId
  public addSubscriber(
    id: string,
    controller: ReadableStreamDefaultController,
    type: SSEEventTypes,
    instanceId?: string
  ) {
    this.subscribers.set(id, { 
      id, 
      controller, 
      type, 
      instanceId 
    });
    
    logger.info(`[SSE-Manager] 新订阅者已添加: ${id}`, {
      type,
      instanceId,
      总订阅者数量: this.subscribers.size,
      实例标识: this.constructor.name + '@' + this.hashCode()
    });
  }

  // 移除订阅者
  public removeSubscriber(id: string) {
    const wasRemoved = this.subscribers.delete(id);
    if (wasRemoved) {
      logger.info(`[SSE-Manager] 订阅者已移除: ${id}, 剩余订阅者数量: ${this.subscribers.size}`);
    }
  }

  // 广播全局消息
  public broadcast(data: any) {
    const encoder = new TextEncoder();
    const message = `data: ${JSON.stringify(data)}\n\n`;

    let sentCount = 0;
    for (const [_, subscriber] of this.subscribers) {
      if (subscriber.type === SSEEventTypes.GLOBAL) {
        try {
          subscriber.controller.enqueue(encoder.encode(message));
          sentCount++;
        } catch (error) {
          logger.error(`[SSE-Manager] 全局广播发送失败，移除订阅者: ${subscriber.id}`, error);
          this.removeSubscriber(subscriber.id);
        }
      }
    }
    
    logger.info(`[SSE-Manager] 全局广播已发送给 ${sentCount} 个订阅者`);
  }

  // 发送基于instanceId的隧道更新 - 直接转发原始数据
  public sendTunnelUpdateByInstanceId(instanceId: string, rawData: any) {
    // logger.info(`[SSE-Manager] 尝试推送隧道更新`, {
    //   目标instanceId: instanceId,
    //   数据类型: rawData.type,
    //   当前订阅者总数: this.subscribers.size,
    //   实例标识: this.constructor.name + '@' + this.hashCode()
    // });

    const encoder = new TextEncoder();
    let sentCount = 0;
    let tunnelSubscriberCount = 0;
    
    for (const [subscriberId, subscriber] of this.subscribers) {
      if (subscriber.type === SSEEventTypes.TUNNEL) {
        tunnelSubscriberCount++;
        // logger.info(`[SSE-Manager] 检查隧道订阅者: ${subscriberId}`, {
        //   订阅者instanceId: subscriber.instanceId,
        //   匹配instanceId: subscriber.instanceId === instanceId
        // });
        
        if (subscriber.instanceId === instanceId) {
          try {
            // 直接转发原始数据，不进行包装
            subscriber.controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(rawData)}\n\n`)
            );
            sentCount++;
            logger.info(`[SSE-Manager] ✅ 成功推送给订阅者: ${subscriberId}`);
          } catch (error) {
            logger.error(`[SSE-Manager] ❌ 推送失败给订阅者: ${subscriberId}`, error);
            // 移除失效的订阅者
            this.removeSubscriber(subscriberId);
          }
        }
      }
    }
    
    logger.info(`[SSE-Manager] 隧道更新推送完成`, {
      成功推送数量: sentCount,
      隧道订阅者总数: tunnelSubscriberCount,
      全部订阅者总数: this.subscribers.size
    });
  }

  // 发送仪表盘更新
  public sendDashboardUpdate(data: any) {
    const event = {
      type: 'dashboard_update',
      data,
      timestamp: new Date().toISOString()
    };

    let sentCount = 0;
    for (const [_, subscriber] of this.subscribers) {
      if (subscriber.type === SSEEventTypes.DASHBOARD) {
        try {
          const encoder = new TextEncoder();
          subscriber.controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
          sentCount++;
        } catch (error) {
          logger.error(`[SSE-Manager] 仪表盘更新发送失败，移除订阅者: ${subscriber.id}`, error);
          this.removeSubscriber(subscriber.id);
        }
      }
    }
    
    logger.info(`[SSE-Manager] 仪表盘更新已发送给 ${sentCount} 个订阅者`);
  }

  // 发送全局更新消息
  public sendGlobalUpdate(data: any) {
    // logger.info(`[SSE-Manager] 准备发送全局更新`, {
    //   事件类型: data.type,
    //   数据: JSON.stringify(data)
    // });

    const encoder = new TextEncoder();
    let sentCount = 0;
    let globalSubscriberCount = 0;
    
    for (const [subscriberId, subscriber] of this.subscribers) {
      if (subscriber.type === SSEEventTypes.GLOBAL) {
        globalSubscriberCount++;
        try {
          subscriber.controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
          sentCount++;
          logger.info(`[SSE-Manager] ✅ 成功推送全局更新给订阅者: ${subscriberId}`);
        } catch (error) {
          logger.error(`[SSE-Manager] ❌ 推送全局更新失败给订阅者: ${subscriberId}`, error);
          // 移除失效的订阅者
          this.removeSubscriber(subscriberId);
        }
      }
    }
    
    logger.info(`[SSE-Manager] 全局更新推送完成`, {
      成功推送数量: sentCount,
      全局订阅者总数: globalSubscriberCount,
      全部订阅者总数: this.subscribers.size
    });
  }

  // 获取统计信息
  public getStats() {
    const stats = {
      total: this.subscribers.size,
      global: 0,
      tunnel: 0,
      dashboard: 0,
      instanceId: this.hashCode() // 添加实例标识符
    };

    for (const [_, subscriber] of this.subscribers) {
      switch (subscriber.type) {
        case SSEEventTypes.GLOBAL:
          stats.global++;
          break;
        case SSEEventTypes.TUNNEL:
          stats.tunnel++;
          break;
        case SSEEventTypes.DASHBOARD:
          stats.dashboard++;
          break;
      }
    }

    return stats;
  }

  // 调试方法：列出所有订阅者
  public listSubscribers() {
    logger.info(`[SSE-Manager] 当前订阅者列表 (总数: ${this.subscribers.size}, 实例: ${this.hashCode()}):`);
    for (const [id, subscriber] of this.subscribers) {
      logger.info(`  - ${id}: ${subscriber.type}${subscriber.instanceId ? ` (instance: ${subscriber.instanceId})` : ''}`);
    }
  }

  // 实例标识符，用于调试
  private hashCode(): string {
    return Math.abs(this.toString().split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0)).toString(16).substr(0, 8);
  }
}

// 导出全局单例实例
export const sseManager = SSEManager.getInstance(); 