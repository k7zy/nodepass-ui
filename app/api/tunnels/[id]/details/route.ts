import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { convertBigIntToNumber } from '@/lib/utils/traffic';

// 流量趋势数据类型
interface TrafficTrendData {
  eventTime: string;
  tcpRx: number;
  tcpTx: number;
  udpRx: number;
  udpTx: number;
}

// ANSI 颜色处理函数
const processAnsiColors = (text: string) => {
  try {
    // 移除时间戳前缀（如果存在）
    text = text.replace(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3}\s/, '');
    
    // 将 ANSI 颜色代码转换为 HTML span 标签
    const colorMap = new Map([
      [/\[32m/g, '<span class="text-green-400">'],
      [/\[31m/g, '<span class="text-red-400">'],
      [/\[33m/g, '<span class="text-yellow-400">'],
      [/\[34m/g, '<span class="text-blue-400">'],
      [/\[35m/g, '<span class="text-purple-400">'],
      [/\[36m/g, '<span class="text-cyan-400">'],
      [/\[37m/g, '<span class="text-gray-400">'],
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 等待 params
    const params = await context.params;
    const { id } = params;

    // 1. 获取隧道基本信息
    const tunnel = await prisma.tunnel.findUnique({
      where: { id: Number(id) },
      include: {
        endpoint: {
          select: {
            name: true
          }
        }
      }
    });

    if (!tunnel) {
      return NextResponse.json(
        { error: '隧道不存在' },
        { status: 404 }
      );
    }

    // 2. 获取日志记录
    const logRecords = tunnel.instanceId ? await prisma.endpointSSE.findMany({
      where: {
        endpointId: tunnel.endpointId,
        instanceId: tunnel.instanceId,
        pushType: 'log',
        logs: { not: null } // 确保 logs 字段不为空
      },
      orderBy: {
        eventTime: 'asc' // 按时间正序排列
      },
      take: 200, // 获取最近200条日志
      select: {
        logs: true
      }
    }) : [];

    // 3. 获取流量趋势数据 - 筛选 pushType 为 'update' 和 'initial' 的记录
    const trafficTrendRecords = tunnel.instanceId ? await prisma.endpointSSE.findMany({
      where: {
        endpointId: tunnel.endpointId,
        instanceId: tunnel.instanceId,
        pushType: {
          in: ['update', 'initial']
        },
        // 确保至少有一个流量字段不为空
        OR: [
          { tcpRx: { not: null } },
          { tcpTx: { not: null } },
          { udpRx: { not: null } },
          { udpTx: { not: null } }
        ]
      },
      orderBy: {
        eventTime: 'asc' // 按时间正序排列
      },
      take: 100, // 获取最近100个数据点
      select: {
        eventTime: true,
        tcpRx: true,
        tcpTx: true,
        udpRx: true,
        udpTx: true
      }
    }) : [];

    // 4. 格式化流量趋势数据
    const trafficTrend: TrafficTrendData[] = trafficTrendRecords.map(record => ({
      eventTime: record.eventTime.toISOString(),
      tcpRx: convertBigIntToNumber(record.tcpRx),
      tcpTx: convertBigIntToNumber(record.tcpTx),
      udpRx: convertBigIntToNumber(record.udpRx),
      udpTx: convertBigIntToNumber(record.udpTx)
    }));

    // 5. 组装隧道信息（使用Tunnel表中的最新流量数据）
    const tunnelInfo = {
      id: tunnel.id,
      instanceId: tunnel.instanceId,
      name: tunnel.name,
      type: tunnel.mode === 'server' ? '服务器' : '客户端',
      status: {
        type: tunnel.status === 'running' ? 'success' : tunnel.status === 'error' ? 'warning' : 'danger',
        text: tunnel.status === 'running' ? '运行中' : tunnel.status === 'error' ? '错误' : '已停止'
      },
      endpoint: tunnel.endpoint.name,
      endpointId: tunnel.endpointId,
      config: {
        listenPort: parseInt(tunnel.tunnelPort),
        targetPort: parseInt(tunnel.targetPort),
        tls: tunnel.tlsMode !== 'mode0',
        logLevel: tunnel.logLevel
      },
      traffic: {
        tcpRx: convertBigIntToNumber(tunnel.tcpRx),
        tcpTx: convertBigIntToNumber(tunnel.tcpTx),
        udpRx: convertBigIntToNumber(tunnel.udpRx),
        udpTx: convertBigIntToNumber(tunnel.udpTx)
      },
      tunnelAddress: tunnel.tunnelAddress,
      targetAddress: tunnel.targetAddress,
      commandLine: tunnel.commandLine
    };

    // 6. 处理日志数据 - 应用ANSI颜色处理
    const logs = logRecords
      .filter(record => record.logs && record.logs.trim()) // 过滤空日志
      .map(log => processAnsiColors(log.logs || '')); // 处理ANSI颜色并返回字符串

    return NextResponse.json({
      tunnelInfo,
      logs,
      trafficTrend // 添加流量趋势数据
    });

  } catch (error) {
    console.error('获取隧道详情失败:', error);
    return NextResponse.json(
      { error: '获取隧道详情失败' },
      { status: 500 }
    );
  }
} 