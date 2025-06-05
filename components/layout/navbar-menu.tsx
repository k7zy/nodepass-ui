"use client";

import {
  NavbarItem
} from "@heroui/react";
import { Icon } from "@iconify/react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * 导航菜单配置
 */
const navigationItems = [
  {
    href: "/dashboard",
    label: "仪表盘",
    icon: "solar:chart-2-bold-duotone",
  },
  {
    href: "/tunnels",
    label: "隧道管理", 
    icon: "solar:transmission-bold",
  },
  {
    href: "/endpoints",
    label: "主控管理",
    icon: "solar:server-2-bold",
  },
];

/**
 * 导航栏菜单组件 - 桌面端
 */
export const NavbarMenu = () => {
  const pathname = usePathname();

  return (
    <>
      {navigationItems.map((item) => (
        <NavbarItem key={item.href} isActive={pathname === item.href}>
          <NextLink
            className={cn(
              "flex items-center gap-1 px-3 py-2 rounded-lg transition-all duration-200",
              pathname === item.href 
                ? "text-primary font-semibold bg-primary-100 dark:bg-primary-900/30" 
                : "text-default-600"
            )}
            href={item.href}
          >
            <Icon icon={item.icon} width={18} />
            {item.label}
          </NextLink>
        </NavbarItem>
      ))}
    </>
  );
}; 