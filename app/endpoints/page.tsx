"use client";

import {
  Button,
  Card,
  CardBody,
  CardFooter,
  Chip,
  Divider,
  Input,
  Link,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Skeleton,
  cn,
  useDisclosure
} from "@heroui/react";
import { useState, useEffect } from "react";

import { addToast } from "@heroui/toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faPlus, 
  faServer, 
  faCheck, 
  faEye, 
  faEdit, 
  faTrash, 
  faEyeSlash,
  faLink,
  faTimesCircle,
  faRotateRight,
  faPlug,
  faPlugCircleXmark,
  faPen,
  faWifi,
  faSpinner,
  faAdd,
  faLightbulb
} from "@fortawesome/free-solid-svg-icons";
import AddEndpointModal from "./components/add-endpoint-modal";
import RenameEndpointModal from "./components/rename-endpoint-modal";
import { Endpoint, EndpointStatus } from '@prisma/client';
import { buildApiUrl } from "@/lib/utils";

interface EndpointWithRelations extends Endpoint {
  tunnelInstances: Array<{
    id: string;
    status: string;
  }>;
  responses: Array<{
    response: string;
  }>;
}

interface FormattedEndpoint extends EndpointWithRelations {
  apiPath: string;
  apiKey: string;
  tunnelCount: number;
  activeInstances: number;
  createdAt: Date;
  updatedAt: Date;
  lastCheck: Date;
  lastResponse: string | null;
}

interface EndpointFormData {
  name: string;
  url: string;
  apiPath: string;
  apiKey: string;
}

export default function EndpointsPage() {
  const [endpoints, setEndpoints] = useState<FormattedEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [deleteModalEndpoint, setDeleteModalEndpoint] = useState<FormattedEndpoint | null>(null);
  const [showApiKey, setShowApiKey] = useState<{[key: string]: boolean}>({});
  const {isOpen: isAddOpen, onOpen: onAddOpen, onOpenChange: onAddOpenChange} = useDisclosure();
  const {isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange} = useDisclosure();
  const {isOpen: isRenameOpen, onOpen: onRenameOpen, onOpenChange: onRenameOpenChange} = useDisclosure();
  const [selectedEndpoint, setSelectedEndpoint] = useState<FormattedEndpoint | null>(null);

  // 获取主控列表
  const fetchEndpoints = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl('/api/endpoints'));
      if (!response.ok) throw new Error('获取主控列表失败');
      const data = await response.json();
      setEndpoints(data);
      
      return data;
    } catch (error) {
      addToast({
        title: "获取主控列表失败",
        description: "请检查网络连接后重试",
        color: "danger",
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  // 应用启动时执行主控列表获取
  useEffect(() => {
    const startupEndpoints = async () => {
      const endpoints = await fetchEndpoints();
    };
    
    startupEndpoints();
  }, []);

  const handleAddEndpoint = async (data: EndpointFormData) => {
    try {
      const response = await fetch(buildApiUrl('/api/endpoints'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('添加主控失败');

      addToast({
        title: "主控添加成功",
        description: `${data.name} 已成功添加到主控列表`,
        color: "success",
      });

      // 刷新主控列表
      fetchEndpoints();
    } catch (error) {
      addToast({
        title: "添加主控失败",
        description: "请检查输入信息后重试",
        color: "danger",
      });
    }
  };

  const handleDeleteClick = (endpoint: FormattedEndpoint) => {
    setDeleteModalEndpoint(endpoint);
    onDeleteOpen();
  };

  const handleDeleteEndpoint = async () => {
    if (!deleteModalEndpoint) return;

    try {
      const response = await fetch(buildApiUrl('/api/endpoints'), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: Number(deleteModalEndpoint.id) }),
      });

      if (!response.ok) throw new Error('删除主控失败');

      addToast({
        title: "主控删除成功",
        description: `${deleteModalEndpoint.name} 已从主控列表中删除`,
        color: "success",
      });

      // 刷新主控列表
      fetchEndpoints();
    } catch (error) {
      addToast({
        title: "删除主控失败",
        description: "请稍后重试",
        color: "danger",
      });
    }
    onDeleteOpenChange();
  };

  const toggleExpanded = (endpointId: number) => {
    setExpandedCard(prev => prev === endpointId ? null : endpointId);
  };

  const toggleApiKeyVisibility = (endpointId: number) => {
    setShowApiKey(prev => ({
      ...prev,
      [endpointId]: !prev[endpointId]
    }));
  };

  const handleReconnect = async (endpointId: number) => {
    try {
      // 调用 PATCH API 进行重连
      const response = await fetch(buildApiUrl('/api/endpoints'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          id: Number(endpointId),
          action: 'reconnect'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '重连失败');
      }

      const result = await response.json();

      addToast({
        title: "重连成功",
        description: result.message || "主控重连请求已发送，正在尝试建立连接...",
        color: "success",
      });

      // 立即刷新主控列表以获取最新状态
      await fetchEndpoints();

    } catch (error) {
      addToast({
        title: "重连失败",
        description: error instanceof Error ? error.message : "重连请求失败，请稍后重试",
        color: "danger",
      });
    }
  };

  const handleConnect = async (endpointId: number) => {
    try {
      // 调用 PATCH API 进行连接
      const response = await fetch(buildApiUrl('/api/endpoints'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          id: Number(endpointId),
          action: 'reconnect'  // 使用reconnect来建立连接
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '连接失败');
      }

      const result = await response.json();

      addToast({
        title: "连接成功",
        description: result.message || "主控连接请求已发送，正在尝试建立连接...",
        color: "success",
      });

      // 立即刷新主控列表以获取最新状态
      await fetchEndpoints();

    } catch (error) {
      addToast({
        title: "连接失败",
        description: error instanceof Error ? error.message : "连接请求失败，请稍后重试",
        color: "danger",
      });
    }
  };

  const handleDisconnect = async (endpointId: number) => {
    try {
      // 调用 PATCH API 进行断开连接
      const response = await fetch(buildApiUrl('/api/endpoints'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          id: Number(endpointId),
          action: 'disconnect'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '断开连接失败');
      }

      const result = await response.json();

      addToast({
        title: "断开连接成功",
        description: result.message || "主控连接已断开",
        color: "success",
      });

      // 立即刷新主控列表以获取最新状态
      await fetchEndpoints();

    } catch (error) {
      addToast({
        title: "断开连接失败",
        description: error instanceof Error ? error.message : "断开连接失败，请稍后重试",
        color: "danger",
      });
    }
  };

  // 获取主控状态相关信息（直接从数据库数据）
  const getEndpointDisplayData = (endpoint: FormattedEndpoint) => {
    return {
      status: endpoint.status,
      tunnelCount: endpoint.tunnelCount || 0,
      canRetry: endpoint.status === EndpointStatus.FAIL
    };
  };

  const getEndpointContent = (endpoint: FormattedEndpoint, isExpanded: boolean) => {
    const realTimeData = getEndpointDisplayData(endpoint);
    
    if (isExpanded) {
      return (
        <div className="h-full w-full items-start justify-center overflow-scroll px-4 pb-24 pt-8">
          <div className="space-y-4">
            <div>
              <label className="text-small text-default-500 mb-2 block">URL 地址</label>
              <Input
                value={endpoint.url}
                isReadOnly
                variant="bordered"
                size="sm"
              />
            </div>
            <div>
              <label className="text-small text-default-500 mb-2 block">API 前缀</label>
              <Input
                value={endpoint.apiPath}
                isReadOnly
                variant="bordered"
                size="sm"
              />
            </div>
            <div>
              <label className="text-small text-default-500 mb-2 block">API Key</label>
              <Input
                value={endpoint.apiKey}
                isReadOnly
                variant="bordered"
                size="sm"
                type={showApiKey[endpoint.id] ? "text" : "password"}
              />
            </div>
            
            {/* 连接状态和操作 */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-small text-default-500">连接状态:</span>
                <Chip
                  size="sm"
                  variant="flat"
                  color={
                    realTimeData.status === EndpointStatus.ONLINE ? 'success' : 
                    realTimeData.status === EndpointStatus.FAIL ? 'danger' : 'warning'
                  }
                  startContent={
                    <FontAwesomeIcon 
                      icon={
                        realTimeData.status === EndpointStatus.ONLINE ? faLink : 
                        realTimeData.status === EndpointStatus.FAIL ? faPlugCircleXmark : faTimesCircle
                      } 
                      className="text-xs"
                    />
                  }
                >
                  {realTimeData.status === EndpointStatus.ONLINE ? '在线' : 
                   realTimeData.status === EndpointStatus.FAIL ? '异常' : '离线'}
                </Chip>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-small text-default-500">实例数量:</span>
                <Chip size="sm" variant="flat" color="primary">
                  {realTimeData.tunnelCount} 个
                </Chip>
              </div>

              {/* 显示失败状态提示 */}
              {realTimeData.status === EndpointStatus.FAIL && (
                <div className="p-2 bg-danger-50 rounded-lg">
                  <p className="text-tiny text-danger-600">主控连接失败，已停止重试</p>
                </div>
              )}
            </div>
            
            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="bordered" startContent={<FontAwesomeIcon icon={faEdit} />}>
                编辑
              </Button>
              <Button size="sm" variant="bordered" startContent={<FontAwesomeIcon icon={faEye} />}>
                查看实例
              </Button>
              {realTimeData.canRetry && (
                <Button 
                  size="sm" 
                  variant="bordered" 
                  color="primary"
                  startContent={<FontAwesomeIcon icon={faRotateRight} />}
                  onPress={() => handleReconnect(endpoint.id)}
                >
                  重新连接
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between h-full w-full">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon 
              icon={faCheck} 
              className={
                realTimeData.status === EndpointStatus.ONLINE ? "text-success-600" : 
                realTimeData.status === EndpointStatus.FAIL ? "text-danger-600" : "text-warning-600"
              } 
            />
          <p className="text-small text-default-500">
            {realTimeData.tunnelCount ? `${realTimeData.tunnelCount} 个实例` : "0 个实例"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <div
            className={cn(
              "inline-flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-colors",
              realTimeData.status === EndpointStatus.ONLINE 
                ? "text-warning hover:bg-warning/10" 
                : "text-success hover:bg-success/10"
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (realTimeData.status === EndpointStatus.ONLINE) {
                handleDisconnect(endpoint.id);
              } else {
                handleConnect(endpoint.id);
              }
            }}
          >
            <FontAwesomeIcon 
              icon={realTimeData.status === EndpointStatus.ONLINE ? faPlugCircleXmark : faPlug} 
              className={realTimeData.status === EndpointStatus.ONLINE ? "text-warning" : "text-success"}
            />
          </div>
          <div
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer text-danger hover:bg-danger/10 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteClick(endpoint);
            }}
          >
            <FontAwesomeIcon icon={faTrash} />
          </div>
        </div>
      </div>
    );
  };

  const handleCardClick = (endpoint: FormattedEndpoint) => {
    setSelectedEndpoint(endpoint);
    onRenameOpen();
  };

  const handleRename = async (newName: string) => {
    if (!selectedEndpoint?.id) return;

    try {
      const response = await fetch(buildApiUrl('/api/endpoints'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: Number(selectedEndpoint.id),
          name: newName,
          action: 'rename'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '重命名失败');
      }

      addToast({
        title: "重命名成功",
        description: `主控名称已更新为 "${newName}"`,
        color: "success",
      });

      // 刷新主控列表
      fetchEndpoints();
    } catch (error) {
      addToast({
        title: "重命名失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        color: "danger",
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">API 主控管理</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          // Skeleton 加载状态
          Array.from({ length: 6 }, (_, index) => (
            <Card 
              key={index} 
              className="relative w-full h-[200px]"
            >
              {/* 状态按钮 Skeleton */}
              <div className="absolute right-4 top-6 z-10">
                <Skeleton className="h-8 w-12 rounded-full" />
              </div>

              {/* 主要内容区域 Skeleton */}
              <CardBody className="relative h-[140px] bg-gradient-to-br from-content1 to-default-100/50 p-6">
                <div className="flex items-center gap-3 mb-2 pr-20">
                  <Skeleton className="h-8 w-32 rounded-lg" />
                  <Skeleton className="h-6 w-16 rounded-lg" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-4 h-4 rounded" />
                    <Skeleton className="h-4 w-48 rounded-lg" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-4 h-4 rounded" />
                    <Skeleton className="h-4 w-60 rounded-lg" />
                  </div>
                </div>
              </CardBody>

              {/* 底部详情区域 Skeleton */}
              <CardFooter className="absolute bottom-0 h-[60px] bg-content1 px-6 border-t-1 border-default-100">
                <div className="flex items-center justify-between h-full w-full">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-4 h-4 rounded" />
                    <Skeleton className="h-4 w-16 rounded-lg" />
                  </div>
                  <Skeleton className="w-8 h-8 rounded" />
                </div>
              </CardFooter>
            </Card>
          ))
        ) : (
          endpoints.map(endpoint => {
            const isExpanded = expandedCard === endpoint.id;
            const realTimeData = getEndpointDisplayData(endpoint);
            
            return (
              <Card 
                key={endpoint.id} 
                className="relative w-full h-[200px]"
                isPressable
                onPress={() => handleCardClick(endpoint)}
              >
                {/* 状态按钮 */}
                <div
                  className="absolute right-4 top-6 z-10"
                >
                  <Chip
                    radius="full"
                    variant="flat"
                    color={
                      realTimeData.status === EndpointStatus.ONLINE ? "success" : 
                      realTimeData.status === EndpointStatus.FAIL ? "danger" : "warning"
                    }
                  >
                    {realTimeData.status === EndpointStatus.ONLINE ? "在线" : 
                     realTimeData.status === EndpointStatus.FAIL ? "异常" : "离线"}
                  </Chip>
                </div>

                {/* 主要内容区域 */}
                <CardBody className="relative h-[140px] bg-gradient-to-br from-content1 to-default-100/50 p-6">
                  <div className="flex items-center gap-3 mb-2 pr-20">
                    <h2 className="inline bg-gradient-to-br from-foreground-800 to-foreground-500 bg-clip-text text-2xl font-semibold tracking-tight text-transparent dark:to-foreground-200">
                      {endpoint.name}
                    </h2>
                    <span className="inline-flex items-center px-2 py-1 text-xs font-normal rounded-md bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      {endpoint.apiPath}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-default-400">
                      <FontAwesomeIcon icon={faServer} />
                      <span className="text-small truncate">{endpoint.url}</span>
                    </div>
                    <div className="flex items-center gap-2 text-default-400">
                      <FontAwesomeIcon 
                        icon={showApiKey[endpoint.id] ? faEyeSlash : faEye} 
                        className="text-xs cursor-pointer hover:text-primary w-4"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleApiKeyVisibility(endpoint.id);
                        }}
                      />
                      <span className="text-small font-mono flex-1 truncate">
                        {showApiKey[endpoint.id] ? endpoint.apiKey : "••••••••••••••••••••••••••"}
                      </span>
                    </div>
                  </div>
                </CardBody>

                {/* 底部详情区域 */}
                <CardFooter
                  className={cn(
                    "absolute bottom-0 h-[60px] overflow-visible bg-content1 px-6 duration-300 ease-in-out transition-all",
                    {
                      "h-full": isExpanded,
                      "border-t-1 border-default-100": !isExpanded,
                    },
                  )}
                >
                  {getEndpointContent(endpoint, isExpanded)}
                </CardFooter>
              </Card>
            );
          })
        )}

        {/* 添加主控卡片 - 仅在非加载状态下显示 */}
        {!loading && (
          <Card 
            className="relative w-full h-[200px] cursor-pointer hover:shadow-lg transition-shadow border-2 border-dashed border-default-300 hover:border-primary"
            isPressable
            onPress={() => onAddOpen()}
          >
            <CardBody className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-default-50 to-default-100/50 p-6">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
                  <FontAwesomeIcon icon={faPlus} className="text-xl text-primary" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-default-700 mb-1">添加 API 主控</h3>
                  <p className="text-small text-default-500">点击添加新的主控配置</p>
                </div>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      {/* 添加主控模态框 */}
      <AddEndpointModal
        isOpen={isAddOpen}
        onOpenChange={onAddOpenChange}
        onAdd={handleAddEndpoint}
      />

      {/* 重命名模态框 */}
      {selectedEndpoint && (
        <RenameEndpointModal
          isOpen={isRenameOpen}
          onOpenChange={onRenameOpenChange}
          onRename={handleRename}
          currentName={selectedEndpoint.name}
        />
      )}

      {/* 删除确认模态框 */}
      <Modal isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange} placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faTrash} className="text-danger" />
                  确认删除主控
                </div>
              </ModalHeader>
              <ModalBody>
                {deleteModalEndpoint && (
                  <>
                    <p className="text-default-600">
                      您确定要删除主控 <span className="font-semibold text-foreground">"{deleteModalEndpoint.name}"</span> 吗？
                    </p>
                    <p className="text-small text-warning">
                      ⚠️ 此操作不可撤销，主控的所有配置都将被永久删除。
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
                    handleDeleteEndpoint();
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
    </div>
  );
} 