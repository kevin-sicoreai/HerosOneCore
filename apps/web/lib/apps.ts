import {
  BotIcon,
  BoxesIcon,
  DatabaseIcon,
  GaugeIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  LayoutTemplateIcon,
  Share2Icon,
  ShieldCheckIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

export type AppLayer = {
  key: string
  label: string
  apps: AppDef[]
}

export type AppDef = {
  key: string
  title: string
  href: string
  icon: LucideIcon
  desc: string
  // When true, the item is only shown to admins (can_admin). This is menu-level
  // soft-hiding only — see app-sidebar / app-launcher for the filtering.
  adminOnly?: boolean
}

// The App launcher / left-rail registry, grouped by the architecture's layers.
// AIP sits on top; the 分析洞察 layer covers analytics (metrics & dashboards,
// object exploration), metric semantics (口径) and the app builder — authoring
// of business apps lives here rather than in the 业务应用 layer, which is now
// consumption-only. The 数据与本体 layer stays admin-facing. Governance is
// cross-cutting but also gets a console.
export const APP_LAYERS: AppLayer[] = [
  {
    key: "aip",
    label: "AIP 智能层",
    apps: [
      {
        key: "assist",
        title: "AIP 助手",
        href: "/assist",
        icon: BotIcon,
        desc: "对话式助手，展示检索与推理全过程",
      },
    ],
  },
  {
    // Business applications served by the native runtime. Consumption-only:
    // browse and run published apps. Authoring (create / edit / publish /
    // delete) now lives in the 分析洞察 layer's 应用构建器.
    key: "apps",
    label: "业务应用",
    apps: [
      {
        key: "apps",
        title: "应用目录",
        href: "/apps",
        icon: LayoutGridIcon,
        desc: "浏览并运行已发布的业务应用",
      },
    ],
  },
  {
    // Analytics over the same object universe: aggregate metrics (Contour-style)
    // and per-object exploration (Object Explorer / Quiver-style), plus metric
    // semantics (口径) and the business-app builder. Engines stay headless
    // behind the platform's own pages.
    key: "analytics",
    label: "分析洞察",
    apps: [
      {
        key: "analysis",
        title: "指标与看板",
        href: "/analysis",
        icon: LayoutDashboardIcon,
        desc: "看板 · 指标图表 · 聚合与明细分析",
      },
      {
        key: "explorer",
        title: "对象浏览器",
        href: "/explorer",
        icon: BoxesIcon,
        desc: "浏览本体对象实例 · 时间轴 / 地图",
      },
      {
        key: "metrics",
        title: "指标语义",
        href: "/metrics",
        icon: GaugeIcon,
        desc: "指标口径 · 维度 · Cube 映射（只读）",
      },
      {
        key: "app-builder",
        title: "应用构建器",
        href: "/apps/builder",
        icon: LayoutTemplateIcon,
        desc: "搭建 / 发布 / 管理业务应用",
      },
    ],
  },
  {
    key: "data",
    label: "数据与本体",
    apps: [
      {
        key: "data",
        title: "数据接入",
        href: "/data",
        icon: DatabaseIcon,
        desc: "连接器与数据源",
        adminOnly: true,
      },
      {
        key: "pipeline",
        title: "管道构建",
        href: "/pipeline",
        icon: WorkflowIcon,
        desc: "拖拽式数据管道 DAG",
        adminOnly: true,
      },
      {
        key: "ontology",
        title: "本体管理",
        href: "/ontology",
        icon: Share2Icon,
        desc: "对象 / 链接 / 属性建模",
        adminOnly: true,
      },
    ],
  },
  {
    key: "governance",
    label: "安全与治理",
    apps: [
      {
        key: "governance",
        title: "治理后台",
        href: "/governance",
        icon: ShieldCheckIcon,
        desc: "权限 · 血缘 · 审计 · 合规",
        adminOnly: true,
      },
    ],
  },
]

export const ALL_APPS: AppDef[] = APP_LAYERS.flatMap((l) => l.apps)

export function findApp(href: string): AppDef | undefined {
  return ALL_APPS.find((a) => a.href === href)
}
