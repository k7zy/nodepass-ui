import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { convertBigIntToNumber } from '@/lib/utils/traffic';

/**
 * 获取仪表盘流量趋势数据 - 按小时归集
 */
export async function GET() {
  try {
    console.log('[仪表盘流量趋势API] 开始获取流量趋势数据');
    
    // 获取所有流量数据（取最新的数据）
    const rawRecords = await prisma.endpointSSE.findMany({
      where: {
        pushType: {
          in: ['initial', 'update']
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
        eventTime: 'desc'
      },
      take: 500, // 获取最新500条记录用于归集
      select: {
        eventTime: true,
        tcpRx: true,
        tcpTx: true,
        udpRx: true,
        udpTx: true
      }
    });
    
    console.log('[仪表盘流量趋势API] 查询结果:', {
      数据条数: rawRecords.length,
      原始数据样例: rawRecords.slice(0, 3)
    });
    
    // 按小时归集数据
    const hourlyData = new Map<string, {
      hourTime: string;
      hourDisplay: string;
      tcpRx: number;
      tcpTx: number;
      udpRx: number;
      udpTx: number;
      count: number;
    }>();
    
    rawRecords.forEach(record => {
      const eventTime = new Date(record.eventTime);
      const hourKey = `${eventTime.getFullYear()}-${String(eventTime.getMonth() + 1).padStart(2, '0')}-${String(eventTime.getDate()).padStart(2, '0')} ${String(eventTime.getHours()).padStart(2, '0')}:00:00`;
      const hourDisplay = `${String(eventTime.getHours()).padStart(2, '0')}:00`;
      
      if (!hourlyData.has(hourKey)) {
        hourlyData.set(hourKey, {
          hourTime: hourKey,
          hourDisplay: hourDisplay,
          tcpRx: 0,
          tcpTx: 0,
          udpRx: 0,
          udpTx: 0,
          count: 0
        });
      }
      
      const hourData = hourlyData.get(hourKey)!;
      hourData.tcpRx += convertBigIntToNumber(record.tcpRx);
      hourData.tcpTx += convertBigIntToNumber(record.tcpTx);
      hourData.udpRx += convertBigIntToNumber(record.udpRx);
      hourData.udpTx += convertBigIntToNumber(record.udpTx);
      hourData.count += 1;
    });
    
    // 转换为数组并排序，取最新的24个小时
    const trafficTrend = Array.from(hourlyData.values())
      .sort((a, b) => a.hourTime.localeCompare(b.hourTime))
      .slice(-24) // 取最新的24个小时
      .map(item => ({
        hourTime: item.hourTime,
        hourDisplay: item.hourDisplay,
        tcpRx: item.tcpRx,
        tcpTx: item.tcpTx,
        udpRx: item.udpRx,
        udpTx: item.udpTx,
        recordCount: item.count
      }));
    
    console.log('[仪表盘流量趋势API] 转换后的数据:', {
      数据条数: trafficTrend.length,
      处理后数据: trafficTrend.slice(0, 3)
    });
    
    return NextResponse.json({
      success: true,
      data: trafficTrend,
      count: trafficTrend.length
    });
    
  } catch (error) {
    console.error('[仪表盘流量趋势API] 获取流量趋势数据失败:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '获取流量趋势数据失败',
        details: error instanceof Error ? error.message : '未知错误' 
      },
      { status: 500 }
    );
  }
} 