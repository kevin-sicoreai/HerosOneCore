// Mock data for the Sicore data-intelligence platform prototype.
// All data is fabricated for UI demonstration only.

export type ResourceKind =
  | "dataset"
  | "object-type"
  | "pipeline"
  | "application"
  | "folder"

export type Resource = {
  id: string
  name: string
  kind: ResourceKind
  updated: string
  owner: string
  children?: Resource[]
}

export const RESOURCE_TREE: Resource[] = [
  {
    id: "f-src",
    name: "数据源",
    kind: "folder",
    updated: "2026-06-30",
    owner: "系统",
    children: [
      { id: "d-erp", name: "erp_orders", kind: "dataset", updated: "2026-07-03", owner: "李蔚" },
      { id: "d-iot", name: "iot_sensor_stream", kind: "dataset", updated: "2026-07-04", owner: "管道" },
      { id: "d-crm", name: "crm_customers", kind: "dataset", updated: "2026-07-01", owner: "王越" },
    ],
  },
  {
    id: "f-onto",
    name: "本体对象",
    kind: "folder",
    updated: "2026-07-02",
    owner: "系统",
    children: [
      { id: "o-device", name: "设备 Device", kind: "object-type", updated: "2026-07-02", owner: "李蔚" },
      { id: "o-order", name: "订单 Order", kind: "object-type", updated: "2026-07-02", owner: "李蔚" },
      { id: "o-supplier", name: "供应商 Supplier", kind: "object-type", updated: "2026-06-28", owner: "王越" },
    ],
  },
  {
    id: "f-pipe",
    name: "管道",
    kind: "folder",
    updated: "2026-07-04",
    owner: "系统",
    children: [
      { id: "p-maint", name: "pipeline_maintenance", kind: "pipeline", updated: "2026-07-04", owner: "李蔚" },
      { id: "p-risk", name: "pipeline_risk_score", kind: "pipeline", updated: "2026-07-03", owner: "陈默" },
    ],
  },
  {
    id: "f-app",
    name: "应用",
    kind: "folder",
    updated: "2026-07-01",
    owner: "系统",
    children: [
      { id: "a-dash", name: "运营指挥台", kind: "application", updated: "2026-07-01", owner: "王越" },
      { id: "a-case", name: "调查看板", kind: "application", updated: "2026-06-29", owner: "陈默" },
    ],
  },
]

export const KIND_LABEL: Record<ResourceKind, string> = {
  dataset: "数据集",
  "object-type": "对象类型",
  pipeline: "管道",
  application: "应用",
  folder: "文件夹",
}

// ---------- Ontology ----------
export type OntoNode = {
  id: string
  name: string
  en: string
  x: number
  y: number
  props: number
  instances: string
  color: string
}
export type OntoLink = {
  from: string
  to: string
  label: string
}

export const ONTO_NODES: OntoNode[] = [
  { id: "device", name: "设备", en: "Device", x: 120, y: 90, props: 14, instances: "12,480", color: "emerald" },
  { id: "order", name: "订单", en: "Order", x: 420, y: 70, props: 9, instances: "1.2M", color: "sky" },
  { id: "supplier", name: "供应商", en: "Supplier", x: 420, y: 300, props: 7, instances: "3,120", color: "violet" },
  { id: "sensor", name: "传感器", en: "Sensor", x: 120, y: 320, props: 6, instances: "48,900", color: "amber" },
  { id: "site", name: "站点", en: "Site", x: 700, y: 190, props: 5, instances: "260", color: "rose" },
]

export const ONTO_LINKS: OntoLink[] = [
  { from: "device", to: "sensor", label: "包含" },
  { from: "device", to: "site", label: "部署于" },
  { from: "order", to: "supplier", label: "供货方" },
  { from: "order", to: "device", label: "关联设备" },
  { from: "supplier", to: "site", label: "服务" },
]

export const ONTO_PROPS: Record<string, { name: string; type: string; key?: boolean }[]> = {
  device: [
    { name: "device_id", type: "String", key: true },
    { name: "model", type: "String" },
    { name: "install_date", type: "Timestamp" },
    { name: "status", type: "Enum" },
    { name: "failure_rate", type: "Double" },
    { name: "location", type: "Geohash" },
  ],
}

// ---------- Object instances (Explorer) ----------
export type DeviceRow = {
  id: string
  model: string
  site: string
  status: "运行" | "告警" | "停机"
  failureRate: number
  lastSeen: string
}

export const DEVICE_ROWS: DeviceRow[] = [
  { id: "DV-10231", model: "TX-500", site: "华东-01", status: "告警", failureRate: 8.4, lastSeen: "2 分钟前" },
  { id: "DV-10232", model: "TX-500", site: "华东-01", status: "运行", failureRate: 1.2, lastSeen: "1 分钟前" },
  { id: "DV-10240", model: "GX-220", site: "华南-03", status: "告警", failureRate: 7.9, lastSeen: "5 分钟前" },
  { id: "DV-10255", model: "TX-500", site: "华北-02", status: "停机", failureRate: 12.1, lastSeen: "1 小时前" },
  { id: "DV-10261", model: "GX-220", site: "华南-03", status: "运行", failureRate: 0.6, lastSeen: "刚刚" },
  { id: "DV-10277", model: "MX-900", site: "西南-01", status: "告警", failureRate: 6.5, lastSeen: "8 分钟前" },
  { id: "DV-10288", model: "MX-900", site: "西南-01", status: "运行", failureRate: 2.3, lastSeen: "3 分钟前" },
]

// ---------- Analysis: graph + timeline ----------
export type GraphNode = {
  id: string
  label: string
  type: "person" | "org" | "account" | "device" | "event"
  x: number
  y: number
  risk?: boolean
}
export type GraphEdge = { from: string; to: string; label: string }

export const GRAPH_NODES: GraphNode[] = [
  { id: "p1", label: "张伟", type: "person", x: 380, y: 200, risk: true },
  { id: "p2", label: "刘芳", type: "person", x: 180, y: 110 },
  { id: "o1", label: "锦程贸易", type: "org", x: 600, y: 120 },
  { id: "o2", label: "远大物流", type: "org", x: 620, y: 320 },
  { id: "ac1", label: "账户 ****8821", type: "account", x: 210, y: 320 },
  { id: "ac2", label: "账户 ****5570", type: "account", x: 400, y: 400 },
  { id: "ev1", label: "大额转账 ¥2.4M", type: "event", x: 120, y: 220, risk: true },
]

export const GRAPH_EDGES: GraphEdge[] = [
  { from: "p1", to: "o1", label: "法人" },
  { from: "p1", to: "ac1", label: "持有" },
  { from: "p2", to: "ac1", label: "共用" },
  { from: "ac1", to: "ev1", label: "发起" },
  { from: "p1", to: "o2", label: "股东" },
  { from: "o2", to: "ac2", label: "对公账户" },
  { from: "ac2", to: "ev1", label: "接收" },
]

export type TimelineEvent = {
  time: string
  title: string
  detail: string
  level: "info" | "warn" | "danger"
}

export const TIMELINE: TimelineEvent[] = [
  { time: "06-28 09:12", title: "账户 ****8821 注册", detail: "关联人：张伟", level: "info" },
  { time: "06-30 14:03", title: "锦程贸易 成立", detail: "法人变更为张伟", level: "info" },
  { time: "07-02 22:41", title: "异常登录", detail: "同一设备登录 3 个账户", level: "warn" },
  { time: "07-03 01:17", title: "大额转账 ¥2.4M", detail: "8821 → 5570，深夜发起", level: "danger" },
  { time: "07-03 01:19", title: "资金快速转出", detail: "5570 拆分至 6 个账户", level: "danger" },
]

// ---------- AIP Assist conversation ----------
export type TraceStep = {
  icon: "search" | "compute" | "cite" | "model"
  text: string
  meta: string
}

export const ASSIST_TRACE: TraceStep[] = [
  { icon: "search", text: "检索本体对象「设备」", meta: "命中 12,480 条" },
  { icon: "compute", text: "按站点聚合近 30 天故障率趋势", meta: "扫描 4.2M 传感器记录" },
  { icon: "model", text: "调用 Claude Opus 4.8 生成解读", meta: "1.8s" },
  { icon: "cite", text: "引用来源：pipeline_maintenance", meta: "血缘可追溯" },
]

export const ASSIST_SESSIONS = [
  { id: "s1", title: "哪些设备近30天故障率上升？", time: "刚刚" },
  { id: "s2", title: "锦程贸易的关联实体有哪些？", time: "1 小时前" },
  { id: "s3", title: "上季度华东区订单履约率", time: "昨天" },
]

// ---------- Data connectors ----------
export type Connector = {
  id: string
  name: string
  type: string
  status: "已连接" | "同步中" | "错误"
  records: string
  freq: string
}

export const CONNECTORS: Connector[] = [
  { id: "c1", name: "生产 PostgreSQL", type: "数据库", status: "已连接", records: "2.4M", freq: "实时" },
  { id: "c2", name: "IoT Kafka Stream", type: "流", status: "同步中", records: "4.2M/日", freq: "流式" },
  { id: "c3", name: "SAP ERP", type: "SaaS", status: "已连接", records: "1.2M", freq: "每小时" },
  { id: "c4", name: "S3 数据湖", type: "对象存储", status: "已连接", records: "38TB", freq: "每日" },
  { id: "c5", name: "Salesforce CRM", type: "SaaS", status: "错误", records: "—", freq: "每小时" },
]

export const CONNECTOR_CATALOG = [
  "PostgreSQL", "MySQL", "Oracle", "Kafka", "SAP", "Salesforce",
  "Snowflake", "S3", "REST API", "MongoDB", "BigQuery", "Excel",
]

// ---------- Pipeline (DAG) ----------
export type PipeNode = {
  id: string
  label: string
  kind: "source" | "transform" | "join" | "output"
  x: number
  y: number
}
export const PIPE_NODES: PipeNode[] = [
  { id: "n1", label: "erp_orders", kind: "source", x: 40, y: 60 },
  { id: "n2", label: "iot_sensor", kind: "source", x: 40, y: 200 },
  { id: "n3", label: "清洗 + 去重", kind: "transform", x: 260, y: 60 },
  { id: "n4", label: "聚合故障率", kind: "transform", x: 260, y: 200 },
  { id: "n5", label: "关联 Join", kind: "join", x: 480, y: 130 },
  { id: "n6", label: "设备对象", kind: "output", x: 700, y: 130 },
]
export const PIPE_EDGES = [
  { from: "n1", to: "n3" },
  { from: "n2", to: "n4" },
  { from: "n3", to: "n5" },
  { from: "n4", to: "n5" },
  { from: "n5", to: "n6" },
]

// ---------- Governance ----------
export type Grant = {
  role: string
  members: number
  read: boolean
  write: boolean
  admin: boolean
}
export const GRANTS: Grant[] = [
  { role: "平台管理员", members: 4, read: true, write: true, admin: true },
  { role: "数据工程师", members: 12, read: true, write: true, admin: false },
  { role: "分析师", members: 38, read: true, write: false, admin: false },
  { role: "调查员", members: 9, read: true, write: false, admin: false },
  { role: "外部审计", members: 3, read: true, write: false, admin: false },
]

export type AuditEntry = {
  time: string
  user: string
  action: string
  target: string
}
export const AUDIT: AuditEntry[] = [
  { time: "07-04 15:22", user: "李蔚", action: "编辑对象类型", target: "设备 Device" },
  { time: "07-04 14:08", user: "陈默", action: "运行管道", target: "pipeline_risk_score" },
  { time: "07-04 11:47", user: "王越", action: "授予访问权限", target: "crm_customers → 分析师" },
  { time: "07-04 09:31", user: "系统", action: "数据同步", target: "IoT Kafka Stream" },
  { time: "07-03 18:12", user: "张岚", action: "导出数据集", target: "erp_orders (脱敏)" },
]

export const LINEAGE = {
  upstream: ["erp_orders", "iot_sensor_stream"],
  node: "设备 Device",
  downstream: ["运营指挥台", "预测性维护", "pipeline_risk_score"],
}
