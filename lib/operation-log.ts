import { prisma } from '@/lib/prisma';

// 操作类型枚举
export const OperationAction = {
  CREATED: 'created',
  DELETED: 'deleted', 
  STARTED: 'started',
  STOPPED: 'stopped',
  RESTARTED: 'restarted',
  RENAMED: 'renamed',
  ERROR: 'error'
} as const;

// 操作状态枚举
export const OperationStatus = {
  SUCCESS: 'success',
  FAILED: 'failed',
  ERROR: 'error'
} as const;

// 记录隧道操作日志
export async function logTunnelOperation({
  tunnelId,
  tunnelName,
  action,
  status,
  message
}: {
  tunnelId: number;
  tunnelName: string;
  action: keyof typeof OperationAction;
  status: keyof typeof OperationStatus;
  message?: string;
}) {
  try {
    await prisma.tunnelOperationLog.create({
      data: {
        tunnelId,
        tunnelName,
        action: OperationAction[action],
        status: OperationStatus[status],
        message
      }
    });
  } catch (error) {
    console.error('记录操作日志失败:', error);
  }
} 