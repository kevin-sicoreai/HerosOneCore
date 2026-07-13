// Chinese display labels for ontology property names. Properties are
// auto-imported from the source dataset schema (English column names), so this
// maps the known demo-universe fields to Chinese for display. Unknown fields
// fall back to their raw name.
const FIELD_LABELS: Record<string, string> = {
  id: "ID",
  name: "名称",
  created_at: "创建时间",
  updated_at: "更新时间",
  status: "状态",
  amount: "金额",
  total_amount: "总金额",
  customer_id: "客户 ID",
  supplier_id: "供应商 ID",
  product_id: "产品 ID",
  warehouse_id: "仓库 ID",
  department_id: "部门 ID",
  region: "区域",
  city: "城市",
  category: "类别",
  rating: "评级",
  sku: "SKU",
  unit_cost: "单位成本",
  capacity: "容量",
  order_date: "下单日期",
  start_date: "开始日期",
  end_date: "结束日期",
  carrier: "承运商",
  title: "职位名称",
  stage: "阶段",
  source: "渠道",
  score: "绩效得分",
  result: "结果",
  reason: "原因",
}

export function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name
}
