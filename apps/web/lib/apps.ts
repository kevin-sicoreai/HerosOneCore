import {
  BotIcon,
  BoxesIcon,
  DatabaseIcon,
  RadarIcon,
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
}

// The App launcher / left-rail registry, grouped by the architecture's layers.
// AIP sits on top; Governance is cross-cutting but also gets a console.
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
    key: "analysis",
    label: "分析与应用",
    apps: [
      {
        key: "analysis",
        title: "分析工作台",
        href: "/analysis",
        icon: RadarIcon,
        desc: "图谱 / 时间轴 / 地图 / 表格",
      },
      {
        key: "explorer",
        title: "对象浏览器",
        href: "/explorer",
        icon: BoxesIcon,
        desc: "浏览本体对象实例",
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
      },
      {
        key: "pipeline",
        title: "管道构建",
        href: "/pipeline",
        icon: WorkflowIcon,
        desc: "拖拽式数据管道 DAG",
      },
      {
        key: "ontology",
        title: "本体管理",
        href: "/ontology",
        icon: Share2Icon,
        desc: "对象 / 链接 / 属性建模",
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
      },
    ],
  },
]

export const ALL_APPS: AppDef[] = APP_LAYERS.flatMap((l) => l.apps)

export function findApp(href: string): AppDef | undefined {
  return ALL_APPS.find((a) => a.href === href)
}
