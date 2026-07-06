// Ontology module mock data — OWNED BY: 本体负责人 (ontology owner).
// Keep ontology-specific data here so it does not collide with lib/mock.ts.

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
