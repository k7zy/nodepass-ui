export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "NodePass管理",
  description: "Make beautiful websites regardless of your design experience.",
  navItems: [
    {
      label: "仪表盘",
      href: "/dashboard",
    },
    {
      label: "隧道管理",
      href: "/tunnels",
    },
    {
      label: "API 端点管理",
      href: "/endpoints",
    }
  ],
  navMenuItems: [
    {
      label: "个人信息",
      href: "/profile",
    },
    {
      label: "系统设置",
      href: "/settings",
    },
    {
      label: "退出登录",
      href: "/logout",
    }
  ],
  links: {
    github: "https://github.com/yosebyte/nodepass"
  },
};
