'use client';

import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Spinner
} from "@heroui/react";
import React, { useState, useEffect } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faSearch, 
  faChevronDown, 
  faPlus,
  faCheck,
  faEllipsisV,
  faStop,
  faPlay,
  faRotateRight,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";
import { Box, Flex } from "@/components";
import { EndpointStatus } from '@prisma/client';
import { addToast } from "@heroui/toast";

interface ApiEndpoint {
  id: string;
  name: string;
  url: string;
  status: EndpointStatus;
  tunnelCount: number;
}

interface TunnelToolBoxProps {
  filterValue: string;
  statusFilter: string;
  endpointFilter?: string;
  loading?: boolean;
  onSearchChange: (value?: string) => void;
  onClear: () => void;
  onStatusFilterChange: (status: string) => void;
  onEndpointFilterChange?: (endpointId: string) => void;
}

export const TunnelToolBox: React.FC<TunnelToolBoxProps> = ({
  filterValue,
  statusFilter,
  endpointFilter = "all",
  loading = false,
  onSearchChange,
  onClear,
  onStatusFilterChange,
  onEndpointFilterChange,
}) => {
  const router = useRouter();
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [endpointsLoading, setEndpointsLoading] = useState(true);

  useEffect(() => {
    const fetchEndpoints = async () => {
      try {
        const response = await fetch('/api/endpoints/simple');
        if (!response.ok) throw new Error('获取端点列表失败');
        const data = await response.json();
        setEndpoints(data);
      } catch (error) {
        console.error('获取端点列表失败:', error);
      } finally {
        setEndpointsLoading(false);
      }
    };

    fetchEndpoints();
  }, []);

  const statusOptions = [
    { label: "所有状态", value: "all" },
    { label: "运行中", value: "running" },
    { label: "已停止", value: "stopped" },
    { label: "错误", value: "error" },
  ];

  const getSelectedEndpointName = () => {
    if (endpointFilter === "all") return "所有端点";
    const endpoint = endpoints.find(ep => ep.id === endpointFilter);
    return endpoint ? endpoint.name : "所有端点";
  };

  return (
    <div className="px-3 md:px-4 py-3 w-full">
      {/* 主要工具栏 - 标题、搜索框、过滤器和操作按钮在一行 */}
      <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 lg:items-center">
        {/* 左侧：标题和搜索框 */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center flex-1">
          <Box className="text-lg md:text-xl font-semibold flex-shrink-0">
            <h1 className="text-xl md:text-2xl font-bold">实例管理</h1>
          </Box>
          <Box className="flex-1 sm:max-w-xs lg:max-w-sm">
            <Input
              isClearable
              size="sm"
              classNames={{
                inputWrapper: "bg-default-100",
              }}
              placeholder="搜索实例..."
              startContent={<FontAwesomeIcon icon={faSearch} className="text-default-400 text-sm" />}
              value={filterValue}
              onClear={() => onClear()}
              onValueChange={onSearchChange}
              isDisabled={loading}
            />
          </Box>
        </div>

        {/* 中间：过滤器组 */}
        <Flex className="gap-2 flex-wrap sm:flex-nowrap">
          {/* 端点过滤器 */}
          <Dropdown>
            <DropdownTrigger>
              <Button 
                variant="flat" 
                size="sm"
                className="min-w-0 flex-shrink-0"
                endContent={
                  endpointsLoading || loading ? 
                    <Spinner size="sm" /> : 
                    <FontAwesomeIcon icon={faChevronDown} className="text-xs" />
                }
                isDisabled={endpointsLoading || loading}
              >
                <span className="truncate max-w-[120px] sm:max-w-[150px]">
                  {getSelectedEndpointName()}
                </span>
              </Button>
            </DropdownTrigger>
            <DropdownMenu 
              aria-label="端点过滤"
              onAction={(key) => onEndpointFilterChange?.(key as string)}
              selectedKeys={[endpointFilter]}
              selectionMode="single"
              className="max-w-[280px]"
              items={[
                { key: "all", label: "所有端点", count: endpoints.reduce((total, ep) => total + ep.tunnelCount, 0) },
                ...endpoints.map((endpoint) => ({
                  key: endpoint.id,
                  label: endpoint.name,
                  status: endpoint.status,
                  count: endpoint.tunnelCount
                }))
              ]}
            >
              {(item: any) => (
                <DropdownItem key={item.key} className="text-sm">
                  <Flex align="center" justify="between" className="w-full">
                    {item.key === "all" ? (
                      <>
                        <span>所有端点</span>
                        <span className="text-xs text-default-400">
                        </span>
                      </>
                    ) : (
                      <>
                        <Flex align="center" className="gap-2 min-w-0 flex-1">
                          <span 
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              item.status === EndpointStatus.ONLINE ? 'bg-success' : 'bg-danger'
                            }`} 
                          />
                          <span className="truncate">{item.label}</span>
                        </Flex>
                        <span className="text-xs text-default-400 flex-shrink-0 ml-2">
                          {item.count} 个实例
                        </span>
                      </>
                    )}
                  </Flex>
                </DropdownItem>
              )}
            </DropdownMenu>
          </Dropdown>

          {/* 状态过滤器 */}
          <Dropdown>
            <DropdownTrigger>
              <Button 
                variant="flat" 
                size="sm"
                className="min-w-0 flex-shrink-0"
                endContent={loading ? <Spinner size="sm" /> : <FontAwesomeIcon icon={faChevronDown} className="text-xs" />}
                isDisabled={loading}
              >
                <span className="truncate max-w-[100px] sm:max-w-[120px]">
                  {statusOptions.find(option => option.value === statusFilter)?.label || "所有状态"}
                </span>
              </Button>
            </DropdownTrigger>
            <DropdownMenu 
              aria-label="状态过滤"
              onAction={(key) => onStatusFilterChange(key as string)}
              selectedKeys={[statusFilter]}
              selectionMode="single"
            >
              {statusOptions.map((status) => (
                <DropdownItem key={status.value} className="text-sm">
                  <Flex align="center" className="gap-2">
                    <Box>{status.label}</Box>
                  </Flex>
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        </Flex>

        {/* 右侧：操作按钮组 */}
        <Flex className="gap-2 flex-shrink-0">
          <Button 
            color="primary" 
            size="sm"
            className="md:text-sm"
            startContent={loading ? <Spinner size="sm" /> : <FontAwesomeIcon icon={faPlus} />}
            onClick={() => router.push("/tunnels/create")}
            isDisabled={loading}
          >
            <span className="hidden sm:inline">创建实例</span>
            <span className="sm:hidden">创建</span>
          </Button>
          <Dropdown>
            <DropdownTrigger>
              <Button 
                variant="bordered" 
                size="sm"
                isIconOnly
                isDisabled={loading}
              >
                <FontAwesomeIcon icon={faEllipsisV} />
              </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label="更多操作" variant="faded">
              <DropdownItem 
                key="stop" 
                className="text-warning"
                color="warning"
                startContent={<FontAwesomeIcon icon={faStop} className="text text-warning pointer-events-none flex-shrink-0" />}
              >
                停止选中
              </DropdownItem>
              <DropdownItem 
                key="start" 
                className="text-success"
                color="success"
                startContent={<FontAwesomeIcon icon={faPlay} className="text text-success pointer-events-none flex-shrink-0" />}
              >
                启动选中
              </DropdownItem>
              <DropdownItem 
                key="restart" 
                className="text-primary"
                color="primary"
                startContent={<FontAwesomeIcon icon={faRotateRight} className="text text-primary pointer-events-none flex-shrink-0" />}
              >
                重启选中
              </DropdownItem>
              <DropdownItem 
                key="delete" 
                className="text-danger"
                color="danger"
                startContent={<FontAwesomeIcon icon={faTrash} className="text text-danger pointer-events-none flex-shrink-0" />}
              >
                删除选中
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </Flex>
      </div>
    </div>
  );
};
