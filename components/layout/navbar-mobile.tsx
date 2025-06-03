"use client";

import {
  NavbarMenuItem
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
    label: "端点管理",
    icon: "solar:server-2-bold",
  },
];

/**
 * 移动端导航菜单组件
 */
export const NavbarMobileMenu = () => {
  const pathname = usePathname();

  return (
    <div className="mx-4 mt-2 flex flex-col gap-2">
      {navigationItems.map((item) => (
        <NavbarMenuItem key={item.href}>
          <NextLink
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200",
              pathname === item.href 
                ? "text-primary font-semibold bg-primary-100 dark:bg-primary-900/30" 
                : "text-default-600"
            )}
            href={item.href}
          >
            <Icon icon={item.icon} width={18} />
            {item.label}
          </NextLink>
        </NavbarMenuItem>
      ))}
    </div>
  );
}; 