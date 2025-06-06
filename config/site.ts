export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "NodePassDash",
  description: "Make beautiful websites regardless of your design experience.",
  navItems: [
    {
      label: "仪表盘",
      href: "/dashboard",
    },
    {
      label: "实例管理",
      href: "/tunnels",
    },
    {
      label: "主控管理",
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
