// Chinese display labels for ontology property names. Properties are
// auto-imported from the source dataset schema (English column names), so this
// maps the known demo-universe fields to Chinese for display. Unknown fields
// fall back to their raw name.
const FIELD_LABELS: Record<string, string> = {
  id: "ID",
  name: "名称",
  email: "邮箱",
  created_at: "创建时间",
  updated_at: "更新时间",
  status: "状态",
  amount: "金额",
  customer_id: "客户 ID",
  region: "区域",
  rating: "评级",
  lead_time_days: "交期(天)",
  sku: "SKU",
  category: "类别",
  unit_cost: "单位成本",
  supplier_id: "供应商 ID",
  product_id: "产品 ID",
  warehouse_id: "仓库 ID",
  on_hand: "在库量",
  reorder_point: "再订货点",
  city: "城市",
  capacity: "容量",
  order_date: "下单日期",
  total_amount: "总金额",
  po_id: "采购单 ID",
  ship_date: "发运日期",
  eta: "预计到达",
  carrier: "承运商",
}

export function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name
}
