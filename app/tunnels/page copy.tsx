"use client";

import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow
} from "@heroui/react";
import React from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faSearch, 
  faChevronDown, 
  faEye, 
  faPause, 
  faPlay, 
  faTrash,
  faCheck
} from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";
import { Selection } from "@react-types/shared";

export default function TunnelsPage() {
  const router = useRouter();
  const [filterValue, setFilterValue] = React.useState("");
  const [selectedKeys, setSelectedKeys] = React.useState<Selection>(new Set([]));
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [rowsPerPage, setRowsPerPage] = React.useState(5);
  const [page, setPage] = React.useState(1);

  const statusOptions = [
    { label: "所有状态", value: "all" },
    { label: "运行中", value: "running" },
    { label: "已停止", value: "stopped" },
    { label: "错误", value: "error" },
  ];

  const columns = [
    { key: "name", label: "名称" },
    { key: "type", label: "类型" },
    { key: "address", label: "地址" },
    { key: "status", label: "状态" },
    { key: "actions", label: "操作" },
  ];

  const tunnels = [
    {
      id: 1,
      type: "服务器",
      name: "web-proxy-server",
      address: "server//:0.0.0.0:10101/0.0.0.0:8080?tls=1",
      status: { type: "success" as const, text: "运行中" },
      avatar: "W",
    },
    {
      id: 2,
      type: "服务器",
      name: "database-tunnel",
      address: "server//:0.0.0.0:10102/0.0.0.0:3306?tls=1",
      status: { type: "success" as const, text: "运行中" },
      avatar: "D",
    },
    {
      id: 3,
      type: "客户端",
      name: "api-client",
      address: "client://server.example.com:10101/127.0.0.1:8080",
      status: { type: "success" as const, text: "运行中" },
      avatar: "A",
    },
    {
      id: 4,
      type: "客户端",
      name: "test-client",
      address: "client://server.example.com:10102/127.0.0.1:3000",
      status: { type: "danger" as const, text: "已停止" },
      avatar: "T",
    },
    {
      id: 5,
      type: "服务器",
      name: "dev-server",
      address: "server//:0.0.0.0:10103/0.0.0.0:9000?tls=1",
      status: { type: "warning" as const, text: "错误" },
      avatar: "D",
    },
  ];

  const filteredItems = React.useMemo(() => {
    let filtered = [...tunnels];

    if (filterValue) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(filterValue.toLowerCase()) ||
        item.address.toLowerCase().includes(filterValue.toLowerCase())
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

    return filtered;
  }, [tunnels, filterValue, statusFilter]);

  const pages = Math.ceil(filteredItems.length / rowsPerPage);
  const items = React.useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    return filteredItems.slice(start, end);
  }, [page, filteredItems, rowsPerPage]);

  const renderCell = React.useCallback((tunnel: any, columnKey: React.Key) => {
    switch (columnKey) {
      case "name":
        return (
          <div className="flex items-center gap-3">
            <Avatar size="sm">{tunnel.avatar}</Avatar>
            <div className="flex flex-col">
              <p className="text-bold">{tunnel.name}</p>
              <p className="text-tiny text-default-500">{tunnel.type}</p>
            </div>
          </div>
        );
      case "type":
        return (
          <Badge variant="flat" color="primary">{tunnel.type}</Badge>
        );
      case "address":
        return (
          <span className="text-sm text-default-500">{tunnel.address}</span>
        );
      case "status":
        return (
          <Badge color={tunnel.status.type}>{tunnel.status.text}</Badge>
        );
      case "actions":
        return (
          <div className="flex gap-2">
            <Button 
              isIconOnly 
              variant="light" 
              size="sm"
              color="primary"
              onClick={() => router.push(`/tunnels/${tunnel.id}`)}
            >
              <FontAwesomeIcon icon={faEye} />
            </Button>
            {tunnel.status.type === "success" ? (
              <Button 
                isIconOnly 
                variant="light" 
                size="sm"
                color="warning"
              >
                <FontAwesomeIcon icon={faPause} />
              </Button>
            ) : (
              <Button 
                isIconOnly 
                variant="light" 
                size="sm"
                color="success"
              >
                <FontAwesomeIcon icon={faPlay} />
              </Button>
            )}
            <Button 
              isIconOnly 
              variant="light" 
              size="sm" 
              className="text-danger"
            >
              <FontAwesomeIcon icon={faTrash} />
            </Button>
          </div>
        );
      default:
        return null;
    }
  }, [router]);

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

  const topContent = React.useMemo(() => {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">实例管理</h1>
          <Button 
            color="primary"
            onClick={() => router.push("/tunnels/create")}
          >
            创建实例
          </Button>
        </div>
        <div className="flex justify-between items-center gap-4">
          <div className="flex-1">
            <Input
              isClearable
              classNames={{
                inputWrapper: "bg-default-100",
              }}
              placeholder="搜索实例..."
              startContent={<FontAwesomeIcon icon={faSearch} className="text-default-400" />}
              value={filterValue}
              onClear={() => onClear()}
              onValueChange={onSearchChange}
            />
          </div>
          <div className="flex gap-3">
            <Dropdown>
              <DropdownTrigger>
                <Button 
                  variant="flat" 
                  endContent={<FontAwesomeIcon icon={faChevronDown} className="text-small" />}
                >
                  所有 API
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="API 过滤">
                <DropdownItem key="all">所有 API</DropdownItem>
                <DropdownItem key="main">主服务器</DropdownItem>
                <DropdownItem key="backup">备用服务器</DropdownItem>
                <DropdownItem key="test">测试服务器</DropdownItem>
              </DropdownMenu>
            </Dropdown>

            <Dropdown>
              <DropdownTrigger>
                <Button 
                  variant="flat" 
                  endContent={<FontAwesomeIcon icon={faChevronDown} className="text-small" />}
                >
                  {statusOptions.find(option => option.value === statusFilter)?.label || "所有状态"}
                </Button>
              </DropdownTrigger>
              <DropdownMenu 
                aria-label="状态过滤"
                onAction={(key) => {
                  setStatusFilter(key as string);
                  setPage(1);
                }}
                selectedKeys={[statusFilter]}
                selectionMode="single"
              >
                {statusOptions.map((status) => (
                  <DropdownItem key={status.value}>
                    <div className="flex items-center gap-2">
                      {status.value === statusFilter && <FontAwesomeIcon icon={faCheck} />}
                      {status.label}
                    </div>
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </div>
    );
  }, [filterValue, onSearchChange, onClear, router, statusFilter, statusOptions]);

  const bottomContent = React.useMemo(() => {
    return (
      <div className="flex justify-between items-center px-2 py-2">
        <div className="flex-1">
          <span className="text-default-400 text-small">
            {selectedKeys === "all"
              ? "已选择所有实例"
              : `已选择 ${selectedKeys instanceof Set ? selectedKeys.size : 0} 个实例`}
          </span>
        </div>
        <Pagination
          isCompact
          showControls
          showShadow
          color="primary"
          page={page}
          total={pages}
          onChange={setPage}
        />
        <div className="flex-1 flex justify-end">
          <span className="text-default-400 text-small">
            共 {items.length} 个实例
          </span>
        </div>
      </div>
    );
  }, [selectedKeys, items.length, page, pages]);

  return (
    <div className="space-y-6">
      <Table
        isHeaderSticky
        bottomContent={bottomContent}
        bottomContentPlacement="outside"
        classNames={{
          wrapper: "max-h-[600px]",
        }}
        selectedKeys={selectedKeys}
        selectionMode="multiple"
        sortDescriptor={{
          column: "name",
          direction: "ascending",
        }}
        topContent={topContent}
        topContentPlacement="outside"
        onSelectionChange={setSelectedKeys}
      >
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn 
              key={column.key}
              align={column.key === "actions" ? "center" : "start"}
            >
              {column.label}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody items={items}>
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
  );
} 