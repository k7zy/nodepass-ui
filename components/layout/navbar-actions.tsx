"use client";

import {
  Button
} from "@heroui/react";
import { Icon } from "@iconify/react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * 导航栏操作区域组件
 * 包含通知按钮和设置按钮
 */
export const NavbarActions = () => {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-0.5">
    </div>
  );
}; 