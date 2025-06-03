"use client";

import {
  HeroUIProvider
} from "@heroui/react";
import type { ThemeProviderProps } from "next-themes";

import * as React from "react";

import { ToastProvider } from "@heroui/toast";
import { useRouter } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export interface ProvidersProps {
  children: React.ReactNode;
  themeProps?: ThemeProviderProps;
}

declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NonNullable<
      Parameters<ReturnType<typeof useRouter>["push"]>[1]
    >;
  }
}

export function Providers({ children, themeProps }: ProvidersProps) {
  const router = useRouter();

  return (
    <HeroUIProvider navigate={router.push}>
      <NextThemesProvider {...themeProps}>
        <ToastProvider 
          placement="top-center" 
          toastOffset={80}
        />
        {children}
      </NextThemesProvider>
    </HeroUIProvider>
  );
}
