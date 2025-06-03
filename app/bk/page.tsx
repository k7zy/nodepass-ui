"use client";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Spacer,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  cn
} from "@heroui/react";
import React, { useState, useEffect } from "react";

import { Icon } from "@iconify/react";
import { FlowTrafficChart } from "@/components/ui/flow-traffic-chart";
import { useRouter } from "next/navigation";
import { EndpointStatus } from '@prisma/client';
import { useGlobalSSE, useDashboardSSE } from '@/lib/hooks/use-sse';
import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faServer, 
  faRoute, 
  faChartLine, 
  faShieldAlt,
  faUsers,
  faCogs
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/app/components/auth-provider';

// 流量数据类型定义
type ChartData = {
  month: string;
  value: number;
  lastYearValue: number;
};

type Chart = {
  key: string;
  title: string;
  value: number;
  suffix: string;
  type: string;
  change: string;
  changeType: "positive" | "negative" | "neutral";
  chartData: ChartData[];
};

// 流量数据
const trafficData: Chart[] = [
  {
    key: "total-traffic",
    title: "总流量",
    suffix: "GB",
    value: 1470,
    type: "number",
    change: "12.8%",
    changeType: "positive",
    chartData: [
      {month: "Jan", value: 980, lastYearValue: 435},
      {month: "Feb", value: 1250, lastYearValue: 385},
      {month: "Mar", value: 890, lastYearValue: 583},
      {month: "Apr", value: 1560, lastYearValue: 353},
      {month: "May", value: 1120, lastYearValue: 896},
      {month: "Jun", value: 1670, lastYearValue: 564},
    ],
  },
  {
    key: "bandwidth",
    title: "带宽使用",
    suffix: "Mbps",
    value: 231,
    type: "number",
    change: "-5.7%",
    changeType: "negative",
    chartData: [
      {month: "Jan", value: 282, lastYearValue: 143},
      {month: "Feb", value: 238, lastYearValue: 128},
      {month: "Mar", value: 269, lastYearValue: 158},
      {month: "Apr", value: 214, lastYearValue: 123},
      {month: "May", value: 276, lastYearValue: 189},
      {month: "Jun", value: 228, lastYearValue: 156},
    ],
  },
];

// 格式化函数
const formatValue = (value: number, type: string | undefined) => {
  if (type === "number") {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + "M";
    } else if (value >= 1000) {
      return (value / 1000).toFixed(0) + "k";
    }
    return value.toLocaleString();
  }
  if (type === "percentage") return `${value}%`;
  return value;
};

// 统计数据类型
interface TunnelStats {
  total: number;
  running: number;
  stopped: number;
  error: number;
}

// 隧道实例类型（用于统计）
interface TunnelInstance {
  id: number;
  status: {
    type: "success" | "danger" | "warning";
    text: string;
  };
}

// 端点类型
interface Endpoint {
  id: number;
  name: string;
  url: string;
  status: EndpointStatus;
  tunnelCount: number;
}

// 操作日志类型
interface OperationLog {
  id: string;
  time: string;
  action: string;
  instance: string;
  status: {
    type: "success" | "danger" | "warning";
    text: string;
    icon: string;
  };
  message?: string;
}

// 添加流量历史数据类型
interface HourlyTrafficData {
  hour: string;
  tcpRx: number;
  tcpTx: number;
  udpRx: number;
  udpTx: number;
}

// 添加流量单位转换函数
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

/**
 * 仪表盘页面 - 显示系统概览和状态信息
 */
export default function DashboardPage() {
  const router = useRouter();
  const [activeChart, setActiveChart] = React.useState<(typeof trafficData)[number]["key"]>(trafficData[0].key);
  const [stats, setStats] = useState<TunnelStats>({ total: 0, running: 0, stopped: 0, error: 0 });
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [trafficHistory, setTrafficHistory] = useState<HourlyTrafficData[]>([]);
  const { user } = useAuth();

  const activeChartData = React.useMemo(() => {
    const chart = trafficData.find((d) => d.key === activeChart);

    return {
      chartData: chart?.chartData ?? [],
      color:
        chart?.changeType === "positive"
          ? "success"
          : chart?.changeType === "negative"
            ? "danger"
            : "default",
      suffix: chart?.suffix,
      type: chart?.type,
    };
  }, [activeChart]);

  const {chartData, color, suffix, type} = activeChartData;

  const columns = [
    { key: "time", label: "时间" },
    { key: "action", label: "操作" },
    { key: "instance", label: "实例" },
    { key: "status", label: "状态" },
  ];

  // 获取隧道统计数据
  const fetchTunnelStats = async () => {
    try {
      const response = await fetch('/api/tunnels/simple');
      if (!response.ok) throw new Error('获取隧道数据失败');
      const tunnels: TunnelInstance[] = await response.json();
      
      const newStats = {
        total: tunnels.length,
        running: tunnels.filter(t => t.status.type === 'success').length,
        stopped: tunnels.filter(t => t.status.type === 'danger').length,
        error: tunnels.filter(t => t.status.type === 'warning').length,
      };
      
      setStats(newStats);
    } catch (error) {
      console.error('获取隧道统计数据失败:', error);
    }
  };

  // 获取端点数据
  const fetchEndpoints = async () => {
    try {
      const response = await fetch('/api/endpoints/simple');
      if (!response.ok) throw new Error('获取端点数据失败');
      const data: Endpoint[] = await response.json();
      setEndpoints(data);
    } catch (error) {
      console.error('获取端点数据失败:', error);
    }
  };

  // 获取操作日志数据
  const fetchOperationLogs = async () => {
    try {
      const response = await fetch('/api/tunnel-logs?limit=50');
      if (!response.ok) throw new Error('获取操作日志失败');
      const data: OperationLog[] = await response.json();
      setOperationLogs(data);
    } catch (error) {
      console.error('获取操作日志失败:', error);
    }
  };

  // 获取流量历史数据
  const fetchTrafficHistory = async () => {
    try {
      const response = await fetch('/api/traffic-history');
      if (!response.ok) {
        throw new Error('获取流量历史失败');
      }
      
      const data = await response.json();
      if (data.success) {
        setTrafficHistory(data.data);
        console.log('[仪表盘] 流量历史数据获取成功', {
          数据条数: data.data.length,
          总记录数: data.totalRecords,
          聚合小时数: data.aggregatedHours,
          样本数据: data.data.slice(0, 3)
        });
      } else {
        console.error('[仪表盘] 获取流量历史失败:', data.error);
        setTrafficHistory([]);
      }
    } catch (error) {
      console.error('[仪表盘] 获取流量历史失败:', error);
      setTrafficHistory([]);
    }
  };

  // 使用全局SSE监听页面刷新事件
  useGlobalSSE({
    onMessage: (data) => {
      if (data.type === 'refresh' && data.route === '/dashboard') {
        router.refresh();
      }
    }
  });
  
  // 使用仪表盘SSE监听流量趋势更新
  useDashboardSSE({
    onConnected: () => {
      console.log('仪表盘SSE连接成功');
    },
    onMessage: (data) => {
      if (data.type === 'dashboard_update') {
        // 处理流量趋势更新
        console.log('收到仪表盘更新:', data);
        // 这里可以更新UI状态
      }
    },
    onError: (error) => {
      console.error('仪表盘SSE错误:', error);
    }
  });

  // 初始化数据
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      await Promise.all([
        fetchTunnelStats(),
        fetchEndpoints(),
        fetchOperationLogs(),
        fetchTrafficHistory()
      ]);
      
      setLoading(false);
    };
    
    fetchData();
  }, []);

  const statsData = [
    { icon: faServer, label: '端点数量', value: '3', color: 'text-blue-500' },
    { icon: faRoute, label: '活跃隧道', value: '12', color: 'text-green-500' },
    { icon: faChartLine, label: '数据传输', value: '2.4GB', color: 'text-purple-500' },
    { icon: faShieldAlt, label: '安全连接', value: '100%', color: 'text-orange-500' },
  ];

  const quickActions = [
    { icon: faServer, label: '管理端点', href: '/endpoints', color: 'bg-blue-100 text-blue-600' },
    { icon: faRoute, label: '隧道管理', href: '/tunnels', color: 'bg-green-100 text-green-600' },
    { icon: faUsers, label: '用户设置', href: '/settings', color: 'bg-purple-100 text-purple-600' },
    { icon: faCogs, label: '系统配置', href: '/settings', color: 'bg-orange-100 text-orange-600' },
  ];

  return (
    <div className="space-y-8">
      {/* 欢迎信息 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            欢迎回来，{user?.username}！
          </h1>
          <p className="text-xl text-default-500">
            NodePass 隧道管理系统 - 您的安全隧道控制中心
          </p>
        </div>
      </motion.div>

      {/* 统计数据 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statsData.map((stat, index) => (
            <Card key={stat.label} className="border-none shadow-lg">
              <CardBody className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-small text-default-500 mb-2">{stat.label}</p>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full bg-default-100 ${stat.color}`}>
                    <FontAwesomeIcon icon={stat.icon} className="text-xl" />
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* 快速操作 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card className="border-none shadow-lg">
          <CardHeader className="pb-4">
            <h2 className="text-2xl font-bold text-foreground">快速操作</h2>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickActions.map((action, index) => (
                <motion.a
                  key={action.label}
                  href={action.href}
                  className="block p-6 rounded-lg border border-default-200 hover:border-primary transition-colors cursor-pointer group"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="text-center">
                    <div className={`w-12 h-12 rounded-full ${action.color} flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                      <FontAwesomeIcon icon={action.icon} className="text-xl" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">{action.label}</h3>
                    <p className="text-small text-default-500">点击进入管理界面</p>
                  </div>
                </motion.a>
              ))}
            </div>
          </CardBody>
        </Card>
      </motion.div>

      {/* 系统状态 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-none shadow-lg">
            <CardHeader>
              <h3 className="text-xl font-bold text-foreground">系统状态</h3>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-default-600">SSE 服务</span>
                  <span className="text-green-500 font-medium">● 运行中</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-default-600">数据库连接</span>
                  <span className="text-green-500 font-medium">● 正常</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-default-600">身份验证</span>
                  <span className="text-green-500 font-medium">● 已登录</span>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="border-none shadow-lg">
            <CardHeader>
              <h3 className="text-xl font-bold text-foreground">最近活动</h3>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-small text-default-600">用户 {user?.username} 登录成功</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-small text-default-600">系统初始化完成</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="text-small text-default-600">SSE 服务启动</span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </motion.div>
    </div>
  );
} 