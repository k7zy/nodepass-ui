'use client';

import { usePathname } from 'next/navigation';
import { Link } from "@heroui/link";
import { AuthProvider } from "./components/auth-provider";
import { RouteGuard } from "./components/route-guard";
import { Navbar } from "@/components/layout/navbar";

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
              {/* <Link
                isExternal
                className="flex items-center gap-1 text-current"
                href="https://heroui.com?utm_source=next-app-template"
                title="heroui.com homepage"
              >
                <span className="text-default-600">Powered by</span>
                <p className="text-primary">HeroUI</p>
              </Link> */}
            </footer>
          </div>
        )}
      </RouteGuard>
    </AuthProvider>
  );
} 