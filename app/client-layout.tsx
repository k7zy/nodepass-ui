'use client';

import {
  Link
} from "@heroui/react";
import { usePathname } from 'next/navigation';

import { AuthProvider } from "./components/auth-provider";
import { RouteGuard } from "./components/route-guard";
import { Navbar } from "@/components/layout/navbar";
import pkg from '../package.json';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  return (
    <AuthProvider>
      <RouteGuard>
        {isLoginPage ? (
          // 登录页面：简洁布局，无导航栏
          <div className="min-h-screen bg-background">
            {children}
          </div>
        ) : (
          // 其他页面：完整布局，包含导航栏
          <div className="relative flex flex-col h-screen">
            <Navbar />
            <main className="container mx-auto max-w-7xl pt-16 px-6 flex-grow">
              {children}
            </main>
            <footer className="w-full flex items-center justify-center py-3">
              <div className="text-default-600 text-sm">
              NodePassDash © 2025 | v{pkg.version} | 由 <a href="https://github.com/yosebyte/nodepass" target="_blank" className="text-blue-500 hover:text-blue-600">NodePass</a> 驱动
              </div>
            </footer>
          </div>
        )}
      </RouteGuard>
    </AuthProvider>
  );
} 