'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Link } from "@heroui/link";
import { Snippet } from "@heroui/snippet";
import { Code } from "@heroui/code";
import { button as buttonStyles } from "@heroui/theme";
import { Spinner } from "@heroui/react";

import { siteConfig } from "@/config/site";
import { title, subtitle } from "@/components/primitives";
import { GithubIcon } from "@/components/icons";
import { useAuth } from "@/app/components/auth-provider";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // 如果用户已登录，重定向到仪表盘
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // 显示加载状态
  if (loading) {
    return (
      <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10 min-h-[400px]">
        <Spinner size="lg" />
        <p className="text-default-500">正在加载...</p>
      </section>
    );
  }

  // 如果用户已登录，显示重定向信息
  if (user) {
    return (
      <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10 min-h-[400px]">
        <Spinner size="lg" />
        <p className="text-default-500">正在跳转到仪表盘...</p>
      </section>
    );
  }

  // 未登录用户显示欢迎页面
  return (
    <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10">
      <div className="inline-block max-w-xl text-center justify-center">
        <span className={title()}>NodePass&nbsp;</span>
        <span className={title({ color: "violet" })}>隧道管理&nbsp;</span>
        <br />
        <span className={title()}>
          快速、安全、高效的隧道解决方案
        </span>
        <div className={subtitle({ class: "mt-4" })}>
          基于现代 Web 技术构建的隧道管理平台，提供完整的端点和隧道管理功能。
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          className={buttonStyles({ color: "primary", radius: "full" })}
          href="/login"
        >
          立即登录
        </Link>
        <Link
          isExternal
          className={buttonStyles({ variant: "bordered", radius: "full" })}
          href={siteConfig.links.github}
        >
          <GithubIcon size={20} />
          GitHub
        </Link>
      </div>

      <div className="mt-8">
        <Snippet hideCopyButton hideSymbol variant="bordered">
          <span>
            首次使用请查看控制台输出的 <Code color="primary">初始账户信息</Code>
          </span>
        </Snippet>
      </div>
    </section>
  );
}
