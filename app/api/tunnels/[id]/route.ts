import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logTunnelOperation } from '@/lib/operation-log';
import { convertBigIntToNumber } from "@/lib/utils";
import { fetchWithSSLSupport } from '@/lib/utils/fetch';
import { logger } from '@/lib/server/logger';

// PATCH /api/tunnels/[instanceId] - 更新隧道状态（启动/停止/重启）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string,endpointId:string }> }
) {
  try {
    const { instanceId,endpointId } = await params;
    const body = await request.json();
    const { action } = body; // 'start', 'stop', 'restart'

    // 查找隧道实例
    const tunnel = await prisma.tunnel.findUnique({
      where: { endpointId_instanceId: {
        endpointId: Number(endpointId),
        instanceId: instanceId
      } }
    });

    if (!tunnel) {
      return NextResponse.json(
        { error: '隧道实例不存在' },
        { status: 404 }
      );
    }

    let newStatus = tunnel.status;
    let logAction: 'STARTED' | 'STOPPED' | 'RESTARTED' | 'ERROR' = 'STARTED';
    let logMessage = '';

    switch (action) {
      case 'start':
        newStatus = 'running';
        logAction = 'STARTED';
        logMessage = '隧道实例启动成功';
        break;
      case 'stop':
        newStatus = 'stopped';
        logAction = 'STOPPED';
        logMessage = '隧道实例停止成功';
        break;
      case 'restart':
        newStatus = 'running';
        logAction = 'RESTARTED';
        logMessage = '隧道实例重启成功';
        break;
      default:
        return NextResponse.json(
          { error: '无效的操作类型' },
          { status: 400 }
        );
    }

    // 更新隧道状态
    const updatedTunnel = await prisma.tunnel.update({
      where: { endpointId_instanceId: {
        endpointId: Number(endpointId),
        instanceId: instanceId
      } },
      data: { status: newStatus }
    });

    // 记录操作日志
    await logTunnelOperation({
      tunnelId: tunnel.id,
      tunnelName: tunnel.name,
      action: logAction,
      status: 'SUCCESS',
      message: logMessage
    });

    return NextResponse.json({
      success: true,
      data: convertBigIntToNumber(updatedTunnel),
      message: logMessage
    });
  } catch (error) {
    console.error('更新隧道状态失败:', error);
    
    // 记录错误日志
    try {
      const { instanceId, endpointId } = await params;
      const tunnel = await prisma.tunnel.findUnique({
        where: { endpointId_instanceId: {
          endpointId: Number(endpointId),
          instanceId: instanceId
        } }
      });
      
      if (tunnel) {
        await logTunnelOperation({
          tunnelId: tunnel.id,
          tunnelName: tunnel.name,
          action: 'ERROR',
          status: 'ERROR',
          message: `操作失败: ${error instanceof Error ? error.message : '未知错误'}`
        });
      }
    } catch (logError) {
      console.error('记录错误日志失败:', logError);
    }
    
    return NextResponse.json(
      { error: '更新隧道状态失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/tunnels/[id] - 删除隧道
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tunnelId = parseInt(id);
    if (isNaN(tunnelId)) {
      return NextResponse.json(
        { error: "无效的隧道ID" },
        { status: 400 }
      );
    }

    // 查找隧道及其关联的端点信息
    const tunnel = await prisma.tunnel.findUnique({
      where: { id: tunnelId },
      include: {
        endpoint: true
      }
    });

    if (!tunnel) {
      return NextResponse.json(
        { error: "隧道不存在" },
        { status: 404 }
      );
    }

    // 如果存在 instanceId，则尝试调用 NodePass API 删除实例
    if (tunnel.instanceId) {
      try {
        // 构建 NodePass API 请求 URL
        const apiUrl = `${tunnel.endpoint.url}${tunnel.endpoint.apiPath}/v1/instances/${tunnel.instanceId}`;

        // 调用 NodePass API 删除实例
        const nodepassResponse = await fetchWithSSLSupport(apiUrl, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': tunnel.endpoint.apiKey
          }
        });

        if (!nodepassResponse.ok) {
          const errorText = await nodepassResponse.text();
          logger.warn(`NodePass API 响应错误: ${nodepassResponse.status} - ${errorText}，继续删除本地记录`);
        }
      } catch (error: any) {
        logger.warn(`调用 NodePass API 删除失败: ${error.message}，继续删除本地记录`);
      }
    }

    // 删除本地数据库记录
    const result = await prisma.tunnel.deleteMany({
      where: { id: tunnelId }
    });

    // 如果没有删除任何记录，说明隧道可能已经被删除了
    if (result.count === 0) {
      logger.warn(`隧道 ${tunnelId} 已经被删除或不存在`);
    }

    // 更新端点的实例数量
    await prisma.endpoint.update({
      where: { id: tunnel.endpointId },
      data: {
        tunnelCount: {
          decrement: 1
        }
      }
    });

    // 记录操作日志
    await prisma.tunnelOperationLog.create({
      data: {
        tunnelId: tunnelId,
        tunnelName: tunnel.name,
        action: 'delete',
        status: "success",
        message: tunnel.instanceId 
          ? `删除隧道及远程实例成功` 
          : `删除本地隧道记录成功`
      }
    });

    return NextResponse.json({
      success: true,
      message: tunnel.instanceId 
        ? "隧道及远程实例已成功删除" 
        : "本地隧道记录已成功删除"
    });

  } catch (error) {
    logger.error('删除隧道失败:', error);
    return NextResponse.json({
      success: false,
      error: '删除隧道失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
} 