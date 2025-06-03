import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// 操作日志类型定义
type TunnelOperationLog = {
  id: number;
  tunnelId: number | null;
  tunnelName: string;
  action: string;
  status: string;
  message: string | null;
  createdAt: Date;
};

// GET /api/tunnel-logs - 获取隧道操作日志列表
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const logs = await prisma.tunnelOperationLog.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    });

    // 格式化返回数据
    const formattedLogs = logs.map((log: TunnelOperationLog) => ({
      id: log.id,
      time: log.createdAt.toISOString(),
      action: getActionText(log.action),
      instance: log.tunnelName,
      status: {
        type: getStatusType(log.status),
        text: getStatusText(log.status),
        icon: getStatusIcon(log.action, log.status)
      },
      message: log.message
    }));

    return NextResponse.json(formattedLogs);
  } catch (error) {
    console.error('获取操作日志失败:', error);
    return NextResponse.json(
      { error: '获取操作日志失败' },
      { status: 500 }
    );
  }
}

// 辅助函数：获取操作文本
function getActionText(action: string): string {
  const actionMap: Record<string, string> = {
    created: '创建',
    deleted: '删除',
    started: '启动',
    stopped: '停止',
    restarted: '重启',
    error: '错误'
  };
  return actionMap[action] || action;
}

// 辅助函数：获取状态类型
function getStatusType(status: string): 'success' | 'danger' | 'warning' {
  const statusMap: Record<string, 'success' | 'danger' | 'warning'> = {
    success: 'success',
    failed: 'danger',
    error: 'warning'
  };
  return statusMap[status] || 'warning';
}

// 辅助函数：获取状态文本
function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    success: '成功',
    failed: '失败',
    error: '错误'
  };
  return statusMap[status] || status;
}

// 辅助函数：获取状态图标
function getStatusIcon(action: string, status: string): string {
  if (status === 'success') {
    const actionIconMap: Record<string, string> = {
      created: 'solar:add-circle-bold',
      deleted: 'solar:trash-bin-minimalistic-bold',
      started: 'solar:play-circle-bold',
      stopped: 'solar:stop-circle-bold',
      restarted: 'solar:restart-bold',
      error: 'solar:danger-triangle-bold'
    };
    return actionIconMap[action] || 'solar:check-circle-bold';
  } else if (status === 'failed' || status === 'error') {
    return 'solar:danger-triangle-bold';
  }
  return 'solar:info-circle-bold';
} 