"use client";

import {
  Card,
  CardBody,
  Button,
  Input,
  Select,
  SelectItem,
  Chip,
} from "@heroui/react";
import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faLayerGroup,
  faPlus,
  faArrowRight,
  faShield,
  faWifi,
  faHdd,
} from "@fortawesome/free-solid-svg-icons";
import { buildApiUrl } from '@/lib/utils';

import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  Node,
  Edge,
  NodeTypes,
  EdgeTypes,
  ConnectionLineType,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface SimpleEndpoint {
  id: number;
  name: string;
  url: string;
  apiPath: string;
  status: 'ONLINE' | 'OFFLINE' | 'FAIL';
  tunnelCount: number;
}

interface TunnelMode {
  id: string;
  title: string;
  description: string;
  icon: any;
  color: string;
}

interface FormData {
  userPort: string;
  masterServer: string;
  listenType: string;
  targetIp: string;
  targetPort: string;
  targetMaster: string;
  targetMasterPort: string;
  tlsLevel: string;
  logLevel: string;
  connectionPort: string;
}

// 自定义节点组件
const FlowNodeComponent = ({ data }: { data: any }) => {
  const { 
    label, 
    type, 
    icon, 
    color, 
    formFields, 
    onFieldChange, 
    formData, 
    endpoints, 
    extractHostFromUrl 
  } = data;

  const getNodeBgClass = () => {
    switch (color) {
      case 'primary': return 'bg-primary bg-opacity-10 border-primary border-2';
      case 'warning': return 'bg-warning bg-opacity-10 border-warning border-2';
      case 'success': return 'bg-success bg-opacity-10 border-success border-2';
      default: return 'bg-default bg-opacity-10 border-default border-2';
    }
  };

  const getNodeTextClass = () => {
    switch (color) {
      case 'primary': return 'text-primary';
      case 'warning': return 'text-warning';
      case 'success': return 'text-success';
      default: return 'text-default';
    }
  };

  return (
    <div className="min-w-[200px]">
      {/* 节点图标和标题 */}
      <div className="flex flex-col items-center mb-4">
        <div className={`w-16 h-16 rounded-lg flex items-center justify-center shadow-lg ${getNodeBgClass()}`}>
          <FontAwesomeIcon icon={icon} className={`text-xl ${getNodeTextClass()}`} />
        </div>
        <div className="mt-2">
          <Chip color={color as any} variant="flat" className="font-bold text-xs">
            {label}
          </Chip>
        </div>
      </div>

      {/* 表单字段 */}
      <Card className="w-full">
        <CardBody className="p-3 space-y-2">
          {formFields?.map((field: any, index: number) => (
            <div key={index}>
              {field.type === 'select' ? (
                <Select
                  label={field.label}
                  placeholder={field.placeholder}
                  selectedKeys={field.value ? [field.value] : []}
                  onSelectionChange={(keys) => {
                    const selectedValue = Array.from(keys)[0] as string;
                    onFieldChange(field.key, selectedValue || '');
                  }}
                  size="sm"
                  color={color as any}
                  className="text-xs"
                >
                  {field.options?.map((option: any) => (
                    <SelectItem 
                      key={option.value}
                      isDisabled={option.disabled}
                      className="text-xs"
                    >
                      {option.label}
                    </SelectItem>
                  )) || []}
                </Select>
              ) : (
                <Input
                  type={field.type === 'readonly' ? 'text' : (field.type || 'text')}
                  label={field.label}
                  placeholder={field.placeholder}
                  value={field.value}
                  onChange={(e) => onFieldChange(field.key, e.target.value)}
                  size="sm"
                  color={color as any}
                  isReadOnly={field.type === 'readonly'}
                  className="text-xs"
                />
              )}
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
};

// 自定义边标签组件
const EdgeLabelComponent = ({ data }: { data: any }) => {
  return (
    <div className="bg-white px-2 py-1 rounded shadow-sm border text-xs font-medium text-default-600">
      {data.label}
    </div>
  );
};

// 连接配置组件（双端转发专用）
const ConnectionConfigComponent = ({ data }: { data: any }) => {
  const { formData, onFieldChange, tlsLevels, logLevels } = data;
  
  return (
    <div className="bg-white rounded-lg border-2 border-dashed border-warning shadow-lg p-3 min-w-[180px]">
      <div className="text-center mb-2">
        <Chip color="warning" variant="flat" size="sm" className="font-bold">
          NodePass连接池
        </Chip>
      </div>
      <div className="space-y-2">
        <Select
          label="TLS"
          placeholder="选择TLS级别"
          selectedKeys={formData.tlsLevel ? [formData.tlsLevel] : []}
          onSelectionChange={(keys) => {
            const selectedValue = Array.from(keys)[0] as string;
            onFieldChange('tlsLevel', selectedValue || '');
          }}
          size="sm"
          color="warning"
          className="text-xs"
        >
          {tlsLevels.map((level: any) => (
            <SelectItem key={level.value} className="text-xs">
              {level.label}
            </SelectItem>
          ))}
        </Select>
        <Input
          label="连接端口"
          placeholder="填入"
          value={formData.connectionPort}
          onChange={(e) => onFieldChange('connectionPort', e.target.value)}
          size="sm"
          color="warning"
          className="text-xs"
        />
      </div>
    </div>
  );
};

const nodeTypes: NodeTypes = {
  flowNode: FlowNodeComponent,
  connectionConfig: ConnectionConfigComponent,
};

const edgeTypes: EdgeTypes = {
  customEdge: EdgeLabelComponent,
};

// 静态数据定义
const tlsLevels = [
  { value: '0', label: 'TLS 0 - 无加密' },
  { value: '1', label: 'TLS 1 - 自签名证书' },
  { value: '2', label: 'TLS 2 - 自定义证书' }
];

const logLevels = [
  { value: 'error', label: 'Error' },
  { value: 'warn', label: 'Warning' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug' }
];

const listenTypes = [
  { value: 'external', label: '对外 - 允许外部访问' },
  { value: 'local', label: '本地 - 仅本机访问' }
];

export default function TemplatesPage() {
  const [selectedMode, setSelectedMode] = useState<string>('single');
  const [endpoints, setEndpoints] = useState<SimpleEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const [formData, setFormData] = useState<FormData>({
    userPort: '',
    masterServer: '',
    listenType: 'external',
    targetIp: '',
    targetPort: '',
    targetMaster: '',
    targetMasterPort: '',
    tlsLevel: '1',
    logLevel: 'info',
    connectionPort: '10101',
  });

  // 获取端点列表
  const fetchEndpoints = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl('/api/endpoints/simple?excludeFailed=true'));
      if (!response.ok) throw new Error('获取端点列表失败');
      const data = await response.json();
      setEndpoints(data || []);
    } catch (error) {
      console.error('获取端点列表失败:', error);
      setEndpoints([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEndpoints();
  }, []);

  // 从URL中提取IP/域名
  const extractHostFromUrl = useCallback((url: string): string => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      const match = url.match(/:\/\/([^\/\:]+)/);
      return match ? match[1] : url;
    }
  }, []);

  // 监听类型改变时，自动设置目标IP
  useEffect(() => {
    if (formData.listenType === 'local') {
      setFormData(prev => ({ ...prev, targetIp: '127.0.0.1' }));
    } else if (formData.listenType === 'external' && formData.targetIp === '127.0.0.1') {
      setFormData(prev => ({ ...prev, targetIp: '' }));
    }
  }, [formData.listenType]);

  const updateField = useCallback((field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const tunnelModes: TunnelMode[] = [
    {
      id: 'single',
      title: '单端转发',
      description: '简单的端口转发，适用于基本的隧道需求',
      icon: faArrowRight,
      color: 'primary'
    },
    {
      id: 'double',
      title: '双端转发',
      description: '双端加密隧道，提供更高的安全性和灵活性',
      icon: faShield,
      color: 'success'
    },
    {
      id: 'intranet',
      title: '内网穿透',
      description: '穿透NAT和防火墙，实现内网服务对外访问',
      icon: faWifi,
      color: 'secondary'
    }
  ];

  // 生成节点和边的函数
  const generateFlowElements = useCallback(() => {
    if (!selectedMode) return { nodes: [], edges: [] };

    let newNodes: Node[] = [];
    let newEdges: Edge[] = [];

    switch (selectedMode) {
      case 'single':
        // 单端转发节点
        newNodes = [
          {
            id: 'user',
            type: 'flowNode',
            position: { x: 50, y: 100 },
            data: {
              label: '用户',
              type: 'user',
              icon: faHdd,
              color: 'primary',
              formFields: [
                {
                  label: '端口',
                  key: 'userPort',
                  placeholder: '填写',
                  value: formData.userPort
                }
              ],
              onFieldChange: updateField,
              formData,
              endpoints,
              extractHostFromUrl
            }
          },
          {
            id: 'relay',
            type: 'flowNode',
            position: { x: 350, y: 100 },
            data: {
              label: '中转机器[入口]',
              type: 'relay',
              icon: faHdd,
              color: 'warning',
              formFields: [
                {
                  label: '选择服务器',
                  key: 'masterServer',
                  type: 'select',
                  placeholder: '下拉选择',
                  value: formData.masterServer,
                  options: endpoints.map(endpoint => ({
                    value: endpoint.name,
                    label: `${endpoint.name} [${extractHostFromUrl(endpoint.url)}]${endpoint.status === 'FAIL' ? ' - 异常' : ''}`,
                    disabled: endpoint.status === 'FAIL'
                  }))
                },
                {
                  label: 'IP',
                  key: 'masterServerIp',
                  placeholder: '此处显示上面选择的IP',
                  value: formData.masterServer ? extractHostFromUrl(endpoints.find(e => e.name === formData.masterServer)?.url || '') : '',
                  type: 'readonly'
                },
                {
                  label: '监听',
                  key: 'listenType',
                  type: 'select',
                  placeholder: '下拉选择本地/对外',
                  value: formData.listenType,
                  options: listenTypes.map(type => ({
                    value: type.value,
                    label: type.label
                  }))
                }
              ],
              onFieldChange: updateField,
              formData,
              endpoints,
              extractHostFromUrl
            }
          },
          {
            id: 'target',
            type: 'flowNode',
            position: { x: 650, y: 100 },
            data: {
              label: '最终目的地[出口]',
              type: 'target',
              icon: faHdd,
              color: 'warning', // 单端转发使用相同颜色
              formFields: [
                // 只有对外监听时才显示目标IP字段
                ...(formData.listenType === 'external' ? [{
                  label: '目标IP',
                  key: 'targetIp',
                  placeholder: '192.168.1.100 / 2001:db8::1',
                  value: formData.targetIp
                }] : []),
                {
                  label: '目标端口',
                  key: 'targetPort',
                  placeholder: '填写',
                  value: formData.targetPort
                }
              ],
              onFieldChange: updateField,
              formData,
              endpoints,
              extractHostFromUrl
            }
          }
        ];

        // 单端转发边
        newEdges = [
          {
            id: 'user-relay',
            source: 'user',
            target: 'relay',
            type: 'default',
            animated: true,
            style: { strokeWidth: 2, stroke: '#0070f3' },
            label: '访问',
            labelStyle: { fontSize: 12, fontWeight: 600 },
            labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#0070f3' }
          },
          {
            id: 'relay-target',
            source: 'relay',
            target: 'target',
            type: 'default',
            animated: true,
            style: { strokeWidth: 2, stroke: '#f59e0b' },
            label: '转发',
            labelStyle: { fontSize: 12, fontWeight: 600 },
            labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' }
          }
        ];
        break;

      case 'double':
        // 双端转发节点
        newNodes = [
          {
            id: 'user',
            type: 'flowNode',
            position: { x: 50, y: 100 },
            data: {
              label: '用户',
              type: 'user',
              icon: faHdd,
              color: 'primary',
              formFields: [
                {
                  label: '端口',
                  key: 'userPort',
                  placeholder: '填写',
                  value: formData.userPort
                }
              ],
              onFieldChange: updateField,
              formData,
              endpoints,
              extractHostFromUrl
            }
          },
          {
            id: 'relay',
            type: 'flowNode',
            position: { x: 300, y: 100 },
            data: {
              label: '中转机器[入口]',
              type: 'relay',
              icon: faHdd,
              color: 'warning',
              formFields: [
                {
                  label: '选择服务器',
                  key: 'masterServer',
                  type: 'select',
                  placeholder: '下拉选择',
                  value: formData.masterServer,
                  options: endpoints.map(endpoint => ({
                    value: endpoint.name,
                    label: `${endpoint.name} [${extractHostFromUrl(endpoint.url)}]${endpoint.status === 'FAIL' ? ' - 异常' : ''}`,
                    disabled: endpoint.status === 'FAIL'
                  }))
                },
                {
                  label: 'IP',
                  key: 'masterServerIp',
                  placeholder: '此处显示上面选择的IP',
                  value: formData.masterServer ? extractHostFromUrl(endpoints.find(e => e.name === formData.masterServer)?.url || '') : '',
                  type: 'readonly'
                }
              ],
              onFieldChange: updateField,
              formData,
              endpoints,
              extractHostFromUrl
            }
          },
                     {
             id: 'connection',
             type: 'connectionConfig',
             position: { x: 500, y: 50 },
             data: {
               formData,
               onFieldChange: updateField,
               tlsLevels,
               logLevels
             }
           },
          {
            id: 'target',
            type: 'flowNode',
            position: { x: 700, y: 100 },
            data: {
              label: '目标机器[出口]',
              type: 'target',
              icon: faCloud,
              color: 'success',
              formFields: [
                {
                  label: '选择服务器',
                  key: 'targetMaster',
                  type: 'select',
                  placeholder: '下拉选择',
                  value: formData.targetMaster,
                  options: endpoints.map(endpoint => ({
                    value: endpoint.name,
                    label: `${endpoint.name} [${extractHostFromUrl(endpoint.url)}]${endpoint.status === 'FAIL' ? ' - 异常' : ''}`,
                    disabled: endpoint.status === 'FAIL'
                  }))
                },
                {
                  label: '出IP',
                  key: 'targetMasterIp',
                  placeholder: '此处显示上面选择的IP',
                  value: formData.targetMaster ? extractHostFromUrl(endpoints.find(e => e.name === formData.targetMaster)?.url || '') : '',
                  type: 'readonly'
                },
                {
                  label: '出口端口',
                  key: 'targetMasterPort',
                  placeholder: '填写',
                  value: formData.targetMasterPort
                }
              ],
              onFieldChange: updateField,
              formData,
              endpoints,
              extractHostFromUrl
            }
          }
        ];

        // 双端转发边
        newEdges = [
          {
            id: 'user-relay',
            source: 'user',
            target: 'relay',
            type: 'default',
            animated: true,
            style: { strokeWidth: 2, stroke: '#0070f3' },
            label: '访问',
            labelStyle: { fontSize: 12, fontWeight: 600 },
            labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#0070f3' }
          },
          {
            id: 'relay-connection',
            source: 'relay',
            target: 'connection',
            type: 'default',
            animated: true,
            style: { strokeWidth: 2, stroke: '#f59e0b' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' }
          },
          {
            id: 'connection-target',
            source: 'connection',
            target: 'target',
            type: 'default',
            animated: true,
            style: { strokeWidth: 2, stroke: '#10b981' },
            label: '连接',
            labelStyle: { fontSize: 12, fontWeight: 600 },
            labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' }
          }
        ];
        break;

      case 'intranet':
        // 内网穿透节点
        newNodes = [
          {
            id: 'user',
            type: 'flowNode',
            position: { x: 50, y: 100 },
            data: {
              label: '内网服务',
              type: 'user',
              icon: faUser,
              color: 'primary',
              formFields: [
                {
                  label: '服务端口',
                  key: 'userPort',
                  placeholder: '填写',
                  value: formData.userPort
                }
              ],
              onFieldChange: updateField,
              formData,
              endpoints,
              extractHostFromUrl
            }
          },
          {
            id: 'relay',
            type: 'flowNode',
            position: { x: 350, y: 100 },
            data: {
              label: '中转服务器',
              type: 'relay',
              icon: faCloud,
              color: 'warning',
              formFields: [
                {
                  label: '中转服务器',
                  key: 'masterServer',
                  type: 'select',
                  placeholder: '选择服务器',
                  value: formData.masterServer,
                  options: endpoints.map(endpoint => ({
                    value: endpoint.name,
                    label: `${endpoint.name} [${extractHostFromUrl(endpoint.url)}]${endpoint.status === 'FAIL' ? ' - 异常' : ''}`,
                    disabled: endpoint.status === 'FAIL'
                  }))
                }
              ],
              onFieldChange: updateField,
              formData,
              endpoints,
              extractHostFromUrl
            }
          },
          {
            id: 'target',
            type: 'flowNode',
            position: { x: 650, y: 100 },
            data: {
              label: '外网访问',
              type: 'target',
              icon: faCloud,
              color: 'success',
              formFields: [
                {
                  label: '访问信息',
                  key: 'accessInfo',
                  placeholder: '将自动生成',
                  value: formData.masterServer ? `${formData.masterServer}:公网端口` : '',
                  type: 'readonly'
                }
              ],
              onFieldChange: updateField,
              formData,
              endpoints,
              extractHostFromUrl
            }
          }
        ];

        // 内网穿透边
        newEdges = [
          {
            id: 'user-relay',
            source: 'user',
            target: 'relay',
            type: 'default',
            animated: true,
            style: { strokeWidth: 2, stroke: '#0070f3' },
            label: '穿透',
            labelStyle: { fontSize: 12, fontWeight: 600 },
            labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#0070f3' }
          },
          {
            id: 'relay-target',
            source: 'relay',
            target: 'target',
            type: 'default',
            animated: true,
            style: { strokeWidth: 2, stroke: '#f59e0b' },
            label: '暴露',
            labelStyle: { fontSize: 12, fontWeight: 600 },
            labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' }
          }
        ];
        break;
    }

    return { nodes: newNodes, edges: newEdges };
  }, [selectedMode, formData, endpoints, extractHostFromUrl]);

  // 使用useEffect来更新节点和边
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = generateFlowElements();
    setNodes(newNodes);
    setEdges(newEdges);
  }, [generateFlowElements]);

  const renderModeSelector = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FontAwesomeIcon icon={faLayerGroup} className="text-2xl text-primary" />
        <h2 className="text-2xl font-bold">选择隧道模式</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tunnelModes.map((mode) => (
          <Card
            key={mode.id}
            isPressable
            isHoverable
            onPress={() => setSelectedMode(mode.id)}
            className={`cursor-pointer transition-all duration-200 ${
              selectedMode === mode.id
                ? 'ring-2 ring-primary ring-offset-2'
                : ''
            }`}
          >
            <CardBody className="p-6">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${
                mode.color === 'primary' ? 'bg-primary bg-opacity-10' :
                mode.color === 'success' ? 'bg-success bg-opacity-10' :
                mode.color === 'secondary' ? 'bg-secondary bg-opacity-10' : 'bg-default bg-opacity-10'
              }`}>
                <FontAwesomeIcon icon={mode.icon} className={`text-xl ${
                  mode.color === 'primary' ? 'text-primary' :
                  mode.color === 'success' ? 'text-success' :
                  mode.color === 'secondary' ? 'text-secondary' : 'text-default'
                }`} />
              </div>
              <h3 className="text-lg font-semibold mb-2">{mode.title}</h3>
              <p className="text-default-500 text-sm">{mode.description}</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );

  const generateCommand = () => {
    switch (selectedMode) {
      case 'single':
        const targetIp = formData.listenType === 'local' ? '127.0.0.1' : (formData.targetIp || '127.0.0.1');
        return `nodepass "server://:${formData.userPort}/${targetIp}:${formData.targetPort}?log=info&tls=1"`;
      case 'double':
        return `nodepass "server://:${formData.userPort}?log=info&tls=${formData.tlsLevel}" && nodepass "client://${formData.masterServer}:${formData.connectionPort}/${formData.targetMaster}:${formData.targetMasterPort}"`;
      case 'intranet':
        return `nodepass "client://${formData.masterServer}:10101/127.0.0.1:${formData.userPort}?log=info&tls=1"`;
      default:
        return '';
    }
  };

  const getScenarioDescription = () => {
    switch (selectedMode) {
      case 'single':
        if (formData.listenType === 'local') {
          return `用户可以访问192.168.64.100:${formData.userPort || '1000'}来访问127.0.0.1:${formData.targetPort || '3000'}的效果`;
        } else {
          return `用户可以访问192.168.64.100:${formData.userPort || '1000'}来访问${formData.targetIp || '目标IP'}:${formData.targetPort || '3000'}的效果`;
        }
      case 'double':
        return `用户可以访问192.168.64.100:${formData.userPort || '1000'}用于连接目标机器的192.168.64.200:${formData.targetMasterPort || '8080'}的效果`;
      case 'intranet':
        return '外部用户可以通过公网地址访问您的内网服务';
      default:
        return '';
    }
  };

  return (
    <div className="max-w-full mx-auto py-6 px-4 space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center gap-2 md:gap-0">
        <div className="flex items-center gap-2 md:gap-4">
          <FontAwesomeIcon icon={faLayerGroup} className="text-2xl text-primary" />
          <div>
            <h1 className="text-2xl font-bold">NodePass 隧道模板创建器</h1>
            <p className="text-default-500 text-sm">使用预定义模板快速创建和配置NodePass隧道连接</p>
          </div>
        </div>
      </div>

      {renderModeSelector()}

      {selectedMode && (
        <div className="space-y-6">
          {/* React Flow 流程图 */}
          <Card className="bg-gradient-to-br from-default-50 to-default-100/50">
            <CardBody className="p-4">
              <h3 className="text-xl font-semibold mb-4 text-center">
                {selectedMode === 'single' ? '单端转发场景' :
                 selectedMode === 'double' ? '双端转发场景' :
                 selectedMode === 'intranet' ? '内网穿透场景' : '连接流程配置'}
              </h3>
              <div style={{ width: '100%', height: '500px' }}>
                                 <ReactFlow
                   nodes={nodes}
                   edges={edges}
                   nodeTypes={nodeTypes}
                   edgeTypes={edgeTypes}
                   fitView
                   attributionPosition="bottom-left"
                   proOptions={{ hideAttribution: true }}
                 >
                  <Background />
                  <Controls />
                </ReactFlow>
              </div>
              
              {/* 效果说明 */}
              <div className="mt-4 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 rounded-full text-sm text-default-600">
                  <span className="font-medium">效果:</span>
                  {getScenarioDescription()}
                </div>
              </div>
            </CardBody>
          </Card>

          <div className="flex gap-4">
            <Button 
              color="primary"
              startContent={<FontAwesomeIcon icon={faPlus} />}
            >
              创建应用
            </Button>
          </div>
          
          {/* 命令预览 */}
          <Card className="bg-gray-900">
            <CardBody className="p-4">
              <div className="text-gray-400 text-sm mb-2"># 生成的NodePass命令:</div>
              <div className="text-green-400 font-mono text-sm break-all">{generateCommand()}</div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
} 