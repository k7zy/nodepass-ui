import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logTunnelOperation } from '@/lib/operation-log';
import { convertBigIntToNumber } from "@/lib/utils";

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

    if (!tunnel.instanceId) {
      return NextResponse.json(
        { error: "隧道实例ID不存在" },
        { status: 400 }
      );
    }

    try {
      // 构建 NodePass API 请求 URL
      const apiUrl = `${tunnel.endpoint.url}${tunnel.endpoint.apiPath}/v1/instances/${tunnel.instanceId}`;

      // 调用 NodePass API 删除实例
      const nodepassResponse = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': tunnel.endpoint.apiKey
        }
      });

      if (!nodepassResponse.ok) {
        const errorText = await nodepassResponse.text();
        throw new Error(`NodePass API 响应错误: ${nodepassResponse.status} - ${errorText}`);
      }

      // NodePass API 调用成功后，删除本地数据库记录
      await prisma.tunnel.delete({
        where: { id: tunnelId }
      });

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
          message: `删除隧道成功`
        }
      });

      return NextResponse.json({
        success: true,
        message: "隧道已成功删除"
      });

    } catch (apiError: any) {
      // 记录失败日志
      await prisma.tunnelOperationLog.create({
        data: {
          tunnelId: tunnelId,
          tunnelName: tunnel.name,
          action: 'delete',
          status: "error",
          message: `删除隧道失败: ${apiError.message}`
        }
      });

      return NextResponse.json({
        success: false,
        error: "调用 NodePass API 失败",
        message: apiError.message
      }, { status: 500 });
    }

  } catch (error) {
    console.error("删除隧道失败:", error);
    return NextResponse.json(
      { error: "删除隧道失败" },
      { status: 500 }
    );
  }
} 