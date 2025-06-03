import { EventEmitter } from 'events';
import { NextResponse } from 'next/server';

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

export class SSEManager {
  private static instance: SSEManager;
  private subscribers: Map<string, Subscriber>;
  private eventEmitter: EventEmitter;

  private constructor() {
    this.subscribers = new Map();
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);
  }

  public static getInstance(): SSEManager {
    if (!SSEManager.instance) {
      SSEManager.instance = new SSEManager();
    }
    return SSEManager.instance;
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
    
    console.log(`[SSE-Manager] 新订阅者已添加: ${id}`, {
      type,
      instanceId,
      总订阅者数量: this.subscribers.size
    });
  }

  // 移除订阅者
  public removeSubscriber(id: string) {
    const wasRemoved = this.subscribers.delete(id);
    if (wasRemoved) {
      console.log(`[SSE-Manager] 订阅者已移除: ${id}, 剩余订阅者数量: ${this.subscribers.size}`);
    }
  }

  // 广播全局消息
  public broadcast(data: any) {
    const encoder = new TextEncoder();
    const message = `data: ${JSON.stringify(data)}\n\n`;

    let sentCount = 0;
    for (const [_, subscriber] of this.subscribers) {
      if (subscriber.type === SSEEventTypes.GLOBAL) {
        subscriber.controller.enqueue(encoder.encode(message));
        sentCount++;
      }
    }
    
    console.log(`[SSE-Manager] 全局广播已发送给 ${sentCount} 个订阅者`);
  }

  // 发送基于instanceId的隧道更新 - 直接转发原始数据
  public sendTunnelUpdateByInstanceId(instanceId: string, rawData: any) {
    console.log(`[SSE-Manager] 尝试推送隧道更新`, {
      目标instanceId: instanceId,
      数据类型: rawData.type,
      当前订阅者总数: this.subscribers.size
    });

    const encoder = new TextEncoder();
    let sentCount = 0;
    let tunnelSubscriberCount = 0;
    
    for (const [subscriberId, subscriber] of this.subscribers) {
      if (subscriber.type === SSEEventTypes.TUNNEL) {
        tunnelSubscriberCount++;
        console.log(`[SSE-Manager] 检查隧道订阅者: ${subscriberId}`, {
          订阅者instanceId: subscriber.instanceId,
          匹配instanceId: subscriber.instanceId === instanceId
        });
        
        if (subscriber.instanceId === instanceId) {
          try {
            // 直接转发原始数据，不进行包装
            subscriber.controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(rawData)}\n\n`)
            );
            sentCount++;
            console.log(`[SSE-Manager] ✅ 成功推送给订阅者: ${subscriberId}`);
          } catch (error) {
            console.error(`[SSE-Manager] ❌ 推送失败给订阅者: ${subscriberId}`, error);
            // 移除失效的订阅者
            this.removeSubscriber(subscriberId);
          }
        }
      }
    }
    
    console.log(`[SSE-Manager] 隧道更新推送完成`, {
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
        const encoder = new TextEncoder();
        subscriber.controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
        sentCount++;
      }
    }
    
    console.log(`[SSE-Manager] 仪表盘更新已发送给 ${sentCount} 个订阅者`);
  }

  // 获取统计信息
  public getStats() {
    const stats = {
      total: this.subscribers.size,
      global: 0,
      tunnel: 0,
      dashboard: 0
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
    console.log(`[SSE-Manager] 当前订阅者列表 (总数: ${this.subscribers.size}):`);
    for (const [id, subscriber] of this.subscribers) {
      console.log(`  - ${id}: ${subscriber.type}${subscriber.instanceId ? ` (instance: ${subscriber.instanceId})` : ''}`);
    }
  }
}

// 导出单例实例
export const sseManager = SSEManager.getInstance(); 