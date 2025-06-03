// pages/tunnels/page.tsx - 升级后的版本
"use client";

import {
  Badge,
  Card,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  User
} from "@heroui/react";
import React from "react";
import { useRouter } from "next/navigation";

import { Box, Flex } from "@/components";
import { ProTableToolBox } from "./components/toolbox";
 
export default function ProTableDemo() {
  const columns = [
    { name: "NAME", uid: "name" },
    { name: "ROLE", uid: "role" },
    { name: "STATUS", uid: "status" },
    { name: "ACTIONS", uid: "actions" },
  ];
  
  const users = [
    {
      id: 1,
      name: "Tony Reichert",
      role: "CEO",
      team: "Management",
      status: "active",
      age: "29",
      avatar: "https://i.pravatar.cc/150?u=a042581f4e29026024d",
      email: "tony.reichert@example.com",
    },
    {
      id: 2,
      name: "Zoey Lang",
      role: "Technical Lead",
      team: "Development",
      status: "paused",
      age: "25",
      avatar: "https://i.pravatar.cc/150?u=a042581f4e29026704d",
      email: "zoey.lang@example.com",
    },
    {
      id: 3,
      name: "Jane Fisher",
      role: "Senior Developer",
      team: "Development",
      status: "active",
      age: "22",
      avatar: "https://i.pravatar.cc/150?u=a04258114e29026702d",
      email: "jane.fisher@example.com",
    },
    {
      id: 4,
      name: "William Howard",
      role: "Community Manager",
      team: "Marketing",
      status: "vacation",
      age: "28",
      avatar: "https://i.pravatar.cc/150?u=a048581f4e29026701d",
      email: "william.howard@example.com",
    },
    {
      id: 5,
      name: "Kristen Copper",
      role: "Sales Manager",
      team: "Sales",
      status: "active",
      age: "24",
      avatar: "https://i.pravatar.cc/150?u=a092581d4ef9026700d",
      email: "kristen.cooper@example.com",
    },
  ];

  const renderCell = (user: any, columnKey: string) => {
    const cellValue = user[columnKey];
    switch (columnKey) {
      case "name":
        return (
          <User 
            avatarProps={{ src: user.avatar }}
            name={cellValue}
            description={user.email}
          />
        );
      case "role":
        return (
          <Flex direction="col">
            <Box className="text-sm font-semibold capitalize">{cellValue}</Box>
            <Box className="text-xs text-default-500 capitalize">{user.team}</Box>
          </Flex>
        );
      case "status":
        return <Badge color="primary">{cellValue}</Badge>;
      case "actions":
        return <Box>操作</Box>;
      default:
        return cellValue;
    }
  };

  return (
    <Flex direction="col" className="border border-default-200 rounded-lg transition-all duration-300 hover:shadow-sm">
      <ProTableToolBox />
      <Box className="w-full">
        <Table
          shadow="none"
          aria-label="Example table with custom cells"
          className="min-w-full"
          selectionMode="multiple"
        >
          <TableHeader columns={columns}>
            {(column) => (
              <TableColumn
                key={column.uid}
                hideHeader={column.uid === "actions"}
                align={column.uid === "actions" ? "center" : "start"}
              >
                {column.name}
              </TableColumn>
            )}
          </TableHeader>
          <TableBody items={users}>
            {(item) => (
              <TableRow key={item.id}>
                {(columnKey) => (
                  <TableCell>{renderCell(item, columnKey as string)}</TableCell>
                )}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
      <Flex justify="end" className="w-full gap-2 p-4">
        <Box className="text-sm text-default-500">Total 300</Box>
        <Pagination loop total={20} initialPage={1} />
      </Flex>
    </Flex>
  );
};
