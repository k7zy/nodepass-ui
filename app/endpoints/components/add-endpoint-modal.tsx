"use client";

import {
  Avatar,
  Badge,
  Button,
  Form,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader
} from "@heroui/react";
import React, { useState } from "react";

import { addToast } from "@heroui/toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faServer, faPen, faWifi, faSpinner, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { NodePassAPI } from "@/lib/api";

interface EndpointFormData {
  name: string;
  url: string;
  apiPath: string;
  apiKey: string;
}

interface AddEndpointModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  onAdd?: (data: EndpointFormData) => Promise<void>;
}

export default function AddEndpointModal({ 
  isOpen, 
  onOpenChange, 
  onAdd 
}: AddEndpointModalProps) {
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [formData, setFormData] = useState<EndpointFormData>({
    name: '',
    url: '',
    apiPath: '/api',
    apiKey: ''
  });

  const handleInputChange = (field: keyof EndpointFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 测试连接功能
  const testConnection = async () => {
    if (!formData.url || !formData.apiPath || !formData.apiKey) {
      addToast({
        title: "参数不完整",
        description: "请先填写完整的 URL、API 前缀和 API Key",
        color: "warning",
      });
      return;
    }

    setIsTestingConnection(true);

    try {
      // 创建临时的 API 实例
      const tempAPI = new NodePassAPI(formData.apiKey, formData.url, formData.apiPath);
      
      // 测试连接（10秒超时）
      await tempAPI.testConnection(10000);

      addToast({
        title: "连接测试成功",
        description: "端点连接正常，可以正常接收 SSE 事件",
        color: "success",
      });

    } catch (error) {
      addToast({
        title: "连接测试失败",
        description: error instanceof Error ? error.message : '连接失败，请检查配置是否正确',
        color: "danger",
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formDataObj = new FormData(event.target as HTMLFormElement);
    const data = Object.fromEntries(formDataObj.entries()) as any;

    if (onAdd) {
      await onAdd(data);
    }
    
    // 重置表单
    setFormData({
      name: '',
      url: '',
      apiPath: '/api/v1',
      apiKey: ''
    });
    
    onOpenChange(); // 关闭模态框
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onOpenChange}
      size="2xl"
      placement="center"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              添加 API 端点
            </ModalHeader>
            <ModalBody className="px-6 pb-6">
              <div className="flex flex-col items-start">
                <p className="text-large font-semibold">端点配置</p>
                <div className="flex gap-4 py-4">
                  <Badge
                    showOutline
                    classNames={{
                      badge: "w-5 h-5",
                    }}
                    color="primary"
                    content={
                      <Button
                        isIconOnly
                        className="p-0 text-primary-foreground"
                        radius="full"
                        size="sm"
                        variant="light"
                      >
                        <FontAwesomeIcon icon={faPen} className="text-xs" />
                      </Button>
                    }
                    placement="bottom-right"
                    shape="circle"
                  >
                    <Avatar 
                      className="h-14 w-14 bg-primary-100" 
                      icon={<FontAwesomeIcon icon={faServer} className="text-primary" />}
                    />
                  </Badge>
                  <div className="flex flex-col items-start justify-center">
                    <p className="font-medium">新建 API 端点</p>
                    <span className="text-small text-default-500">用于管理隧道实例</span>
                  </div>
                </div>
                <p className="text-small text-default-400 mb-6">
                  配置新的 API 端点以连接和管理您的隧道实例。请确保所有信息准确无误。
                </p>
              </div>

              <Form validationBehavior="native" onSubmit={handleSubmit}>
                <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
                  {/* 端点名称 */}
                  <Input
                    isRequired
                    name="name"
                    label="端点名称"
                    labelPlacement="outside"
                    placeholder="主服务器"
                    maxLength={30}
                    description="端点的显示名称"
                    value={formData.name}
                    onValueChange={(value) => handleInputChange('name', value)}
                  />
                  {/* URL 地址 */}
                  <Input
                    isRequired
                    name="url"
                    label="URL 地址"
                    labelPlacement="outside"
                    placeholder="http://example.com:9090"
                    type="url"
                    description="API 服务器的完整 URL"
                    value={formData.url}
                    onValueChange={(value) => handleInputChange('url', value)}
                  />
                  {/* API 前缀 */}
                  <Input
                    isRequired
                    name="apiPath"
                    label="API 前缀"
                    labelPlacement="outside"
                    placeholder="/api"
                    endContent={
                      <div className="pointer-events-none flex items-center">
                        <span className="text-default-400 text-small">/v1</span>
                      </div>
                    }
                    description="API 路径前缀"
                    value={formData.apiPath}
                    onValueChange={(value) => handleInputChange('apiPath', value)}
                  />
                  {/* API Key */}
                  <Input
                    isRequired
                    name="apiKey"
                    label="API Key"
                    labelPlacement="outside"
                    placeholder="输入您的 API Key"
                    type={showApiKey ? "text" : "password"}
                    maxLength={100}
                    description="用于身份验证的密钥"
                    value={formData.apiKey}
                    onValueChange={(value) => handleInputChange('apiKey', value)}
                    endContent={
                      <Button
                        isIconOnly
                        variant="light"
                        size="sm"
                        onPress={() => setShowApiKey(!showApiKey)}
                        className="text-default-400 hover:text-primary"
                      >
                        <FontAwesomeIcon 
                          icon={showApiKey ? faEyeSlash : faEye} 
                          className="text-sm"
                        />
                      </Button>
                    }
                  />
                </div>

                <div className="mt-6 flex w-full justify-end gap-2">
                  <Button 
                    radius="full" 
                    variant="bordered"
                    onPress={onClose}
                  >
                    取消
                  </Button>
                  <Button
                    radius="full"
                    variant="bordered"
                    color="primary"
                    isLoading={isTestingConnection}
                    onPress={testConnection}
                    startContent={
                      !isTestingConnection && <FontAwesomeIcon icon={faWifi} />
                    }
                  >
                    {isTestingConnection ? "检测中..." : "检测连接"}
                  </Button>
                  <Button 
                    color="primary" 
                    radius="full" 
                    type="submit"
                  >
                    添加端点
                  </Button>
                </div>
              </Form>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
} 