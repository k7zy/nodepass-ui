"use client";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tab,
  Tabs,
  useDisclosure
} from "@heroui/react";
import React, { useEffect } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPlay, faPause, faRotateRight, faTrash, faRefresh } from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";
import { useTunnelActions } from "@/lib/hooks/use-tunnel-actions";
import { addToast } from "@heroui/toast";
import CellValue from "./cell-value";
import { useTunnelSSE } from '@/lib/hooks/use-sse';
import { useGlobalSSE } from '@/lib/hooks/use-sse';
import { FlowTrafficChart } from "@/components/ui/flow-traffic-chart";

// 添加ANSI颜色处理函数
const processAnsiColors = (text: string) => {
  try {
    // 移除时间戳前缀（如果存在）
    text = text.replace(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3}\s/, '');
    
    // 只移除 \u001B 字符，保留后面的颜色代码
    text = text.replace(/\u001B/g, ''); // 只移除 ESC 字符，保留 [32m 等
    
    // 将 ANSI 颜色代码转换为 HTML span 标签
    const colorMap = new Map([
      [/\[32m/g, '<span class="text-green-400">'],   // INFO - 绿色
      [/\[31m/g, '<span class="text-red-400">'],     // ERROR - 红色
      [/\[33m/g, '<span class="text-yellow-400">'],  // WARN - 黄色
      [/\[34m/g, '<span class="text-blue-400">'],    // DEBUG - 蓝色
      [/\[35m/g, '<span class="text-purple-400">'],  // 紫色
      [/\[36m/g, '<span class="text-cyan-400">'],    // 青色
      [/\[37m/g, '<span class="text-gray-400">'],    // 灰色
      [/\[0m/g, '</span>']                           // 结束标签
    ]);

    // 替换颜色代码
    for (const [pattern, replacement] of colorMap) {
      text = text.replace(pattern, replacement);
    }

    // 确保所有标签都正确闭合
    const openTags = (text.match(/<span/g) || []).length;
    const closeTags = (text.match(/<\/span>/g) || []).length;
    
    // 如果开始标签多于结束标签，添加结束标签
    if (openTags > closeTags) {
      const missingCloseTags = openTags - closeTags;
      text += '</span>'.repeat(missingCloseTags);
    }

    return text;
  } catch (error) {
    console.error('处理ANSI颜色失败:', error);
    return text;
  }
};

interface TunnelInfo {
  id: string;
  instanceId: string;
  name: string;
  type: string;
  status: {
    type: "success" | "danger" | "warning";
    text: string;
  };
  endpoint: string;
  endpointId: string;
  config: {
    listenPort: number;
    targetPort: number;
    tls: boolean;
    logLevel: string;
  };
  traffic: {
    tcpRx: number;
    tcpTx: number;
    udpRx: number;
    udpTx: number;
  };
  nodepassInfo: any;
  error?: string;
  tunnelAddress: string;
  targetAddress: string;
  commandLine: string;
}

interface PageParams {
  id: string;
}

interface LogEntry {
  id: number;
  message: string;
  isHtml: boolean;
  traffic: {
    tcpRx: number;
    tcpTx: number;
    udpRx: number;
    udpTx: number;
  };
  timestamp: Date;
}

interface RawTrafficData {
  timestamp: Date;
  tcpRx: number;
  tcpTx: number;
  udpRx: number;
  udpTx: number;
}

interface FlowTrafficData {
  id: string;
  data: Array<{
    x: string;
    y: number;
    unit: string;
  }>;
}

// 添加流量趋势数据类型
interface TrafficTrendData {
  eventTime: string;
  tcpRx: number;
  tcpTx: number;
  udpRx: number;
  udpTx: number;
}

// 添加流量单位转换函数
const formatTrafficValue = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.abs(bytes);
  let unitIndex = 0;
  
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  
  return {
    value: value.toFixed(2),
    unit: units[unitIndex]
  };
};

// 根据数据选择最合适的统一单位
const getBestUnit = (values: number[]) => {
  if (values.length === 0) return { unit: 'B', divisor: 1 };
  
  const maxValue = Math.max(...values);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const divisors = [1, 1024, 1024*1024, 1024*1024*1024, 1024*1024*1024*1024];
  
  let unitIndex = 0;
  let testValue = maxValue;
  
  while (testValue >= 1024 && unitIndex < units.length - 1) {
    testValue /= 1024;
    unitIndex++;
  }
  
  return {
    unit: units[unitIndex],
    divisor: divisors[unitIndex]
  };
};

// 添加流量历史记录类型
interface TrafficMetrics {
  timestamp: number;
  tcp_in_rate: number;
  tcp_out_rate: number;
  udp_in_rate: number;
  udp_out_rate: number;
}

interface TrafficHistory {
  timestamps: number[];
  tcp_in_rates: number[];
  tcp_out_rates: number[];
  udp_in_rates: number[];
  udp_out_rates: number[];
}

export default function TunnelDetailPage({ params }: { params: Promise<PageParams> }) {
  const resolvedParams = React.use(params);
  const router = useRouter();
  const [selectedTab, setSelectedTab] = React.useState<string>("日志");
  const {isOpen, onOpen, onOpenChange} = useDisclosure();
  const [tunnelInfo, setTunnelInfo] = React.useState<TunnelInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [trafficData, setTrafficData] = React.useState<FlowTrafficData[]>([]);
  const [trafficTrend, setTrafficTrend] = React.useState<TrafficTrendData[]>([]);
  const [initialDataLoaded, setInitialDataLoaded] = React.useState(false);
  const [refreshLoading, setRefreshLoading] = React.useState(false);

  // 日志计数器，确保每个日志都有唯一的ID
  const logCounterRef = React.useRef(0);

  // 添加日志容器的引用
  const logContainerRef = React.useRef<HTMLDivElement>(null);

  // 添加延迟更新的引用，避免频繁调用API
  const updateTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // 滚动到日志底部的函数
  const scrollToBottom = React.useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, []);

  // 处理Tab切换时的滚动
  const handleTabChange = React.useCallback((key: React.Key) => {
    const keyStr = key.toString();
    setSelectedTab(keyStr);
    // 如果切换到日志Tab，延迟滚动到底部确保DOM更新完成
    if (keyStr === "日志") {
      setTimeout(scrollToBottom, 100);
    }
  }, [scrollToBottom]);

  // 计算流量趋势差值数据
  const calculateTrafficDiff = React.useCallback((trendData: TrafficTrendData[]) => {
    if (trendData.length < 2) return [];

    const diffs = [];
    
    for (let i = 1; i < trendData.length; i++) {
      const current = trendData[i];
      const previous = trendData[i - 1];
      
      // 计算差值
      const tcpRxDiff = Math.max(0, current.tcpRx - previous.tcpRx);
      const tcpTxDiff = Math.max(0, current.tcpTx - previous.tcpTx);
      const udpRxDiff = Math.max(0, current.udpRx - previous.udpRx);
      const udpTxDiff = Math.max(0, current.udpTx - previous.udpTx);
      
      diffs.push({
        eventTime: current.eventTime,
        tcpRxDiff,
        tcpTxDiff,
        udpRxDiff,
        udpTxDiff
      });
    }
    
    return diffs;
  }, []);

  // 延迟更新页面数据的函数
  const scheduleDataUpdate = React.useCallback(() => {
    // 清除之前的定时器
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    // 设置2秒后更新数据
    updateTimeoutRef.current = setTimeout(async () => {
      console.log('[前端SSE] 延迟更新页面数据');
      setRefreshLoading(true);
      
      try {
        // 调用API获取最新数据
        const response = await fetch(`/api/tunnels/${resolvedParams.id}/details`);
        if (!response.ok) {
          throw new Error('获取实例详情失败');
        }
        
        const data = await response.json();
        
        // 只更新实例信息，不影响日志
        if (data.tunnelInfo) {
          setTunnelInfo(data.tunnelInfo);
          console.log('[前端SSE] 页面数据更新成功', {
            新的流量数据: data.tunnelInfo.traffic,
            更新时间: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('[前端SSE] 延迟更新数据失败:', error);
      } finally {
        setRefreshLoading(false);
      }
      
      updateTimeoutRef.current = null;
    }, 2000);
    
    console.log('[前端SSE] 已安排2秒后更新页面数据');
  }, [resolvedParams.id]);

  // 手动刷新页面数据的函数
  const handleRefresh = React.useCallback(async () => {
    if (refreshLoading) return; // 防抖：如果正在loading则直接返回
    
    console.log('[前端手动刷新] 开始刷新页面数据');
    setRefreshLoading(true);
    
    try {
      // 调用API获取最新数据
      const response = await fetch(`/api/tunnels/${resolvedParams.id}/details`);
      if (!response.ok) {
        throw new Error('获取实例详情失败');
      }
      
      const data = await response.json();
      
      // 只更新实例信息，不影响日志
      if (data.tunnelInfo) {
        setTunnelInfo(data.tunnelInfo);
        console.log('[前端手动刷新] 页面数据刷新成功', {
          新的流量数据: data.tunnelInfo.traffic,
          更新时间: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('[前端手动刷新] 刷新数据失败:', error);
      addToast({
        title: "刷新失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setRefreshLoading(false);
    }
  }, [resolvedParams.id]);

  // 使用共用的实例操作 hook
  const { toggleStatus, restart, deleteTunnel } = useTunnelActions();

  const previousStatsRef = React.useRef<{
    timestamp: number;
    tcp_in: number;
    tcp_out: number;
    udp_in: number;
    udp_out: number;
  } | null>(null);
  
  const trafficHistoryRef = React.useRef<TrafficHistory>({
    timestamps: [],
    tcp_in_rates: [],
    tcp_out_rates: [],
    udp_in_rates: [],
    udp_out_rates: []
  });

  // 获取实例详情和历史数据
  const fetchTunnelDetails = React.useCallback(async () => {
    try {
      setLoading(true);
      
      // 获取实例基本信息和历史数据
      const response = await fetch(`/api/tunnels/${resolvedParams.id}/details`);
      if (!response.ok) {
        throw new Error('获取实例详情失败');
      }
      
      const data = await response.json();
      
      // 设置基本信息
      setTunnelInfo(data.tunnelInfo);
      
      console.log('[前端数据] 实例信息获取成功', {
        tunnelInfo: data.tunnelInfo,
        endpointId: data.tunnelInfo?.endpointId,
        instanceId: data.tunnelInfo?.instanceId,
        流量趋势数据条数: data.trafficTrend?.length || 0,
        完整数据: JSON.stringify(data.tunnelInfo, null, 2)
      });
      
      // 设置历史日志 - 处理带时间信息的日志对象
      if (data.logs && Array.isArray(data.logs)) {
        // 初始化计数器为历史日志的数量，确保新日志ID不会与历史日志冲突
        logCounterRef.current = data.logs.length;
        
        // 检查日志数据格式
        if (data.logs.length > 0 && typeof data.logs[0] === 'object') {
          // 新格式：对象数组，包含时间信息
          setLogs(data.logs);
        } else {
          // 旧格式：字符串数组，需要转换
          const formattedLogs = data.logs.map((message: string, index: number) => ({
            id: index + 1,
            message,
            isHtml: true,
            traffic: {
              tcpRx: 0,
              tcpTx: 0,
              udpRx: 0,
              udpTx: 0
            },
            timestamp: new Date() // 使用当前时间作为占位符
          }));
          setLogs(formattedLogs);
        }
        
        // 稍微延迟滚动，确保DOM更新完成
        setTimeout(scrollToBottom, 100);
      }

      // 设置流量趋势数据
      if (data.trafficTrend && Array.isArray(data.trafficTrend)) {
        setTrafficTrend(data.trafficTrend);
        console.log('[前端数据] 流量趋势数据获取成功', {
          数据点数: data.trafficTrend.length,
          最新数据: data.trafficTrend[data.trafficTrend.length - 1] || null
        });
      }

      setInitialDataLoaded(true);
    } catch (error) {
      console.error('获取实例详情失败:', error);
      addToast({
        title: "获取实例详情失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.id]);

  // 初始加载数据
  React.useEffect(() => {
    fetchTunnelDetails();
  }, [fetchTunnelDetails]);

  // 监听日志变化，自动滚动到底部
  React.useEffect(() => {
    if (logs.length > 0 && selectedTab === "日志") {
      // 延迟滚动，确保DOM更新完成
      setTimeout(scrollToBottom, 50);
    }
  }, [logs, selectedTab, scrollToBottom]);

  // 使用全局SSE监听页面刷新事件
  useGlobalSSE({
    onMessage: (data) => {
      if (data.type === 'refresh' && data.route === `/tunnels/${resolvedParams.id}`) {
        router.refresh();
      }
    }
  });
  
  // 使用实例SSE监听更新 - 使用统一的SSE hook
  useTunnelSSE(tunnelInfo?.instanceId || '', {
    onMessage: (data) => {
      console.log('[前端SSE] 收到实例SSE消息', data);
      
      // 处理log类型的事件
      if (data.type === 'log' && data.logs) {
        // 使用递增计数器确保唯一ID
        logCounterRef.current += 1;
        const newLog = {
          id: logCounterRef.current,
          message: processAnsiColors(data.logs), // 使用ANSI颜色处理函数
          isHtml: true, // 启用HTML格式渲染
          traffic: {
            tcpRx: data.instance?.tcprx || 0,
            tcpTx: data.instance?.tcptx || 0,
            udpRx: data.instance?.udprx || 0,
            udpTx: data.instance?.udptx || 0
          },
          timestamp: new Date(data.time || Date.now())
        };
        
        // 将新日志追加到控制台
        setLogs(prev => [newLog, ...prev].slice(0, 100));
        
        // 滚动到底部显示最新日志
        setTimeout(scrollToBottom, 50);
        
        console.log('[前端SSE] 处理log事件', {
          原始日志内容: data.logs,
          处理后日志内容: newLog.message,
          流量数据: newLog.traffic,
          日志ID: newLog.id
        });
      }
      // 处理其他类型的事件 - 延迟更新页面数据
      else if (data.type && data.type !== 'log') {
        console.log('[前端SSE] 收到非log事件，准备延迟更新页面数据', {
          事件类型: data.type,
          事件数据: data
        });
        
        // 调用延迟更新函数
        scheduleDataUpdate();
      }
    },
    onError: (error) => {
      console.error('[前端SSE] 实例SSE连接错误', error);
    },
    onConnected: () => {
      console.log('[前端SSE] 实例SSE连接成功');
    }
  });

  const handleToggleStatus = () => {
    if (!tunnelInfo) return;
    
    const isRunning = tunnelInfo.status.type === "success";
    toggleStatus(isRunning, {
      tunnelId: tunnelInfo.id,
      instanceId: tunnelInfo.instanceId,
      tunnelName: tunnelInfo.name,
      onStatusChange: (tunnelId, newStatus) => {
        setTunnelInfo(prev => prev ? {
          ...prev,
          status: {
            type: newStatus ? "success" : "danger",
            text: newStatus ? "运行中" : "已停止"
          }
        } : null);
      },
    });
  };

  const handleRestart = () => {
    if (!tunnelInfo) return;
    
    restart({
      tunnelId: tunnelInfo.id,
      instanceId: tunnelInfo.instanceId,
      tunnelName: tunnelInfo.name,
      onStatusChange: (tunnelId, newStatus) => {
        setTunnelInfo(prev => prev ? {
          ...prev,
          status: {
            type: "success",
            text: "运行中"
          }
        } : null);
      },
    });
  };

  const handleDelete = () => {
    if (!tunnelInfo) return;
    
    deleteTunnel({
      tunnelId: tunnelInfo.id,
      instanceId: tunnelInfo.instanceId,
      tunnelName: tunnelInfo.name,
      redirectAfterDelete: true,
    });
  };

  const handleDeleteClick = () => {
    onOpen();
  };

  // 如果正在加载或没有数据，显示加载状态
  if (loading || !tunnelInfo) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-4 border-default-200 border-t-primary animate-spin" />
            </div>
          </div>
          <p className="text-default-500 animate-pulse">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      {/* 顶部操作区 - 响应式布局 */}
      <div className="flex flex-col gap-3 md:gap-0 md:flex-row md:justify-between md:items-center">
        <div className="flex items-center gap-3 md:gap-4">
          <Button
            isIconOnly
            variant="flat"
            size="sm"
            onClick={() => router.back()}
            className="bg-default-100 hover:bg-default-200 dark:bg-default-100/10 dark:hover:bg-default-100/20"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </Button>
          <h1 className="text-lg md:text-2xl font-bold truncate">实例监控</h1>
          <Chip 
            variant="flat"
            color={tunnelInfo.status.type}
            size="sm"
            className="flex-shrink-0"
          >
            {tunnelInfo.status.text}
          </Chip>
        </div>
        
        {/* 操作按钮组 - 移动端优化 */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
          <Button
            variant="flat"
            color={tunnelInfo.status.type === "success" ? "warning" : "success"}
            size="sm"
            startContent={<FontAwesomeIcon icon={tunnelInfo.status.type === "success" ? faPause : faPlay} />}
            onClick={handleToggleStatus}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">{tunnelInfo.status.type === "success" ? "停止" : "启动"}</span>
          </Button>
          <Button
            variant="flat"
            color="primary"
            size="sm"
            startContent={<FontAwesomeIcon icon={faRotateRight} />}
            onClick={handleRestart}
            isDisabled={tunnelInfo.status.type !== "success"}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">重启</span>
          </Button>
          <Button
            variant="flat"
            color="danger"
            size="sm"
            startContent={<FontAwesomeIcon icon={faTrash} />}
            onClick={handleDeleteClick}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">删除</span>
          </Button>
          <Button
            variant="flat"
            color="default"
            size="sm"
            startContent={<FontAwesomeIcon icon={faRefresh} />}
            onClick={handleRefresh}
            isLoading={refreshLoading}
            isDisabled={refreshLoading}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">刷新</span>
          </Button>
        </div>
      </div>

      {/* 删除确认模态框 */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faTrash} className="text-danger" />
                  确认删除
                </div>
              </ModalHeader>
              <ModalBody>
                <p className="text-default-600 text-sm md:text-base">
                  您确定要删除实例 <span className="font-semibold text-foreground">"{tunnelInfo.name}"</span> 吗？
                </p>
                <p className="text-xs md:text-small text-warning">
                  ⚠️ 此操作不可撤销，实例的所有配置和数据都将被永久删除。
                </p>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose} size="sm">
                  取消
                </Button>
                <Button 
                  color="danger" 
                  size="sm"
                  onPress={() => {
                    handleDelete();
                    onClose();
                  }}
                  startContent={<FontAwesomeIcon icon={faTrash} />}
                >
                  确认删除
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 实例信息 - 响应式网格布局 */}
      <Card className="p-2">
        <CardHeader className="font-bold text-sm md:text-base">实例信息</CardHeader>
        <CardBody>
          <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4 lg:gap-12">
            {/* 左侧：基本信息 */}
            <Card className="border shadow-none">
              <CardBody className="flex flex-col justify-between h-full gap-3 md:gap-4">
                <CellValue label="实例ID" value={tunnelInfo.instanceId} />
                <CellValue 
                  label="端点" 
                  value={<Chip variant="bordered" color="default" size="sm">{tunnelInfo.endpoint}</Chip>} 
                />
                <CellValue 
                  label="类型" 
                  value={<Chip variant="flat" color={tunnelInfo.type === '服务器' ? "primary" : "secondary"} size="sm">
                    {tunnelInfo.type}
                  </Chip>} 
                />
                <CellValue 
                  label="状态" 
                  value={
                    <span className={`font-semibold text-sm ${
                      tunnelInfo.status.type === 'success' 
                        ? 'text-green-600 dark:text-green-400' 
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {tunnelInfo.status.text}
                    </span>
                  } 
                />
                <CellValue 
                  label="执行命令" 
                  value={<span className="font-mono text-xs md:text-sm break-all">
                    {tunnelInfo.commandLine}
                  </span>} 
                />
              </CardBody>
            </Card>
            
            {/* 右侧：流量统计卡片 - 响应式网格 */}
            <div className="grid grid-cols-2 gap-2 md:gap-3 h-fit">
              <Card className="p-2 bg-blue-50 dark:bg-blue-950/30 shadow-none">
                <CardBody className="p-2 md:p-3">
                  <div className="text-center">
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">TCP 接收</p>
                    <p className="text-sm md:text-lg font-bold text-blue-700 dark:text-blue-300">
                      {(() => {
                        const { value, unit } = formatTrafficValue(tunnelInfo.traffic.tcpRx);
                        return `${value} ${unit}`;
                      })()}
                    </p>
                  </div>
                </CardBody>
              </Card>
              
              <Card className="p-2 bg-green-50 dark:bg-green-950/30 shadow-none">
                <CardBody className="p-2 md:p-3">
                  <div className="text-center">
                    <p className="text-xs text-green-600 dark:text-green-400 mb-1">TCP 发送</p>
                    <p className="text-sm md:text-lg font-bold text-green-700 dark:text-green-300">
                      {(() => {
                        const { value, unit } = formatTrafficValue(tunnelInfo.traffic.tcpTx);
                        return `${value} ${unit}`;
                      })()}
                    </p>
                  </div>
                </CardBody>
              </Card>
              
              <Card className="p-2 bg-purple-50 dark:bg-purple-950/30 shadow-none">
                <CardBody className="p-2 md:p-3">
                  <div className="text-center">
                    <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">UDP 接收</p>
                    <p className="text-sm md:text-lg font-bold text-purple-700 dark:text-purple-300">
                      {(() => {
                        const { value, unit } = formatTrafficValue(tunnelInfo.traffic.udpRx);
                        return `${value} ${unit}`;
                      })()}
                    </p>
                  </div>
                </CardBody>
              </Card>
              
              <Card className="p-2 bg-orange-50 dark:bg-orange-950/30 shadow-none">
                <CardBody className="p-2 md:p-3">
                  <div className="text-center">
                    <p className="text-xs text-orange-600 dark:text-orange-400 mb-1">UDP 发送</p>
                    <p className="text-sm md:text-lg font-bold text-orange-700 dark:text-orange-300">
                      {(() => {
                        const { value, unit } = formatTrafficValue(tunnelInfo.traffic.udpTx);
                        return `${value} ${unit}`;
                      })()}
                    </p>
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 流量趋势图 - 响应式高度 */}
      <Card className="p-2">
        <CardHeader className="font-bold text-sm md:text-base">流量趋势</CardHeader>
        <CardBody>
          <div className="h-[250px] md:h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="space-y-4 text-center">
                  <div className="flex justify-center">
                    <div className="relative w-8 h-8">
                      <div className="absolute inset-0 rounded-full border-4 border-default-200 border-t-primary animate-spin" />
                    </div>
                  </div>
                  <p className="text-default-500 animate-pulse text-sm md:text-base">加载流量数据中...</p>
                </div>
              </div>
            ) : trafficTrend.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-default-500 text-base md:text-lg">暂无流量数据</p>
                  <p className="text-default-400 text-xs md:text-sm mt-2">当实例运行时，流量趋势数据将在此显示</p>
                </div>
              </div>
            ) : (
              <FlowTrafficChart 
                data={(() => {
                  const diffs = calculateTrafficDiff(trafficTrend);
                  if (diffs.length === 0) return [];
                  
                  // 收集所有差值数据，找到最合适的统一单位
                  const allValues: number[] = [];
                  diffs.forEach(item => {
                    allValues.push(item.tcpRxDiff, item.tcpTxDiff, item.udpRxDiff, item.udpTxDiff);
                  });
                  
                  const { unit: commonUnit, divisor } = getBestUnit(allValues);
                  
                  return [
                    {
                      id: `TCP接收`,
                      data: diffs.map((item) => ({
                        x: new Date(item.eventTime).toLocaleTimeString('zh-CN', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          second: '2-digit'
                        }),
                        y: parseFloat((item.tcpRxDiff / divisor).toFixed(2)),
                        unit: commonUnit
                      }))
                    },
                    {
                      id: `TCP发送`,
                      data: diffs.map((item) => ({
                        x: new Date(item.eventTime).toLocaleTimeString('zh-CN', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          second: '2-digit'
                        }),
                        y: parseFloat((item.tcpTxDiff / divisor).toFixed(2)),
                        unit: commonUnit
                      }))
                    },
                    {
                      id: `UDP接收`,
                      data: diffs.map((item) => ({
                        x: new Date(item.eventTime).toLocaleTimeString('zh-CN', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          second: '2-digit'
                        }),
                        y: parseFloat((item.udpRxDiff / divisor).toFixed(2)),
                        unit: commonUnit
                      }))
                    },
                    {
                      id: `UDP发送`,
                      data: diffs.map((item) => ({
                        x: new Date(item.eventTime).toLocaleTimeString('zh-CN', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          second: '2-digit'
                        }),
                        y: parseFloat((item.udpTxDiff / divisor).toFixed(2)),
                        unit: commonUnit
                      }))
                    }
                  ];
                })()}
                unit={(() => {
                  const diffs = calculateTrafficDiff(trafficTrend);
                  if (diffs.length === 0) return 'B';
                  
                  const allValues: number[] = [];
                  diffs.forEach(item => {
                    allValues.push(item.tcpRxDiff, item.tcpTxDiff, item.udpRxDiff, item.udpTxDiff);
                  });
                  
                  const { unit } = getBestUnit(allValues);
                  return unit;
                })()}
              />
            )}
          </div>
        </CardBody>
      </Card>

      {/* 详细信息 - Tab 内容响应式优化 */}
      <Card className="p-2">
        <CardBody>
          <Tabs 
            selectedKey={selectedTab}
            onSelectionChange={handleTabChange}
            size="sm"
            classNames={{
              tabList: "gap-2 md:gap-4",
              tab: "text-xs md:text-sm",
              tabContent: "text-xs md:text-sm"
            }}
          >
            <Tab key="日志" title="日志">
              <div 
                ref={logContainerRef}
                className="h-[300px] md:h-[400px] bg-zinc-900 rounded-lg p-3 md:p-4 font-mono text-xs md:text-sm overflow-auto scrollbar-thin"
              >
                {loading ? (
                  <div className="animate-pulse">
                    <span className="text-gray-500">[{new Date().toLocaleString()}]</span> 
                    <span className="text-blue-400 ml-2">INFO:</span> 
                    <span className="text-gray-300 ml-1">加载日志中...</span>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="text-gray-400 animate-pulse">
                    等待日志输出...
                  </div>
                ) : (
                  <div className="space-y-1">
                    {/* 反转数组顺序，让最新的日志显示在底部 */}
                    {logs.slice().reverse().map((log) => (
                      <div key={log.id.toString()} className="text-gray-300 leading-5">
                        <span className="text-gray-500 text-xs">[{new Date(log.timestamp).toLocaleString()}]</span>
                        {log.isHtml ? (
                          <span 
                            className="ml-2" 
                            dangerouslySetInnerHTML={{ __html: log.message }}
                          />
                        ) : (
                          <span className="ml-2 break-all">{log.message}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Tab>
            
            <Tab key="配置" title="配置">
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-3 text-sm md:text-base">实例配置</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    <CellValue 
                      label="监听端口" 
                      value={<span className="font-mono text-sm">{tunnelInfo.config.listenPort}</span>} 
                    />
                    <CellValue 
                      label="目标端口" 
                      value={<span className="font-mono text-sm">{tunnelInfo.config.targetPort}</span>} 
                    />
                    <CellValue 
                      label="TLS" 
                      value={<Chip size="sm" color={tunnelInfo.config.tls ? "success" : "default"}>
                        {tunnelInfo.config.tls ? "启用" : "禁用"}
                      </Chip>} 
                    />
                    <CellValue 
                      label="日志级别" 
                      value={<Chip size="sm" variant="flat" color="primary">
                        {tunnelInfo.config.logLevel}
                      </Chip>} 
                    />
                  </div>
                </div>
              </div>
            </Tab>
          </Tabs>
        </CardBody>
      </Card>
    </div>
  );
} 