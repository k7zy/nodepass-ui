import { NextRequest } from 'next/server';
import { getGlobalSSEManager } from '@/lib/server/global-sse';

export async function GET(request: NextRequest) {
  try {
    // 使用全局 SSE 管理器
    const sseManager = getGlobalSSEManager();
    
    // 获取查询参数
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const instanceId = url.searchParams.get('instanceId');

    if (action === 'stats') {
      // 返回 SSE 管理器统计信息
      const stats = sseManager.getStats();
      console.log('[SSE-Test] 当前SSE管理器统计:', stats);
      sseManager.listSubscribers();
      
      return Response.json({
        success: true,
        stats,
        message: '统计信息获取成功，详细信息请查看服务器控制台'
      });
    }

    if (action === 'send' && instanceId) {
      // 发送测试消息到指定instanceId
      const testMessage = {
        type: 'log',
        logs: `[测试消息] 这是一条发送到 instanceId: ${instanceId} 的测试日志 - ${new Date().toISOString()}`,
        time: new Date().toISOString(),
        instance: {
          id: instanceId,
          tcprx: Math.floor(Math.random() * 1000),
          tcptx: Math.floor(Math.random() * 1000),
          udprx: Math.floor(Math.random() * 100),
          udptx: Math.floor(Math.random() * 100)
        }
      };

      console.log(`[SSE-Test] 尝试发送测试消息到 instanceId: ${instanceId}`, testMessage);
      
      // 使用 SSE 管理器发送消息
      sseManager.sendTunnelUpdateByInstanceId(instanceId, testMessage);

      return Response.json({
        success: true,
        message: `测试消息已发送到 instanceId: ${instanceId}`,
        data: testMessage
      });
    }

    if (action === 'broadcast') {
      // 发送全局广播消息
      const broadcastMessage = {
        type: 'test_broadcast',
        message: `全局广播测试消息 - ${new Date().toISOString()}`,
        timestamp: new Date().toISOString()
      };

      console.log('[SSE-Test] 发送全局广播消息', broadcastMessage);
      sseManager.broadcast(broadcastMessage);

      return Response.json({
        success: true,
        message: '全局广播消息已发送',
        data: broadcastMessage
      });
    }

    // 默认返回帮助信息
    return Response.json({
      success: true,
      message: 'SSE 测试端点',
      usage: {
        stats: '/api/sse/test?action=stats - 获取SSE管理器统计信息',
        send: '/api/sse/test?action=send&instanceId=YOUR_INSTANCE_ID - 发送测试消息到指定隧道',
        broadcast: '/api/sse/test?action=broadcast - 发送全局广播消息'
      }
    });

  } catch (error) {
    console.error('[SSE-Test] 测试端点错误:', error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
} 