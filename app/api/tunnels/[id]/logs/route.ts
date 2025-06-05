import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EndpointSSE, SSEEventType } from '@prisma/client';

interface LogData {
  id: number;
  logs: string | null;
  tcpRx: number | null;
  tcpTx: number | null;
  udpRx: number | null;
  udpTx: number | null;
  createdAt: Date;
}

// 添加 BigInt 转换函数
const convertBigIntToNumber = (value: any): number => {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return value || 0;
};

// GET /api/tunnels/[id]/logs - 获取隧道日志和流量数据
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 等待参数解析
    const { id } = await params;
    const tunnelId = parseInt(id);
    
    if (isNaN(tunnelId)) {
      return NextResponse.json(
        { error: "无效的隧道ID" },
        { status: 400 }
      );
    }

    // 从数据库获取隧道信息
    const tunnel = await prisma.tunnel.findUnique({
      where: { id: tunnelId },
      include: {
        endpoint: true,
      }
    });

    if (!tunnel) {
      return NextResponse.json(
        { error: "隧道不存在" },
        { status: 404 }
      );
    }

    // 从数据库获取日志数据
    const logs = await prisma.endpointSSE.findMany({
      where: {
        endpointId: tunnel.endpointId,
        instanceId: tunnel.instanceId || undefined,
        eventType: SSEEventType.log
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100, // 最近100条日志
      select: {
        id: true,
        logs: true,
        tcpRx: true,
        tcpTx: true,
        udpRx: true,
        udpTx: true,
        createdAt: true
      }
    }) as LogData[];

    // 添加 ANSI 颜色处理函数
    const processAnsiColors = (text: string) => {
      try {
        // 移除时间戳前缀（如果存在）
        text = text.replace(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3}\s/, '');
        
        // 将 ANSI 颜色代码转换为对象
        const colorMap = new Map([
          [/\[32m/g, '<span class="text-green-400">'],
          [/\[31m/g, '<span class="text-red-400">'],
          [/\[33m/g, '<span class="text-yellow-400">'],
          [/\[34m/g, '<span class="text-blue-400">'],
          [/\[0m/g, '</span>']
        ]);

        // 替换颜色代码
        for (const [pattern, replacement] of colorMap) {
          text = text.replace(pattern, replacement);
        }

        // 确保所有标签都正确闭合
        const openTags = (text.match(/<span/g) || []).length;
        const closeTags = (text.match(/<\/span>/g) || []).length;
        
        // 如果开标签比闭标签多，添加缺少的闭标签
        if (openTags > closeTags) {
          text += '</span>'.repeat(openTags - closeTags);
        }

        return text;
      } catch (error) {
        console.error('处理日志颜色失败:', error);
        return text; // 如果处理失败，返回原始文本
      }
    };

    // 转换 BigInt 数据
    const processedLogs = logs.map(log => ({
      id: convertBigIntToNumber(log.id),
      message: processAnsiColors(log.logs || ''),
      isHtml: true,
      traffic: {
        tcpRx: convertBigIntToNumber(log.tcpRx),
        tcpTx: convertBigIntToNumber(log.tcpTx),
        udpRx: convertBigIntToNumber(log.udpRx),
        udpTx: convertBigIntToNumber(log.udpTx),
      },
      timestamp: log.createdAt
    }));

    // 生成流量趋势数据
    const trafficData = logs.map(log => ({
      timestamp: log.createdAt,
      tcpRx: convertBigIntToNumber(log.tcpRx),
      tcpTx: convertBigIntToNumber(log.tcpTx),
      udpRx: convertBigIntToNumber(log.udpRx),
      udpTx: convertBigIntToNumber(log.udpTx),
    })).reverse(); // 按时间正序排列

    return NextResponse.json({
      success: true,
      data: {
        logs: processedLogs,
        trafficData
      }
    });

  } catch (error) {
    console.error("获取隧道日志失败:", error);
    return NextResponse.json(
      { error: "获取隧道日志失败" },
      { status: 500 }
    );
  }
} 