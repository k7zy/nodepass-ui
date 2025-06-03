import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TunnelStatus } from '@prisma/client';

// 简化的隧道实例类型，仅用于统计
interface TunnelInstance {
  id: number;
  status: {
    type: "success" | "danger" | "warning";
    text: string;
  };
}

export async function GET() {
  try {
    const tunnels = await prisma.tunnel.findMany({
      select: {
        id: true,
        status: true
      }
    });

    // 格式化为仪表盘期望的格式
    const formattedTunnels: TunnelInstance[] = tunnels.map(tunnel => ({
      id: tunnel.id,
      status: {
        type: tunnel.status === TunnelStatus.running ? "success" as const :
              tunnel.status === TunnelStatus.error ? "warning" as const : "danger" as const,
        text: tunnel.status === TunnelStatus.running ? "运行中" :
              tunnel.status === TunnelStatus.error ? "错误" : "已停止"
      }
    }));

    return NextResponse.json(formattedTunnels);
  } catch (error) {
    console.error('获取隧道简单列表失败:', error);
    return NextResponse.json(
      { error: '获取隧道简单列表失败' },
      { status: 500 }
    );
  }
} 