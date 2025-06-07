import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logTunnelOperation } from '@/lib/operation-log';
import { convertBigIntToNumber } from "@/lib/utils";
import { fetchWithSSLSupport } from '@/lib/utils/fetch';
import { logger } from '@/lib/server/logger';
import { z } from 'zod';

// 验证请求体的schema
const updateTunnelSchema = z.object({
  action: z.enum(['start', 'stop', 'restart', 'rename']),
  name: z.string().min(1, "名称不能为空").max(50, "名称不能超过50个字符").optional(),
});

// PATCH /api/tunnels/[instanceId] - 更新隧道状态（启动/停止/重启）或名称
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId?: string, endpointId?: string, id?: string }> }
) {
  try {
    const body = await request.json();
    const { action, name } = updateTunnelSchema.parse(body);

    // 如果是重命名操作
    if (action === 'rename') {
      if (!name) {
        return NextResponse.json(
          { error: "重命名操作需要提供新名称" },
          { status: 400 }
        );
      }

      const { id } = await params;
      if (!id) {
        return NextResponse.json(
          { error: "缺少隧道ID" },
          { status: 400 }
        );
      }

      const tunnelId = parseInt(id);
      if (isNaN(tunnelId)) {
        return NextResponse.json(
          { error: "无效的隧道ID" },
          { status: 400 }
        );
      }

      // 检查隧道是否存在
      const existingTunnel = await prisma.tunnel.findUnique({
        where: { id: tunnelId }
      });

      if (!existingTunnel) {
        return NextResponse.json(
          { error: "隧道不存在" },
          { status: 404 }
        );
      }

      // 更新隧道名称
      const updatedTunnel = await prisma.tunnel.update({
        where: { id: tunnelId },
        data: { name }
      });

      // 记录操作日志
      await logTunnelOperation({
        tunnelId: tunnelId,
        tunnelName: name,
        action: 'RENAMED',
        status: 'SUCCESS',
        message: `隧道名称已更新为: ${name}`
      });

      return NextResponse.json({
        success: true,
        data: convertBigIntToNumber(updatedTunnel),
        message: "隧道名称更新成功"
      });
    }

    // 如果是状态更新操作
    const { instanceId, endpointId } = await params;
    if (!instanceId || !endpointId) {
      return NextResponse.json(
        { error: "缺少必要的参数" },
        { status: 400 }
      );
    }

    // 查找隧道实例
    const tunnel = await prisma.tunnel.findUnique({
      where: {
        endpointId_instanceId: {
          endpointId: Number(endpointId),
          instanceId: instanceId
        }
      }
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
      where: {
        endpointId_instanceId: {
          endpointId: Number(endpointId),
          instanceId: instanceId
        }
      },
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
    console.error('更新隧道失败:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "数据验证失败", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: '更新隧道失败' },
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
        const apiUrl = `${tunnel.endpoint.url}${tunnel.endpoint.apiPath}/instances/${tunnel.instanceId}`;

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
    await updateEndpointInstanceCount(tunnel.endpointId);

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

// 更新端点实例数量的辅助函数
async function updateEndpointInstanceCount(endpointId: number) {
  try {
    // 统计运行中的隧道实例数量
    const runningInstances = await prisma.tunnel.count({
      where: {
        endpointId: endpointId
      }
    });

    // 更新端点的实例数量
    await prisma.endpoint.update({
      where: { id: endpointId },
      data: { 
        tunnelCount: runningInstances,
        lastCheck: new Date()
      }
    });

    console.log(`端点 ${endpointId} 实例统计已更新: ${runningInstances} 个运行中`);

  } catch (error) {
    console.error(`更新端点 ${endpointId} 实例统计失败:`, error);
  }
} 