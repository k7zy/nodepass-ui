/**
 * 流量统计工具函数
 */

/**
 * 格式化流量字节数为人类可读的格式
 * @param bytes 字节数
 * @returns 格式化后的对象，包含数值和单位
 */
export const formatTrafficBytes = (bytes: number | bigint | null | undefined) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.abs(Number(bytes || 0));
  let unitIndex = 0;
  
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  
  return {
    value: value.toFixed(2),
    unit: units[unitIndex],
    formatted: `${value.toFixed(2)} ${units[unitIndex]}`
  };
};

/**
 * 计算流量速率（字节/秒）
 * @param currentBytes 当前累计字节数
 * @param previousBytes 上次累计字节数
 * @param timeDiff 时间差（毫秒）
 * @returns 字节/秒
 */
export const calculateTrafficRate = (
  currentBytes: number | bigint,
  previousBytes: number | bigint,
  timeDiff: number
): number => {
  const bytesDiff = Number(currentBytes) - Number(previousBytes);
  const timeDiffSeconds = timeDiff / 1000;
  return bytesDiff / timeDiffSeconds;
};

/**
 * 格式化流量速率
 * @param bytesPerSecond 字节/秒
 * @returns 格式化后的速率字符串
 */
export const formatTrafficRate = (bytesPerSecond: number) => {
  const formatted = formatTrafficBytes(bytesPerSecond);
  return `${formatted.value} ${formatted.unit}/s`;
};

/**
 * 转换BigInt为Number（用于JSON序列化）
 * @param value BigInt值
 * @returns 转换后的数字
 */
export const convertBigIntToNumber = (value: bigint | null | undefined): number => {
  if (value === null || value === undefined) {
    return 0;
  }
  return Number(value);
};

/**
 * 隧道流量统计接口
 */
export interface TunnelTrafficStats {
  tcpRx: number;
  tcpTx: number;
  udpRx: number;
  udpTx: number;
}

/**
 * 流量历史记录点
 */
export interface TrafficHistoryPoint {
  timestamp: Date | string;
  tcpRx: number;
  tcpTx: number;
  udpRx: number;
  udpTx: number;
}

/**
 * 获取流量总计
 * @param stats 流量统计对象
 * @returns 总流量字节数
 */
export const getTotalTraffic = (stats: TunnelTrafficStats): number => {
  return stats.tcpRx + stats.tcpTx + stats.udpRx + stats.udpTx;
};

/**
 * 获取TCP流量总计
 * @param stats 流量统计对象
 * @returns TCP总流量字节数
 */
export const getTcpTraffic = (stats: TunnelTrafficStats): number => {
  return stats.tcpRx + stats.tcpTx;
};

/**
 * 获取UDP流量总计
 * @param stats 流量统计对象
 * @returns UDP总流量字节数
 */
export const getUdpTraffic = (stats: TunnelTrafficStats): number => {
  return stats.udpRx + stats.udpTx;
};

/**
 * 比较两个流量统计对象的差值
 * @param current 当前流量统计
 * @param previous 之前的流量统计
 * @returns 流量差值
 */
export const getTrafficDiff = (
  current: TunnelTrafficStats,
  previous: TunnelTrafficStats
): TunnelTrafficStats => {
  return {
    tcpRx: current.tcpRx - previous.tcpRx,
    tcpTx: current.tcpTx - previous.tcpTx,
    udpRx: current.udpRx - previous.udpRx,
    udpTx: current.udpTx - previous.udpTx,
  };
};

/**
 * 创建空的流量统计对象
 * @returns 空的流量统计对象
 */
export const createEmptyTrafficStats = (): TunnelTrafficStats => {
  return {
    tcpRx: 0,
    tcpTx: 0,
    udpRx: 0,
    udpTx: 0,
  };
}; 