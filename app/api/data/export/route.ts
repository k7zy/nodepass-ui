import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// 自定义 BigInt 序列化
const bigIntReplacer = (key: string, value: any) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
};

export async function GET() {
  try {
    // 获取所有端点数据，排除主键字段
    const endpoints = await prisma.endpoint.findMany({
      select: {
        name: true,
        url: true,
        apiPath: true,
        apiKey: true,
        status: true,
        color: true,
        tunnels: {
          select: {
            name: true,
            mode: true,
            status: true,
            tunnelAddress: true,
            tunnelPort: true,
            targetAddress: true,
            targetPort: true,
            tlsMode: true,
            certPath: true,
            keyPath: true,
            logLevel: true,
            commandLine: true,
            instanceId: true,
            tcpRx: true,
            tcpTx: true,
            udpRx: true,
            udpTx: true,
          }
        },
      },
    });

    // 准备导出数据
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      data: {
        endpoints,
      },
    };

    return new NextResponse(JSON.stringify(exportData, bigIntReplacer, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="nodepass-data-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('导出数据失败:', error);
    return NextResponse.json(
      { error: '导出数据失败' },
      { status: 500 }
    );
  }
} 