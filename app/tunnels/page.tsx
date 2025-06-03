"use client";

import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  useDisclosure
} from "@heroui/react";
import React from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faEye, 
  faPause, 
  faPlay, 
  faTrash,
  faRotateRight
} from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";
import { Selection } from "@react-types/shared";
import { Box, Flex } from "@/components";
import { TunnelToolBox } from "./components/toolbox";
import { useTunnelActions } from "@/lib/hooks/use-tunnel-actions";
import { addToast } from "@heroui/toast";

// 定义隧道类型
interface Tunnel {
  id: string;
  instanceId?: string; // NodePass API的隧道ID（可选）
  type: string;
  name: string;
  endpoint: string;
  endpointId: string;
  tunnelAddress: string;
  targetAddress: string;
  status: {
    type: "success" | "danger" | "warning";
    text: string;
  };
  avatar: string;
}

export default function TunnelsPage() {
  const router = useRouter();
  const [filterValue, setFilterValue] = React.useState("");
  const [selectedKeys, setSelectedKeys] = React.useState<Selection>(new Set([]));
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [endpointFilter, setEndpointFilter] = React.useState("all");
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [page, setPage] = React.useState(1);
  const [deleteModalTunnel, setDeleteModalTunnel] = React.useState<Tunnel | null>(null);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  
  // 使用共用的隧道操作 hook
  const { toggleStatus, restart, deleteTunnel } = useTunnelActions();

  // 隧道数据状态，支持动态更新
  const [tunnels, setTunnels] = React.useState<Tunnel[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // 获取隧道列表
  const fetchTunnels = async () => {
    try {
      setLoading(true);
      setError(null); // 清除之前的错误
      const response = await fetch('/api/tunnels');
      if (!response.ok) throw new Error('获取隧道列表失败');
      const data = await response.json();
      setTunnels(data);
    } catch (error) {
      console.error('获取隧道列表失败:', error);
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      setError(errorMessage);
      addToast({
        title: "获取隧道列表失败",
        description: errorMessage,
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  React.useEffect(() => {
    fetchTunnels();
  }, []);

  const columns = [
    { key: "type", label: "类型" },
    { key: "name", label: "名称" },
    { key: "endpoint", label: "端点" },
    { key: "tunnelAddress", label: "隧道地址" },
    { key: "targetAddress", label: "目标地址" },
    { key: "status", label: "状态" },
    { key: "actions", label: "操作" },
  ];

  // 更新隧道状态的函数
  const handleStatusChange = (tunnelId: string, isRunning: boolean) => {
    setTunnels(prev => prev.map(tunnel => 
      tunnel.id === tunnelId 
        ? {
            ...tunnel,
            status: {
              type: isRunning ? "success" as const : "danger" as const,
              text: isRunning ? "运行中" : "已停止"
            }
          }
        : tunnel
    ));
  };

  // 删除隧道的函数
  const handleDeleteTunnel = (tunnelId: string) => {
    setTunnels(prev => prev.filter(tunnel => tunnel.id !== tunnelId));
  };

  // 操作按钮处理函数
  const handleToggleStatus = (tunnel: any) => {
    if (!tunnel.instanceId) {
      alert('此隧道缺少NodePass ID，无法执行操作');
      return;
    }
    const isRunning = tunnel.status.type === "success";
    toggleStatus(isRunning, {
      instanceId: tunnel.instanceId,
      tunnelId: tunnel.id,
      tunnelName: tunnel.name,
      onStatusChange: (tunnelId, newStatus) => {
        // 更新状态
        handleStatusChange(tunnelId, newStatus);
        // 刷新列表
        fetchTunnels();
      },
    });
  };

  const handleRestart = (tunnel: any) => {
    if (!tunnel.instanceId) {
      alert('此隧道缺少NodePass ID，无法执行操作');
      return;
    }
    restart({
      instanceId: tunnel.instanceId,
      tunnelId: tunnel.id,
      tunnelName: tunnel.name,
      onStatusChange: (tunnelId, newStatus) => {
        // 更新状态
        handleStatusChange(tunnelId, newStatus);
        // 刷新列表
        fetchTunnels();
      },
    });
  };

  const handleDeleteClick = (tunnel: any) => {
    setDeleteModalTunnel(tunnel);
    onOpen();
  };

  const confirmDelete = () => {
    if (deleteModalTunnel) {
      if (!deleteModalTunnel.instanceId) {
        addToast({
          title: "删除失败",
          description: "此隧道缺少 NodePass ID，无法执行删除操作",
          color: "danger",
        });
        onOpenChange();
        return;
      }

      deleteTunnel({
        tunnelId: deleteModalTunnel.id,
        instanceId: deleteModalTunnel.instanceId,
        tunnelName: deleteModalTunnel.name,
        redirectAfterDelete: false,
        onSuccess: () => {
          // 删除成功后刷新列表
          fetchTunnels();
        }
      });
    }
    onOpenChange();
  };

  const filteredItems = React.useMemo(() => {
    let filtered = [...tunnels];

    if (filterValue) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(filterValue.toLowerCase()) ||
        item.tunnelAddress.toLowerCase().includes(filterValue.toLowerCase()) ||
        item.targetAddress.toLowerCase().includes(filterValue.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(item => {
        switch (statusFilter) {
          case "running":
            return item.status.type === "success";
          case "stopped":
            return item.status.type === "danger";
          case "error":
            return item.status.type === "warning";
          default:
            return true;
        }
      });
    }

    if (endpointFilter !== "all") {
      filtered = filtered.filter(item => {
        return item.endpointId === endpointFilter;
      });
    }

    return filtered;
  }, [tunnels, filterValue, statusFilter, endpointFilter]);

  const pages = Math.ceil(filteredItems.length / rowsPerPage);
  const items = React.useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    return filteredItems.slice(start, end);
  }, [page, filteredItems, rowsPerPage]);

  const renderCell = React.useCallback((tunnel: Tunnel, columnKey: React.Key) => {
    switch (columnKey) {
      case "type":
        return (
          <Chip 
            variant="flat" 
            color={tunnel.type === "服务器" ? "primary" : "secondary"}
            size="sm"
            classNames={{
              base: "text-xs md:text-sm"
            }}
          >
            {tunnel.type}
          </Chip>
        );
      case "name":
        return (
          <Box className="text-xs md:text-sm font-semibold truncate max-w-[120px] md:max-w-none">{tunnel.name}</Box>
        );
      case "endpoint":
        return (
          <Chip 
            variant="bordered" 
            color="default"
            size="sm"
            classNames={{
              base: "text-xs md:text-sm max-w-[100px] md:max-w-none",
              content: "truncate"
            }}
          >
            {tunnel.endpoint}
          </Chip>
        );
      case "tunnelAddress":
        return (
          <Box className="text-xs md:text-sm text-default-600 font-mono truncate max-w-[150px] md:max-w-none" title={tunnel.tunnelAddress}>
            {tunnel.tunnelAddress}
          </Box>
        );
      case "targetAddress":
        return (
          <Box className="text-xs md:text-sm text-default-600 font-mono truncate max-w-[150px] md:max-w-none" title={tunnel.targetAddress}>
            {tunnel.targetAddress}
          </Box>
        );
      case "status":
        return (
          <Chip 
            variant="flat"
            color={tunnel.status.type}
            size="sm"
            classNames={{
              base: "text-xs md:text-sm"
            }}
          >
            {tunnel.status.text}
          </Chip>
        );
      case "actions":
        return (
          <div className="flex justify-center gap-1">
            <Button
              isIconOnly
              variant="light"
              size="sm"
              color="primary"
              onClick={() => router.push(`/tunnels/${tunnel.id}`)}
              startContent={<FontAwesomeIcon icon={faEye} className="text-xs" />}
            />
            <Button
              isIconOnly
              variant="light"
              size="sm"
              color={tunnel.status.type === "success" ? "warning" : "success"}
              onClick={() => handleToggleStatus(tunnel)}
              startContent={<FontAwesomeIcon icon={tunnel.status.type === "success" ? faPause : faPlay} className="text-xs" />}
            />
            <Button
              isIconOnly
              variant="light"
              size="sm"
              color="primary"
              onClick={() => handleRestart(tunnel)}
              isDisabled={tunnel.status.type !== "success"}
              startContent={<FontAwesomeIcon icon={faRotateRight} className="text-xs" />}
            />
            <Button
              isIconOnly
              variant="light"
              size="sm"
              color="danger"
              onClick={() => handleDeleteClick(tunnel)}
              startContent={<FontAwesomeIcon icon={faTrash} className="text-xs" />}
            />
          </div>
        );
      default:
        const value = tunnel[columnKey as keyof Tunnel];
        if (typeof value === 'object' && value !== null && 'text' in value) {
          return value.text;
        }
        return value;
    }
  }, [router, handleToggleStatus, handleRestart, handleDeleteClick]);

  const onSearchChange = React.useCallback((value?: string) => {
    if (value) {
      setFilterValue(value);
      setPage(1);
    } else {
      setFilterValue("");
    }
  }, []);

  const onClear = React.useCallback(() => {
    setFilterValue("");
    setPage(1);
  }, []);

  const onStatusFilterChange = React.useCallback((status: string) => {
    setStatusFilter(status);
    setPage(1);
  }, []);

  const onEndpointFilterChange = React.useCallback((endpointId: string) => {
    setEndpointFilter(endpointId);
    setPage(1);
  }, []);

  return (
    <>
      <div className="p-4 md:p-0">
        <Flex direction="col" className="border border-default-200 rounded-lg transition-all duration-300 hover:shadow-sm">
          <TunnelToolBox 
            filterValue={filterValue}
            statusFilter={statusFilter}
            endpointFilter={endpointFilter}
            loading={loading}
            onSearchChange={onSearchChange}
            onClear={onClear}
            onStatusFilterChange={onStatusFilterChange}
            onEndpointFilterChange={onEndpointFilterChange}
          />
          <Box className="w-full overflow-hidden">
            {/* 移动端：使用卡片布局 */}
            <div className="block md:hidden p-4 space-y-3">
              {loading ? (
                <div className="flex justify-center items-center py-16">
                  <div className="flex flex-col items-center gap-4">
                    <Spinner size="lg" />
                    <p className="text-default-500 text-sm">加载中...</p>
                  </div>
                </div>
              ) : error ? (
                <div className="text-center py-12">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-danger-50 flex items-center justify-center">
                      <FontAwesomeIcon icon={faRotateRight} className="text-2xl text-danger" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-danger text-sm font-medium">加载失败</p>
                      <p className="text-default-400 text-xs">{error}</p>
                    </div>
                    <Button 
                      color="danger" 
                      variant="flat" 
                      size="sm"
                      startContent={<FontAwesomeIcon icon={faRotateRight} />}
                      onClick={fetchTunnels}
                    >
                      重试
                    </Button>
                  </div>
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-default-100 flex items-center justify-center">
                      <FontAwesomeIcon icon={faEye} className="text-2xl text-default-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-default-500 text-sm font-medium">暂无隧道实例</p>
                      <p className="text-default-400 text-xs">您还没有创建任何隧道实例</p>
                    </div>
                  </div>
                </div>
              ) : (
                items.map((tunnel) => (
                  <div key={tunnel.id} className="border border-default-200 rounded-lg p-3 space-y-2 bg-background">
                    {/* 头部：名称和状态 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Chip 
                          variant="flat" 
                          color={tunnel.type === "服务器" ? "primary" : "secondary"}
                          size="sm"
                          className="text-xs"
                        >
                          {tunnel.type}
                        </Chip>
                        <span className="font-semibold text-sm truncate">{tunnel.name}</span>
                      </div>
                      <Chip 
                        variant="flat"
                        color={tunnel.status.type}
                        size="sm"
                        className="text-xs"
                      >
                        {tunnel.status.text}
                      </Chip>
                    </div>

                    {/* 端点信息 */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-default-500 w-12 flex-shrink-0">端点:</span>
                        <Chip 
                          variant="bordered" 
                          color="default"
                          size="sm"
                          className="text-xs"
                        >
                          {tunnel.endpoint}
                        </Chip>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-default-500 w-12 flex-shrink-0">隧道:</span>
                        <span className="text-xs font-mono text-default-600 truncate">{tunnel.tunnelAddress}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-default-500 w-12 flex-shrink-0">目标:</span>
                        <span className="text-xs font-mono text-default-600 truncate">{tunnel.targetAddress}</span>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex justify-end gap-1 pt-2 border-t border-default-100">
                      <Button
                        isIconOnly
                        variant="light"
                        size="sm"
                        color="primary"
                        onClick={() => router.push(`/tunnels/${tunnel.id}`)}
                        startContent={<FontAwesomeIcon icon={faEye} className="text-xs" />}
                      />
                      <Button
                        isIconOnly
                        variant="light"
                        size="sm"
                        color={tunnel.status.type === "success" ? "warning" : "success"}
                        onClick={() => handleToggleStatus(tunnel)}
                        startContent={<FontAwesomeIcon icon={tunnel.status.type === "success" ? faPause : faPlay} className="text-xs" />}
                      />
                      <Button
                        isIconOnly
                        variant="light"
                        size="sm"
                        color="primary"
                        onClick={() => handleRestart(tunnel)}
                        isDisabled={tunnel.status.type !== "success"}
                        startContent={<FontAwesomeIcon icon={faRotateRight} className="text-xs" />}
                      />
                      <Button
                        isIconOnly
                        variant="light"
                        size="sm"
                        color="danger"
                        onClick={() => handleDeleteClick(tunnel)}
                        startContent={<FontAwesomeIcon icon={faTrash} className="text-xs" />}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 桌面端：使用表格布局 */}
            <div className="hidden md:block">
              <Table
                shadow="none"
                aria-label="隧道实例表格"
                className="min-w-full"
                selectionMode="multiple"
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
                classNames={{
                  th: "text-xs md:text-sm",
                  td: "py-3"
                }}
              >
                <TableHeader columns={columns}>
                  {(column) => (
                    <TableColumn
                      key={column.key}
                      hideHeader={column.key === "actions"}
                      align={column.key === "actions" ? "center" : "start"}
                    >
                      {column.label}
                    </TableColumn>
                  )}
                </TableHeader>
                <TableBody 
                  items={items}
                  isLoading={loading}
                  loadingContent={
                    <div className="flex justify-center items-center py-16">
                      <div className="flex flex-col items-center gap-4">
                        <Spinner size="lg" />
                        <p className="text-default-500">加载中...</p>
                      </div>
                    </div>
                  }
                  emptyContent={
                    error ? (
                      <div className="text-center py-16">
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-20 h-20 rounded-full bg-danger-50 flex items-center justify-center">
                            <FontAwesomeIcon icon={faRotateRight} className="text-3xl text-danger" />
                          </div>
                          <div className="space-y-2">
                            <p className="text-danger text-base font-medium">加载失败</p>
                            <p className="text-default-400 text-sm">{error}</p>
                          </div>
                          <Button 
                            color="danger" 
                            variant="flat"
                            startContent={<FontAwesomeIcon icon={faRotateRight} />}
                            onClick={fetchTunnels}
                          >
                            重试
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-16">
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-20 h-20 rounded-full bg-default-100 flex items-center justify-center">
                            <FontAwesomeIcon icon={faEye} className="text-3xl text-default-400" />
                          </div>
                          <div className="space-y-2">
                            <p className="text-default-500 text-base font-medium">暂无隧道实例</p>
                            <p className="text-default-400 text-sm">您还没有创建任何隧道实例</p>
                          </div>
                        </div>
                      </div>
                    )
                  }
                >
                  {(item) => (
                    <TableRow key={item.id}>
                      {(columnKey) => (
                        <TableCell>{renderCell(item, columnKey)}</TableCell>
                      )}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Box>
          
          {/* 分页器 - 响应式优化 */}
          <Flex justify="between" align="center" className="w-full px-3 md:px-4 py-3 gap-2 md:gap-4 flex-col sm:flex-row">
            <Box className="text-xs md:text-sm text-default-500 order-2 sm:order-1">
              {loading ? (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" />
                  <span>统计中...</span>
                </div>
              ) : (
                `共 ${filteredItems.length} 个实例`
              )}
            </Box>
            <div className="order-1 sm:order-2">
              {loading ? (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" />
                  <span className="text-sm text-default-500">分页加载中...</span>
                </div>
              ) : pages > 1 ? (
                <Pagination 
                  loop 
                  total={pages} 
                  page={page} 
                  onChange={setPage}
                  size="sm"
                  showControls
                  classNames={{
                    cursor: "text-xs md:text-sm",
                    item: "text-xs md:text-sm"
                  }}
                />
              ) : null}
            </div>
          </Flex>
        </Flex>
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
                {deleteModalTunnel && (
                  <>
                    <p className="text-default-600">
                      您确定要删除实例 <span className="font-semibold text-foreground">"{deleteModalTunnel.name}"</span> 吗？
                    </p>
                    <p className="text-small text-warning">
                      ⚠️ 此操作不可撤销，实例的所有配置和数据都将被永久删除。
                    </p>
                  </>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button 
                  color="danger" 
                  onPress={() => {
                    confirmDelete();
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
    </>
  );
} 