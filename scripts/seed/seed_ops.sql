-- Seed an "enterprise operations" dataset into the profile's source database.
-- Idempotent: drops and recreates all operations tables each run.
-- Reference date "today" = 2026-07-13; all event dates stay in the past ~24 months.
-- Volumes: departments 12, warehouses 8, suppliers 150, products 800,
--          customers 9000, sales_reps 180, orders 45000, order_items ~135k,
--          purchases 6000, inventory 6400, shipments ~38k, invoices ~41k,
--          payments ~37k, support_tickets 15000. (14 tables total.)
-- Object-type candidates stay under the platform's 50000-row fetch cap.

BEGIN;

DROP TABLE IF EXISTS payments, invoices, shipments, support_tickets, order_items,
                     orders, inventory, purchases, sales_reps, customers, products,
                     suppliers, warehouses, departments CASCADE;
DROP TABLE IF EXISTS leads, opportunities, quotes, quote_items, sales_contracts,
                     campaigns, channels, visits, stores, promotions, coupons,
                     product_reviews, price_lists, product_categories, boms, batches,
                     quality_checks, purchase_items, carriers, returns, stock_transfers,
                     stocktakes, purchase_contracts, supplier_evaluations, delivery_routes,
                     expenses, budgets, cost_centers, fixed_assets, payables, credit_notes,
                     bank_accounts, employees, projects, project_tasks, approvals,
                     ticket_replies, satisfaction_surveys, knowledge_articles, after_sales,
                     sla_policies, devices, software_licenses, maintenance_orders,
                     vehicles, energy_consumption CASCADE;

-- ── org & logistics reference ────────────────────────────────────────────
CREATE TABLE departments (
    id            INT PRIMARY KEY,
    name          VARCHAR(64) NOT NULL,
    city          VARCHAR(32) NOT NULL,
    budget_annual NUMERIC(14,2) NOT NULL
);
INSERT INTO departments (id, name, city, budget_annual)
SELECT i,
       (ARRAY['销售一部','销售二部','大客户部','电商运营部','市场部','采购部',
              '仓储物流部','客服部','财务部','质量管理部','数据运营部','综合管理部'])[i],
       (ARRAY['上海','北京','广州','深圳','杭州','成都','武汉','上海','北京','上海','杭州','上海'])[i],
       round((3000000 + random() * 20000000)::numeric, 2)
FROM generate_series(1, 12) AS i;

CREATE TABLE warehouses (
    id       INT PRIMARY KEY,
    name     VARCHAR(64) NOT NULL,
    city     VARCHAR(32) NOT NULL,
    capacity INT NOT NULL
);
INSERT INTO warehouses (id, name, city, capacity)
SELECT i,
       (ARRAY['华东一仓','华东二仓','华北中心仓','华南中心仓','西南仓','华中仓','东北仓','跨境保税仓'])[i],
       (ARRAY['上海','杭州','北京','广州','成都','武汉','沈阳','宁波'])[i],
       20000 + (random() * 80000)::int
FROM generate_series(1, 8) AS i;

-- ── supply side ──────────────────────────────────────────────────────────
CREATE TABLE suppliers (
    id            INT PRIMARY KEY,
    name          VARCHAR(128) NOT NULL,
    category      VARCHAR(32) NOT NULL,
    city          VARCHAR(32) NOT NULL,
    contact_name  VARCHAR(32) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    rating        NUMERIC(3,1) NOT NULL,
    created_at    DATE NOT NULL
);
INSERT INTO suppliers (id, name, category, city, contact_name, contact_phone, rating, created_at)
SELECT i,
       (ARRAY['华辰','中远','恒信','天工','联创','宏图','瑞泽','鼎盛','嘉益','正泰'])[1 + (random()*9)::int]
         || (ARRAY['科技','实业','制造','电子','材料','精密','智能','工贸'])[1 + (random()*7)::int]
         || '有限公司-' || i,
       (ARRAY['电子元件','机械配件','包装材料','原材料','办公用品','物流服务'])[1 + (random()*5)::int],
       (ARRAY['上海','深圳','苏州','东莞','宁波','青岛','天津','佛山'])[1 + (random()*7)::int],
       (ARRAY['王','李','张','刘','陈','杨','赵','黄'])[1 + (random()*7)::int]
         || (ARRAY['伟','敏','静','军','磊','洋','勇','艳'])[1 + (random()*7)::int],
       '1' || (30 + (random()*59)::int)::text || lpad((random()*99999999)::int::text, 8, '0'),
       round((2.5 + random() * 2.5)::numeric, 1),
       DATE '2026-07-13' - (90 + random() * 1800)::int
FROM generate_series(1, 150) AS i;

CREATE TABLE products (
    id          INT PRIMARY KEY,
    sku         VARCHAR(24) NOT NULL,
    name        VARCHAR(128) NOT NULL,
    category    VARCHAR(32) NOT NULL,
    supplier_id INT NOT NULL,
    unit_cost   NUMERIC(12,2) NOT NULL,
    unit_price  NUMERIC(12,2) NOT NULL,
    status      VARCHAR(16) NOT NULL,
    launched_at DATE NOT NULL
);
INSERT INTO products (id, sku, name, category, supplier_id, unit_cost, unit_price, status, launched_at)
SELECT i,
       'SKU-' || lpad(i::text, 6, '0'),
       (ARRAY['智能','便携','高性能','工业级','家用','商用','轻量','专业'])[1 + (random()*7)::int]
         || (ARRAY['传感器','控制器','显示模组','电源适配器','连接线缆','扫码枪','标签打印机','路由器','摄像头','工作站'])[1 + (random()*9)::int]
         || ' ' || chr(65 + (random()*25)::int) || (100 + (random()*899)::int)::text,
       (ARRAY['智能硬件','网络设备','办公设备','工业配件','安防设备','配套耗材'])[1 + (random()*5)::int],
       1 + (random() * 149)::int,
       round((20 + random() * 1500)::numeric, 2),
       0,  -- filled below from cost
       CASE WHEN random() < 0.88 THEN '在售' ELSE '停售' END,
       DATE '2026-07-13' - (30 + random() * 1400)::int
FROM generate_series(1, 800) AS i;
UPDATE products SET unit_price = round((unit_cost * (1.25 + random() * 0.9))::numeric, 2);

-- ── demand side ──────────────────────────────────────────────────────────
CREATE TABLE customers (
    id            INT PRIMARY KEY,
    name          VARCHAR(128) NOT NULL,
    industry      VARCHAR(32) NOT NULL,
    region        VARCHAR(16) NOT NULL,
    city          VARCHAR(32) NOT NULL,
    tier          VARCHAR(8) NOT NULL,
    contact_name  VARCHAR(32) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    credit_limit  NUMERIC(14,2) NOT NULL,
    created_at    DATE NOT NULL
);
INSERT INTO customers (id, name, industry, region, city, tier, contact_name, contact_phone, credit_limit, created_at)
SELECT i,
       (ARRAY['蓝海','星辰','远大','卓越','东方','光大','银河','恒基','新纪元','中科'])[1 + (random()*9)::int]
         || (ARRAY['集团','控股','科技','商贸','连锁','制造','能源','医疗','教育','物流'])[1 + (random()*9)::int]
         || '-' || i,
       (ARRAY['制造业','零售','金融','医疗','教育','物流','互联网','能源'])[1 + (random()*7)::int],
       (ARRAY['华东','华北','华南','西南','华中','东北'])[1 + (random()*5)::int],
       (ARRAY['上海','北京','广州','深圳','杭州','成都','武汉','南京','青岛','重庆'])[1 + (random()*9)::int],
       CASE WHEN random() < 0.12 THEN 'KA' WHEN random() < 0.42 THEN 'A' WHEN random() < 0.75 THEN 'B' ELSE 'C' END,
       (ARRAY['王','李','张','刘','陈','杨','周','吴'])[1 + (random()*7)::int]
         || (ARRAY['经理','总监','主管','采购'])[1 + (random()*3)::int],
       '1' || (30 + (random()*59)::int)::text || lpad((random()*99999999)::int::text, 8, '0'),
       round((50000 + random() * 5000000)::numeric, 2),
       DATE '2026-07-13' - (30 + random() * 1700)::int
FROM generate_series(1, 9000) AS i;

CREATE TABLE sales_reps (
    id            INT PRIMARY KEY,
    name          VARCHAR(32) NOT NULL,
    department_id INT NOT NULL,
    region        VARCHAR(16) NOT NULL,
    hired_at      DATE NOT NULL,
    quota_annual  NUMERIC(14,2) NOT NULL
);
INSERT INTO sales_reps (id, name, department_id, region, hired_at, quota_annual)
SELECT i,
       (ARRAY['王','李','张','刘','陈','杨','赵','黄','周','吴','徐','孙'])[1 + (random()*11)::int]
         || (ARRAY['伟','芳','娜','敏','静','磊','军','洋','勇','艳','杰','涛'])[1 + (random()*11)::int]
         || CASE WHEN random() < 0.3 THEN (ARRAY['华','明','林','珊','宇'])[1 + (random()*4)::int] ELSE '' END,
       1 + (random() * 3)::int,   -- 销售一部/二部/大客户部/电商运营部
       (ARRAY['华东','华北','华南','西南','华中','东北'])[1 + (random()*5)::int],
       DATE '2026-07-13' - (60 + random() * 2000)::int,
       round((1000000 + random() * 8000000)::numeric, 2)
FROM generate_series(1, 180) AS i;

-- ── orders & items (amounts backfilled from items) ───────────────────────
CREATE TABLE orders (
    id           INT PRIMARY KEY,
    order_no     VARCHAR(24) NOT NULL,
    customer_id  INT NOT NULL,
    sales_rep_id INT NOT NULL,
    order_date   DATE NOT NULL,
    status       VARCHAR(16) NOT NULL,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    item_count   INT NOT NULL DEFAULT 0
);
INSERT INTO orders (id, order_no, customer_id, sales_rep_id, order_date, status)
SELECT i,
       'SO-' || to_char(DATE '2026-07-13' - (random() * 730)::int, 'YYYYMMDD') || '-' || lpad(i::text, 6, '0'),
       1 + (random() * 8999)::int,
       1 + (random() * 179)::int,
       DATE '2026-07-13' - (random() * 730)::int,
       CASE WHEN random() < 0.62 THEN '已完成'
            WHEN random() < 0.55 THEN '已发货'
            WHEN random() < 0.60 THEN '待发货'
            ELSE '已取消' END
FROM generate_series(1, 45000) AS i;

CREATE TABLE order_items (
    id         INT PRIMARY KEY,
    order_id   INT NOT NULL,
    product_id INT NOT NULL,
    quantity   INT NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    amount     NUMERIC(14,2) NOT NULL
);
INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, amount)
SELECT row_number() OVER (),
       o.id,
       p.pid,
       q.qty,
       pr.unit_price,
       round(pr.unit_price * q.qty, 2)
FROM orders o
CROSS JOIN LATERAL (
    SELECT generate_series(1, 1 + (random() * 4)::int)
) AS lines(n)
CROSS JOIN LATERAL (SELECT 1 + (random() * 799)::int AS pid) AS p
CROSS JOIN LATERAL (SELECT 1 + (random() * 49)::int AS qty) AS q
JOIN products pr ON pr.id = p.pid;

UPDATE orders o SET
    total_amount = s.amt,
    item_count   = s.cnt
FROM (SELECT order_id, sum(amount) AS amt, count(*) AS cnt FROM order_items GROUP BY order_id) s
WHERE s.order_id = o.id;

-- ── procurement & inventory ──────────────────────────────────────────────
CREATE TABLE purchases (
    id            INT PRIMARY KEY,
    po_no         VARCHAR(24) NOT NULL,
    supplier_id   INT NOT NULL,
    warehouse_id  INT NOT NULL,
    order_date    DATE NOT NULL,
    expected_date DATE NOT NULL,
    received_date DATE,
    status        VARCHAR(16) NOT NULL,
    total_amount  NUMERIC(14,2) NOT NULL
);
INSERT INTO purchases (id, po_no, supplier_id, warehouse_id, order_date, expected_date, received_date, status, total_amount)
SELECT i,
       'PO-' || lpad(i::text, 6, '0'),
       1 + (random() * 149)::int,
       1 + (random() * 7)::int,
       d.od,
       d.od + 7 + (random() * 21)::int,
       CASE WHEN random() < 0.85 THEN d.od + 5 + (random() * 30)::int ELSE NULL END,
       CASE WHEN random() < 0.85 THEN '已入库' WHEN random() < 0.6 THEN '在途' ELSE '已下单' END,
       round((5000 + random() * 800000)::numeric, 2)
FROM generate_series(1, 6000) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random() * 720)::int AS od) AS d;

CREATE TABLE inventory (
    id           INT PRIMARY KEY,
    warehouse_id INT NOT NULL,
    product_id   INT NOT NULL,
    quantity     INT NOT NULL,
    safety_stock INT NOT NULL,
    updated_at   DATE NOT NULL
);
INSERT INTO inventory (id, warehouse_id, product_id, quantity, safety_stock, updated_at)
SELECT row_number() OVER (),
       w, p,
       (random() * 5000)::int,
       100 + (random() * 400)::int,
       DATE '2026-07-13' - (random() * 14)::int
FROM generate_series(1, 8) AS w, generate_series(1, 800) AS p;

-- ── fulfilment ───────────────────────────────────────────────────────────
CREATE TABLE shipments (
    id           INT PRIMARY KEY,
    order_id     INT NOT NULL,
    warehouse_id INT NOT NULL,
    carrier      VARCHAR(24) NOT NULL,
    shipped_at   DATE NOT NULL,
    delivered_at DATE,
    status       VARCHAR(16) NOT NULL
);
INSERT INTO shipments (id, order_id, warehouse_id, carrier, shipped_at, delivered_at, status)
SELECT row_number() OVER (),
       o.id,
       1 + (random() * 7)::int,
       (ARRAY['顺丰速运','中通快递','德邦物流','京东物流','邮政EMS','跨越速运'])[1 + (random()*5)::int],
       o.order_date + 1 + (random() * 3)::int,
       CASE WHEN o.status = '已完成' THEN o.order_date + 3 + (random() * 7)::int ELSE NULL END,
       CASE WHEN o.status = '已完成' THEN '已签收' ELSE '运输中' END
FROM orders o
WHERE o.status IN ('已完成', '已发货');

-- ── finance ──────────────────────────────────────────────────────────────
CREATE TABLE invoices (
    id         INT PRIMARY KEY,
    invoice_no VARCHAR(24) NOT NULL,
    order_id   INT NOT NULL,
    amount     NUMERIC(14,2) NOT NULL,
    issued_at  DATE NOT NULL,
    due_date   DATE NOT NULL,
    status     VARCHAR(16) NOT NULL
);
INSERT INTO invoices (id, invoice_no, order_id, amount, issued_at, due_date, status)
SELECT row_number() OVER (),
       'INV-' || lpad(row_number() OVER ()::text, 7, '0'),
       o.id,
       o.total_amount,
       o.order_date + 1,
       o.order_date + 31,
       CASE WHEN random() < 0.88 THEN '已回款' WHEN random() < 0.7 THEN '未到期' ELSE '逾期' END
FROM orders o
WHERE o.status IN ('已完成', '已发货');

CREATE TABLE payments (
    id         INT PRIMARY KEY,
    invoice_id INT NOT NULL,
    amount     NUMERIC(14,2) NOT NULL,
    paid_at    DATE NOT NULL,
    method     VARCHAR(16) NOT NULL
);
INSERT INTO payments (id, invoice_id, amount, paid_at, method)
SELECT row_number() OVER (),
       i.id,
       i.amount,
       i.issued_at + (random() * 45)::int,
       (ARRAY['银行转账','承兑汇票','在线支付'])[1 + (random()*2)::int]
FROM invoices i
WHERE i.status = '已回款';

-- ── customer service ─────────────────────────────────────────────────────
CREATE TABLE support_tickets (
    id           INT PRIMARY KEY,
    ticket_no    VARCHAR(24) NOT NULL,
    customer_id  INT NOT NULL,
    order_id     INT,
    category     VARCHAR(24) NOT NULL,
    priority     VARCHAR(8) NOT NULL,
    status       VARCHAR(16) NOT NULL,
    created_at   DATE NOT NULL,
    resolved_at  DATE,
    satisfaction INT
);
INSERT INTO support_tickets (id, ticket_no, customer_id, order_id, category, priority, status, created_at, resolved_at, satisfaction)
SELECT i,
       'TK-' || lpad(i::text, 7, '0'),
       1 + (random() * 8999)::int,
       CASE WHEN random() < 0.7 THEN 1 + (random() * 44999)::int ELSE NULL END,
       (ARRAY['物流咨询','产品质量','退换货','开票问题','技术支持','价格咨询'])[1 + (random()*5)::int],
       CASE WHEN random() < 0.15 THEN '紧急' WHEN random() < 0.5 THEN '高' ELSE '普通' END,
       CASE WHEN random() < 0.82 THEN '已解决' WHEN random() < 0.6 THEN '处理中' ELSE '待处理' END,
       d.cd,
       CASE WHEN random() < 0.82 THEN d.cd + (random() * 10)::int ELSE NULL END,
       CASE WHEN random() < 0.82 THEN 1 + (random() * 4)::int ELSE NULL END
FROM generate_series(1, 15000) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random() * 700)::int AS cd) AS d;

-- ═══ extended ontology domains (46 more tables) ═════════════════════════

-- ── CRM ──────────────────────────────────────────────────────────────────
CREATE TABLE leads (
    id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, company VARCHAR(128) NOT NULL,
    source VARCHAR(24) NOT NULL, status VARCHAR(16) NOT NULL,
    owner_rep_id INT NOT NULL, created_at DATE NOT NULL
);
INSERT INTO leads
SELECT i,
       (ARRAY['王','李','张','刘','陈','杨','周','吴'])[1+(random()*7)::int] || (ARRAY['先生','女士','经理','总监'])[1+(random()*3)::int],
       (ARRAY['迅达','博远','凯瑞','安顺','立丰','天诚','华跃','景鸿'])[1+(random()*7)::int] || (ARRAY['科技','贸易','实业','集团'])[1+(random()*3)::int] || '-' || i,
       (ARRAY['官网表单','展会','电话营销','老客推荐','广告投放','行业协会'])[1+(random()*5)::int],
       (ARRAY['新建','跟进中','已转化','已流失'])[1+(random()*3)::int],
       1+(random()*179)::int, DATE '2026-07-13' - (random()*540)::int
FROM generate_series(1, 8000) AS i;

CREATE TABLE opportunities (
    id INT PRIMARY KEY, name VARCHAR(128) NOT NULL, customer_id INT NOT NULL,
    stage VARCHAR(16) NOT NULL, amount NUMERIC(14,2) NOT NULL,
    probability INT NOT NULL, owner_rep_id INT NOT NULL,
    expected_close DATE NOT NULL, created_at DATE NOT NULL
);
INSERT INTO opportunities
SELECT i, '商机-' || (ARRAY['年度框架','设备采购','系统升级','扩容','试点'])[1+(random()*4)::int] || '-' || i,
       1+(random()*8999)::int,
       (ARRAY['初步接触','需求确认','方案报价','商务谈判','赢单','丢单'])[1+(random()*5)::int],
       round((50000 + random()*3000000)::numeric,2), (random()*100)::int,
       1+(random()*179)::int, d.cd + 30 + (random()*90)::int, d.cd
FROM generate_series(1, 5000) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random()*540)::int AS cd) AS d;

CREATE TABLE quotes (
    id INT PRIMARY KEY, quote_no VARCHAR(24) NOT NULL, customer_id INT NOT NULL,
    total_amount NUMERIC(14,2) NOT NULL, status VARCHAR(16) NOT NULL,
    valid_until DATE NOT NULL, created_at DATE NOT NULL
);
INSERT INTO quotes
SELECT i, 'QT-' || lpad(i::text,6,'0'), 1+(random()*8999)::int,
       round((20000 + random()*1500000)::numeric,2),
       (ARRAY['草稿','已发送','已接受','已过期'])[1+(random()*3)::int],
       d.cd + 30, d.cd
FROM generate_series(1, 6000) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random()*540)::int AS cd) AS d;

CREATE TABLE quote_items (
    id INT PRIMARY KEY, quote_id INT NOT NULL, product_id INT NOT NULL,
    quantity INT NOT NULL, unit_price NUMERIC(12,2) NOT NULL, discount_pct NUMERIC(5,2) NOT NULL
);
INSERT INTO quote_items
SELECT i, 1+(random()*5999)::int, 1+(random()*799)::int, 1+(random()*99)::int,
       round((20 + random()*2000)::numeric,2), round((random()*15)::numeric,2)
FROM generate_series(1, 15000) AS i;

CREATE TABLE sales_contracts (
    id INT PRIMARY KEY, contract_no VARCHAR(24) NOT NULL, customer_id INT NOT NULL,
    amount NUMERIC(14,2) NOT NULL, signed_at DATE NOT NULL,
    start_date DATE NOT NULL, end_date DATE NOT NULL, status VARCHAR(16) NOT NULL
);
INSERT INTO sales_contracts
SELECT i, 'CT-' || lpad(i::text,6,'0'), 1+(random()*8999)::int,
       round((100000 + random()*8000000)::numeric,2), d.sd, d.sd + 7, d.sd + 372,
       (ARRAY['履约中','已完成','已终止'])[1+(random()*2)::int]
FROM generate_series(1, 3000) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random()*700)::int AS sd) AS d;

CREATE TABLE campaigns (
    id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, channel VARCHAR(24) NOT NULL,
    budget NUMERIC(14,2) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
    status VARCHAR(16) NOT NULL, leads_target INT NOT NULL
);
INSERT INTO campaigns
SELECT i, (ARRAY['春季','618','双11','年末','新品','行业展'])[1+(random()*5)::int] || '推广-' || i,
       (ARRAY['搜索广告','信息流','展会','直播','社群'])[1+(random()*4)::int],
       round((50000 + random()*2000000)::numeric,2), d.sd, d.sd + 14 + (random()*45)::int,
       (ARRAY['进行中','已结束','已暂停'])[1+(random()*2)::int], 100 + (random()*2000)::int
FROM generate_series(1, 120) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random()*700)::int AS sd) AS d;

CREATE TABLE channels (
    id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, type VARCHAR(24) NOT NULL,
    region VARCHAR(16) NOT NULL, manager VARCHAR(32) NOT NULL
);
INSERT INTO channels
SELECT i, (ARRAY['直销','经销','电商平台','门店','大客户'])[1+(random()*4)::int] || '渠道-' || i,
       (ARRAY['直营','分销','线上','KA'])[1+(random()*3)::int],
       (ARRAY['华东','华北','华南','西南','华中','东北'])[1+(random()*5)::int],
       (ARRAY['王','李','张','刘'])[1+(random()*3)::int] || (ARRAY['勇','杰','涛','敏'])[1+(random()*3)::int]
FROM generate_series(1, 40) AS i;

CREATE TABLE visits (
    id INT PRIMARY KEY, customer_id INT NOT NULL, sales_rep_id INT NOT NULL,
    visit_date DATE NOT NULL, purpose VARCHAR(24) NOT NULL, outcome VARCHAR(16) NOT NULL
);
INSERT INTO visits
SELECT i, 1+(random()*8999)::int, 1+(random()*179)::int,
       DATE '2026-07-13' - (random()*540)::int,
       (ARRAY['需求调研','方案讲解','商务谈判','售后回访','关系维护'])[1+(random()*4)::int],
       (ARRAY['达成意向','继续跟进','暂无需求'])[1+(random()*2)::int]
FROM generate_series(1, 12000) AS i;

-- ── retail ───────────────────────────────────────────────────────────────
CREATE TABLE stores (
    id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, city VARCHAR(32) NOT NULL,
    region VARCHAR(16) NOT NULL, manager VARCHAR(32) NOT NULL,
    opened_at DATE NOT NULL, area_sqm INT NOT NULL
);
INSERT INTO stores
SELECT i, (ARRAY['上海','北京','广州','深圳','杭州','成都','武汉','南京'])[1+(random()*7)::int] || '体验店-' || i,
       (ARRAY['上海','北京','广州','深圳','杭州','成都','武汉','南京'])[1+(random()*7)::int],
       (ARRAY['华东','华北','华南','西南','华中','东北'])[1+(random()*5)::int],
       (ARRAY['王','李','张','刘'])[1+(random()*3)::int] || '店长',
       DATE '2026-07-13' - (180 + random()*1600)::int, 80 + (random()*400)::int
FROM generate_series(1, 60) AS i;

CREATE TABLE promotions (
    id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, type VARCHAR(16) NOT NULL,
    discount_pct NUMERIC(5,2) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
    status VARCHAR(16) NOT NULL
);
INSERT INTO promotions
SELECT i, (ARRAY['满减','折扣','买赠','秒杀','清仓'])[1+(random()*4)::int] || '活动-' || i,
       (ARRAY['满减','折扣','买赠','秒杀'])[1+(random()*3)::int],
       round((5 + random()*30)::numeric,2), d.sd, d.sd + 3 + (random()*14)::int,
       (ARRAY['进行中','已结束','未开始'])[1+(random()*2)::int]
FROM generate_series(1, 300) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random()*600)::int AS sd) AS d;

CREATE TABLE coupons (
    id INT PRIMARY KEY, code VARCHAR(24) NOT NULL, customer_id INT NOT NULL,
    amount NUMERIC(10,2) NOT NULL, status VARCHAR(16) NOT NULL,
    issued_at DATE NOT NULL, used_at DATE
);
INSERT INTO coupons
SELECT i, 'CP' || lpad(i::text,8,'0'), 1+(random()*8999)::int,
       (ARRAY[50,100,200,500,1000])[1+(random()*4)::int],
       CASE WHEN random()<0.45 THEN '已使用' WHEN random()<0.7 THEN '未使用' ELSE '已过期' END,
       d.iss, CASE WHEN random()<0.45 THEN d.iss + (random()*30)::int ELSE NULL END
FROM generate_series(1, 20000) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random()*540)::int AS iss) AS d;

CREATE TABLE product_reviews (
    id INT PRIMARY KEY, product_id INT NOT NULL, customer_id INT NOT NULL,
    rating INT NOT NULL, tag VARCHAR(24) NOT NULL, created_at DATE NOT NULL
);
INSERT INTO product_reviews
SELECT i, 1+(random()*799)::int, 1+(random()*8999)::int, 1+(random()*4)::int,
       (ARRAY['质量好','物流快','性价比高','包装完好','有瑕疵','描述不符','服务好'])[1+(random()*6)::int],
       DATE '2026-07-13' - (random()*700)::int
FROM generate_series(1, 25000) AS i;

CREATE TABLE price_lists (
    id INT PRIMARY KEY, product_id INT NOT NULL, tier VARCHAR(8) NOT NULL,
    price NUMERIC(12,2) NOT NULL, effective_from DATE NOT NULL
);
INSERT INTO price_lists
SELECT row_number() OVER (), p, t.tier,
       round((20 + random()*2000)::numeric,2), DATE '2026-01-01'
FROM generate_series(1, 800) AS p
CROSS JOIN (VALUES ('KA'),('A')) AS t(tier);

-- ── product & quality ────────────────────────────────────────────────────
CREATE TABLE product_categories (
    id INT PRIMARY KEY, name VARCHAR(32) NOT NULL, parent_name VARCHAR(32)
);
INSERT INTO product_categories
SELECT i, (ARRAY['智能硬件','网络设备','办公设备','工业配件','安防设备','配套耗材',
              '传感器','控制器','显示设备','电源设备','线缆','打印设备','扫码设备','路由交换',
              '监控摄像','存储设备','服务器','工作站','终端','配件包','标签耗材','墨盒硒鼓',
              '安装支架','转接模块','测试仪器','工具套装','防护用品','清洁用品','包装材料','其他'])[i],
       CASE WHEN i > 6 THEN (ARRAY['智能硬件','网络设备','办公设备','工业配件','安防设备','配套耗材'])[1+(random()*5)::int] ELSE NULL END
FROM generate_series(1, 30) AS i;

CREATE TABLE boms (
    id INT PRIMARY KEY, product_id INT NOT NULL, component_id INT NOT NULL, quantity INT NOT NULL
);
INSERT INTO boms
SELECT i, 1+(random()*799)::int, 1+(random()*799)::int, 1+(random()*9)::int
FROM generate_series(1, 2000) AS i;

CREATE TABLE batches (
    id INT PRIMARY KEY, batch_no VARCHAR(24) NOT NULL, product_id INT NOT NULL,
    quantity INT NOT NULL, produced_at DATE NOT NULL, expiry_date DATE, status VARCHAR(16) NOT NULL
);
INSERT INTO batches
SELECT i, 'BA-' || lpad(i::text,6,'0'), 1+(random()*799)::int, 100+(random()*5000)::int,
       d.pd, d.pd + 720, (ARRAY['在库','已出库','已冻结'])[1+(random()*2)::int]
FROM generate_series(1, 4000) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random()*700)::int AS pd) AS d;

CREATE TABLE quality_checks (
    id INT PRIMARY KEY, batch_id INT NOT NULL, check_date DATE NOT NULL,
    inspector VARCHAR(32) NOT NULL, result VARCHAR(8) NOT NULL, defect_rate NUMERIC(5,2) NOT NULL
);
INSERT INTO quality_checks
SELECT i, 1+(random()*3999)::int, DATE '2026-07-13' - (random()*700)::int,
       (ARRAY['王','李','张','刘'])[1+(random()*3)::int] || (ARRAY['工','检','明','强'])[1+(random()*3)::int],
       CASE WHEN random()<0.94 THEN '合格' ELSE '不合格' END,
       round((random()*5)::numeric,2)
FROM generate_series(1, 6000) AS i;

-- ── supply chain extras ──────────────────────────────────────────────────
CREATE TABLE purchase_items (
    id INT PRIMARY KEY, purchase_id INT NOT NULL, product_id INT NOT NULL,
    quantity INT NOT NULL, unit_cost NUMERIC(12,2) NOT NULL, amount NUMERIC(14,2) NOT NULL
);
INSERT INTO purchase_items
SELECT i, 1+(random()*5999)::int, 1+(random()*799)::int, q.qty,
       c.cost, round((c.cost * q.qty)::numeric, 2)
FROM generate_series(1, 18000) AS i
CROSS JOIN LATERAL (SELECT 10+(random()*500)::int AS qty) AS q
CROSS JOIN LATERAL (SELECT round((15 + random()*1200)::numeric,2) AS cost) AS c;

CREATE TABLE carriers (
    id INT PRIMARY KEY, name VARCHAR(32) NOT NULL, type VARCHAR(16) NOT NULL,
    rating NUMERIC(3,1) NOT NULL, contact_phone VARCHAR(20) NOT NULL
);
INSERT INTO carriers
SELECT i, (ARRAY['顺丰速运','中通快递','德邦物流','京东物流','邮政EMS','跨越速运','安能物流','壹米滴答',
              '百世快运','韵达快运','极兔速递','丹鸟物流','日日顺','联邦快递','DHL','中外运',
              '嘉里物流','海航物流','远成物流','盛辉物流','速尔快递','优速快递','天地华宇','中铁快运','城际专线'])[i],
       (ARRAY['快递','快运','整车','冷链'])[1+(random()*3)::int],
       round((3 + random()*2)::numeric,1),
       '1' || (30+(random()*59)::int)::text || lpad((random()*99999999)::int::text,8,'0')
FROM generate_series(1, 25) AS i;

CREATE TABLE returns (
    id INT PRIMARY KEY, return_no VARCHAR(24) NOT NULL, order_id INT NOT NULL,
    reason VARCHAR(24) NOT NULL, status VARCHAR(16) NOT NULL,
    amount NUMERIC(14,2) NOT NULL, created_at DATE NOT NULL
);
INSERT INTO returns
SELECT i, 'RT-' || lpad(i::text,6,'0'), 1+(random()*44999)::int,
       (ARRAY['质量问题','发错货','客户取消','运输破损','七天无理由'])[1+(random()*4)::int],
       (ARRAY['已退款','处理中','已拒绝'])[1+(random()*2)::int],
       round((100 + random()*50000)::numeric,2), DATE '2026-07-13' - (random()*700)::int
FROM generate_series(1, 3000) AS i;

CREATE TABLE stock_transfers (
    id INT PRIMARY KEY, transfer_no VARCHAR(24) NOT NULL, from_warehouse_id INT NOT NULL,
    to_warehouse_id INT NOT NULL, product_id INT NOT NULL, quantity INT NOT NULL,
    status VARCHAR(16) NOT NULL, created_at DATE NOT NULL
);
INSERT INTO stock_transfers
SELECT i, 'TR-' || lpad(i::text,6,'0'), 1+(random()*7)::int, 1+(random()*7)::int,
       1+(random()*799)::int, 10+(random()*1000)::int,
       (ARRAY['已完成','在途','已取消'])[1+(random()*2)::int],
       DATE '2026-07-13' - (random()*600)::int
FROM generate_series(1, 2500) AS i;

CREATE TABLE stocktakes (
    id INT PRIMARY KEY, warehouse_id INT NOT NULL, product_id INT NOT NULL,
    expected_qty INT NOT NULL, actual_qty INT NOT NULL, diff INT NOT NULL, checked_at DATE NOT NULL
);
INSERT INTO stocktakes
SELECT row_number() OVER (), w, 1+(random()*799)::int, q.eq,
       q.eq + (random()*20)::int - 10, (random()*20)::int - 10,
       DATE '2026-07-13' - (random()*90)::int
FROM generate_series(1, 8) AS w, generate_series(1, 200) AS n
CROSS JOIN LATERAL (SELECT (random()*3000)::int AS eq) AS q;

CREATE TABLE purchase_contracts (
    id INT PRIMARY KEY, contract_no VARCHAR(24) NOT NULL, supplier_id INT NOT NULL,
    amount NUMERIC(14,2) NOT NULL, signed_at DATE NOT NULL, end_date DATE NOT NULL, status VARCHAR(16) NOT NULL
);
INSERT INTO purchase_contracts
SELECT i, 'PC-' || lpad(i::text,6,'0'), 1+(random()*149)::int,
       round((200000 + random()*5000000)::numeric,2), d.sd, d.sd + 365,
       (ARRAY['履约中','已完成','已终止'])[1+(random()*2)::int]
FROM generate_series(1, 800) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random()*700)::int AS sd) AS d;

CREATE TABLE supplier_evaluations (
    id INT PRIMARY KEY, supplier_id INT NOT NULL, period VARCHAR(8) NOT NULL,
    quality_score NUMERIC(4,1) NOT NULL, delivery_score NUMERIC(4,1) NOT NULL,
    price_score NUMERIC(4,1) NOT NULL, total_score NUMERIC(4,1) NOT NULL
);
INSERT INTO supplier_evaluations
SELECT row_number() OVER (), s, p.period, q.q, q.d, q.p,
       round(((q.q + q.d + q.p) / 3)::numeric, 1)
FROM generate_series(1, 150) AS s
CROSS JOIN (VALUES ('2025-H1'),('2025-H2'),('2026-H1'),('2024-H2')) AS p(period)
CROSS JOIN LATERAL (
  SELECT round((60+random()*40)::numeric,1) AS q,
         round((60+random()*40)::numeric,1) AS d,
         round((60+random()*40)::numeric,1) AS p
) AS q;

CREATE TABLE delivery_routes (
    id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, from_city VARCHAR(32) NOT NULL,
    to_city VARCHAR(32) NOT NULL, carrier_id INT NOT NULL,
    avg_days NUMERIC(4,1) NOT NULL, cost_per_kg NUMERIC(8,2) NOT NULL
);
INSERT INTO delivery_routes
SELECT i, c1.c || '→' || c2.c || ' 线路', c1.c, c2.c, 1+(random()*24)::int,
       round((0.5 + random()*5)::numeric,1), round((0.8 + random()*8)::numeric,2)
FROM generate_series(1, 150) AS i
CROSS JOIN LATERAL (SELECT (ARRAY['上海','北京','广州','深圳','杭州','成都','武汉','沈阳','宁波','青岛'])[1+(random()*9)::int] AS c) AS c1
CROSS JOIN LATERAL (SELECT (ARRAY['南京','重庆','西安','长沙','郑州','天津','合肥','福州','昆明','贵阳'])[1+(random()*9)::int] AS c) AS c2;

-- ── finance ──────────────────────────────────────────────────────────────
CREATE TABLE expenses (
    id INT PRIMARY KEY, expense_no VARCHAR(24) NOT NULL, employee_id INT NOT NULL,
    department_id INT NOT NULL, category VARCHAR(24) NOT NULL,
    amount NUMERIC(12,2) NOT NULL, expense_date DATE NOT NULL, status VARCHAR(16) NOT NULL
);
INSERT INTO expenses
SELECT i, 'EX-' || lpad(i::text,7,'0'), 1+(random()*1199)::int, 1+(random()*11)::int,
       (ARRAY['差旅','招待','办公','培训','交通','通讯','市场推广'])[1+(random()*6)::int],
       round((100 + random()*20000)::numeric,2), DATE '2026-07-13' - (random()*700)::int,
       (ARRAY['已报销','审批中','已驳回'])[1+(random()*2)::int]
FROM generate_series(1, 20000) AS i;

CREATE TABLE budgets (
    id INT PRIMARY KEY, department_id INT NOT NULL, period VARCHAR(8) NOT NULL,
    amount_budget NUMERIC(14,2) NOT NULL, amount_actual NUMERIC(14,2) NOT NULL
);
INSERT INTO budgets
SELECT row_number() OVER (), d, to_char(DATE '2024-08-01' + (m || ' month')::interval, 'YYYY-MM'),
       b.amt, round((b.amt * (0.6 + random()*0.5))::numeric, 2)
FROM generate_series(1, 12) AS d, generate_series(0, 23) AS m
CROSS JOIN LATERAL (SELECT round((200000 + random()*2000000)::numeric,2) AS amt) AS b;

CREATE TABLE cost_centers (
    id INT PRIMARY KEY, code VARCHAR(16) NOT NULL, name VARCHAR(64) NOT NULL, department_id INT NOT NULL
);
INSERT INTO cost_centers
SELECT i, 'CC-' || lpad(i::text,4,'0'),
       (ARRAY['销售费用','管理费用','研发费用','制造费用','物流费用','营销费用'])[1+(random()*5)::int] || '中心-' || i,
       1+(random()*11)::int
FROM generate_series(1, 24) AS i;

CREATE TABLE fixed_assets (
    id INT PRIMARY KEY, asset_no VARCHAR(24) NOT NULL, name VARCHAR(64) NOT NULL,
    category VARCHAR(24) NOT NULL, department_id INT NOT NULL, purchase_date DATE NOT NULL,
    original_value NUMERIC(14,2) NOT NULL, net_value NUMERIC(14,2) NOT NULL, status VARCHAR(16) NOT NULL
);
INSERT INTO fixed_assets
SELECT i, 'FA-' || lpad(i::text,6,'0'),
       (ARRAY['生产设备','检测仪器','办公家具','运输车辆','机房设备','空调系统'])[1+(random()*5)::int] || '-' || i,
       (ARRAY['设备','仪器','家具','车辆','IT'])[1+(random()*4)::int],
       1+(random()*11)::int, DATE '2026-07-13' - (180 + random()*2000)::int,
       v.ov, round((v.ov * (0.2 + random()*0.7))::numeric,2),
       (ARRAY['在用','闲置','报废'])[1+(random()*2)::int]
FROM generate_series(1, 1500) AS i
CROSS JOIN LATERAL (SELECT round((5000 + random()*500000)::numeric,2) AS ov) AS v;

CREATE TABLE payables (
    id INT PRIMARY KEY, payable_no VARCHAR(24) NOT NULL, supplier_id INT NOT NULL,
    purchase_id INT NOT NULL, amount NUMERIC(14,2) NOT NULL,
    due_date DATE NOT NULL, paid_at DATE, status VARCHAR(16) NOT NULL
);
INSERT INTO payables
SELECT i, 'AP-' || lpad(i::text,6,'0'), 1+(random()*149)::int, 1+(random()*5999)::int,
       round((5000 + random()*800000)::numeric,2), d.dd,
       CASE WHEN random()<0.8 THEN d.dd - (random()*20)::int ELSE NULL END,
       CASE WHEN random()<0.8 THEN '已付款' ELSE '待付款' END
FROM generate_series(1, 6000) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random()*600)::int AS dd) AS d;

CREATE TABLE credit_notes (
    id INT PRIMARY KEY, note_no VARCHAR(24) NOT NULL, invoice_id INT NOT NULL,
    amount NUMERIC(14,2) NOT NULL, reason VARCHAR(24) NOT NULL, issued_at DATE NOT NULL
);
INSERT INTO credit_notes
SELECT i, 'CN-' || lpad(i::text,6,'0'), 1+(random()*40000)::int,
       round((100 + random()*30000)::numeric,2),
       (ARRAY['退货折让','价格调整','质量赔偿','开票错误'])[1+(random()*3)::int],
       DATE '2026-07-13' - (random()*600)::int
FROM generate_series(1, 1200) AS i;

CREATE TABLE bank_accounts (
    id INT PRIMARY KEY, account_no VARCHAR(32) NOT NULL, bank_name VARCHAR(64) NOT NULL,
    currency VARCHAR(8) NOT NULL, balance NUMERIC(16,2) NOT NULL, type VARCHAR(16) NOT NULL
);
INSERT INTO bank_accounts
SELECT i, '6222' || lpad((random()*999999999999)::bigint::text,12,'0'),
       (ARRAY['工商银行','建设银行','招商银行','中国银行','浦发银行','交通银行'])[1+(random()*5)::int] || '营业部',
       CASE WHEN random()<0.85 THEN 'CNY' ELSE 'USD' END,
       round((100000 + random()*50000000)::numeric,2),
       (ARRAY['基本户','一般户','专用户'])[1+(random()*2)::int]
FROM generate_series(1, 20) AS i;

-- ── org & projects ───────────────────────────────────────────────────────
CREATE TABLE employees (
    id INT PRIMARY KEY, name VARCHAR(32) NOT NULL, department_id INT NOT NULL,
    position VARCHAR(32) NOT NULL, hired_at DATE NOT NULL, status VARCHAR(8) NOT NULL, city VARCHAR(32) NOT NULL
);
INSERT INTO employees
SELECT i,
       (ARRAY['王','李','张','刘','陈','杨','赵','黄','周','吴','徐','孙','马','朱','胡','郭'])[1+(random()*15)::int]
         || (ARRAY['伟','芳','娜','敏','静','磊','军','洋','勇','艳','杰','涛','明','超','秀英','霞'])[1+(random()*15)::int],
       1+(random()*11)::int,
       (ARRAY['专员','主管','经理','高级经理','总监'])[1+(random()*4)::int],
       DATE '2026-07-13' - (30 + random()*2500)::int,
       CASE WHEN random()<0.92 THEN '在职' ELSE '离职' END,
       (ARRAY['上海','北京','广州','深圳','杭州','成都','武汉'])[1+(random()*6)::int]
FROM generate_series(1, 1200) AS i;

CREATE TABLE projects (
    id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, department_id INT NOT NULL,
    owner_id INT NOT NULL, budget NUMERIC(14,2) NOT NULL, start_date DATE NOT NULL,
    end_date DATE NOT NULL, status VARCHAR(16) NOT NULL, progress_pct INT NOT NULL
);
INSERT INTO projects
SELECT i, (ARRAY['数字化转型','仓储自动化','渠道拓展','产品升级','降本增效','客户体验优化'])[1+(random()*5)::int] || '项目-' || i,
       1+(random()*11)::int, 1+(random()*1199)::int,
       round((100000 + random()*5000000)::numeric,2), d.sd, d.sd + 90 + (random()*270)::int,
       (ARRAY['进行中','已完成','已暂停'])[1+(random()*2)::int], (random()*100)::int
FROM generate_series(1, 200) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random()*700)::int AS sd) AS d;

CREATE TABLE project_tasks (
    id INT PRIMARY KEY, project_id INT NOT NULL, name VARCHAR(64) NOT NULL,
    assignee_id INT NOT NULL, due_date DATE NOT NULL, status VARCHAR(16) NOT NULL, priority VARCHAR(8) NOT NULL
);
INSERT INTO project_tasks
SELECT i, 1+(random()*199)::int,
       (ARRAY['需求分析','方案设计','开发实施','测试验收','上线部署','复盘总结'])[1+(random()*5)::int] || '-' || i,
       1+(random()*1199)::int, DATE '2026-07-13' - (random()*400)::int + 60,
       (ARRAY['已完成','进行中','未开始','已阻塞'])[1+(random()*3)::int],
       (ARRAY['高','中','低'])[1+(random()*2)::int]
FROM generate_series(1, 4000) AS i;

CREATE TABLE approvals (
    id INT PRIMARY KEY, approval_no VARCHAR(24) NOT NULL, type VARCHAR(24) NOT NULL,
    applicant_id INT NOT NULL, amount NUMERIC(14,2), status VARCHAR(16) NOT NULL,
    submitted_at DATE NOT NULL, approved_at DATE
);
INSERT INTO approvals
SELECT i, 'AP' || lpad(i::text,7,'0'),
       (ARRAY['费用报销','采购申请','合同用印','请假','出差','付款申请'])[1+(random()*5)::int],
       1+(random()*1199)::int, round((random()*100000)::numeric,2),
       CASE WHEN random()<0.85 THEN '已通过' WHEN random()<0.6 THEN '审批中' ELSE '已驳回' END,
       d.sd, CASE WHEN random()<0.85 THEN d.sd + (random()*5)::int ELSE NULL END
FROM generate_series(1, 8000) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random()*600)::int AS sd) AS d;

-- ── customer service extras ──────────────────────────────────────────────
CREATE TABLE ticket_replies (
    id INT PRIMARY KEY, ticket_id INT NOT NULL, replier VARCHAR(32) NOT NULL,
    reply_at DATE NOT NULL, channel VARCHAR(16) NOT NULL
);
INSERT INTO ticket_replies
SELECT i, 1+(random()*14999)::int,
       (ARRAY['客服小王','客服小李','客服小张','技术支持','值班主管'])[1+(random()*4)::int],
       DATE '2026-07-13' - (random()*700)::int,
       (ARRAY['电话','在线聊天','邮件','工单系统'])[1+(random()*3)::int]
FROM generate_series(1, 30000) AS i;

CREATE TABLE satisfaction_surveys (
    id INT PRIMARY KEY, ticket_id INT NOT NULL, score INT NOT NULL,
    comment_tag VARCHAR(24) NOT NULL, surveyed_at DATE NOT NULL
);
INSERT INTO satisfaction_surveys
SELECT i, 1+(random()*14999)::int, 1+(random()*4)::int,
       (ARRAY['响应及时','解决彻底','态度好','等待过久','未解决','需要回访'])[1+(random()*5)::int],
       DATE '2026-07-13' - (random()*700)::int
FROM generate_series(1, 9000) AS i;

CREATE TABLE knowledge_articles (
    id INT PRIMARY KEY, title VARCHAR(128) NOT NULL, category VARCHAR(24) NOT NULL,
    author VARCHAR(32) NOT NULL, views INT NOT NULL, updated_at DATE NOT NULL
);
INSERT INTO knowledge_articles
SELECT i, (ARRAY['如何处理','常见问题:','操作指南:','故障排查:'])[1+(random()*3)::int]
         || (ARRAY['退换货流程','发票开具','物流查询','产品激活','固件升级','保修政策','对账流程','账号权限'])[1+(random()*7)::int],
       (ARRAY['售后','财务','物流','产品','系统'])[1+(random()*4)::int],
       (ARRAY['王编辑','李专员','张主管','知识库管理员'])[1+(random()*3)::int],
       (random()*50000)::int, DATE '2026-07-13' - (random()*400)::int
FROM generate_series(1, 400) AS i;

CREATE TABLE after_sales (
    id INT PRIMARY KEY, service_no VARCHAR(24) NOT NULL, order_id INT NOT NULL,
    type VARCHAR(16) NOT NULL, status VARCHAR(16) NOT NULL, cost NUMERIC(12,2) NOT NULL,
    created_at DATE NOT NULL, finished_at DATE
);
INSERT INTO after_sales
SELECT i, 'AS-' || lpad(i::text,6,'0'), 1+(random()*44999)::int,
       (ARRAY['维修','换新','退货','上门安装','远程支持'])[1+(random()*4)::int],
       (ARRAY['已完成','处理中','待派单'])[1+(random()*2)::int],
       round((random()*5000)::numeric,2), d.cd,
       CASE WHEN random()<0.8 THEN d.cd + (random()*15)::int ELSE NULL END
FROM generate_series(1, 4000) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random()*700)::int AS cd) AS d;

CREATE TABLE sla_policies (
    id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, priority VARCHAR(8) NOT NULL,
    response_hours INT NOT NULL, resolve_hours INT NOT NULL
);
INSERT INTO sla_policies
SELECT i, (ARRAY['紧急故障','高优先级','普通咨询','低优先级'])[1+((i-1)%4)] || ' SLA-' || i,
       (ARRAY['紧急','高','普通','低'])[1+((i-1)%4)],
       (ARRAY[1,2,8,24])[1+((i-1)%4)], (ARRAY[4,24,72,168])[1+((i-1)%4)]
FROM generate_series(1, 12) AS i;

-- ── IT assets ────────────────────────────────────────────────────────────
CREATE TABLE devices (
    id INT PRIMARY KEY, asset_tag VARCHAR(24) NOT NULL, type VARCHAR(16) NOT NULL,
    brand VARCHAR(24) NOT NULL, user_employee_id INT, status VARCHAR(16) NOT NULL, purchased_at DATE NOT NULL
);
INSERT INTO devices
SELECT i, 'IT-' || lpad(i::text,5,'0'),
       (ARRAY['笔记本','台式机','显示器','打印机','手机','平板'])[1+(random()*5)::int],
       (ARRAY['联想','戴尔','惠普','苹果','华为','小米'])[1+(random()*5)::int],
       CASE WHEN random()<0.85 THEN 1+(random()*1199)::int ELSE NULL END,
       (ARRAY['在用','库存','维修中','报废'])[1+(random()*3)::int],
       DATE '2026-07-13' - (30 + random()*1500)::int
FROM generate_series(1, 900) AS i;

CREATE TABLE software_licenses (
    id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, vendor VARCHAR(32) NOT NULL,
    seats INT NOT NULL, seats_used INT NOT NULL, expires_at DATE NOT NULL, annual_cost NUMERIC(12,2) NOT NULL
);
INSERT INTO software_licenses
SELECT i, (ARRAY['办公套件','ERP系统','CRM系统','设计软件','开发工具','杀毒软件','视频会议','云存储'])[1+(random()*7)::int] || ' 许可-' || i,
       (ARRAY['微软','金蝶','用友','Adobe','JetBrains','奇安信','腾讯','阿里云'])[1+(random()*7)::int],
       s.st, (s.st * (0.5 + random()*0.5))::int,
       DATE '2026-07-13' + (random()*365)::int,
       round((5000 + random()*500000)::numeric,2)
FROM generate_series(1, 150) AS i
CROSS JOIN LATERAL (SELECT 10+(random()*500)::int AS st) AS s;

CREATE TABLE maintenance_orders (
    id INT PRIMARY KEY, order_no VARCHAR(24) NOT NULL, device_id INT NOT NULL,
    issue VARCHAR(64) NOT NULL, status VARCHAR(16) NOT NULL, cost NUMERIC(10,2) NOT NULL,
    created_at DATE NOT NULL, finished_at DATE
);
INSERT INTO maintenance_orders
SELECT i, 'MO-' || lpad(i::text,6,'0'), 1+(random()*899)::int,
       (ARRAY['无法开机','屏幕故障','键盘失灵','系统重装','网络异常','电池老化'])[1+(random()*5)::int],
       (ARRAY['已完成','维修中','待处理'])[1+(random()*2)::int],
       round((random()*3000)::numeric,2), d.cd,
       CASE WHEN random()<0.8 THEN d.cd + (random()*10)::int ELSE NULL END
FROM generate_series(1, 2200) AS i
CROSS JOIN LATERAL (SELECT DATE '2026-07-13' - (random()*600)::int AS cd) AS d;

CREATE TABLE vehicles (
    id INT PRIMARY KEY, plate_no VARCHAR(16) NOT NULL, type VARCHAR(16) NOT NULL,
    department_id INT NOT NULL, status VARCHAR(16) NOT NULL, mileage INT NOT NULL, purchased_at DATE NOT NULL
);
INSERT INTO vehicles
SELECT i, (ARRAY['沪A','京B','粤C','浙D','苏E'])[1+(random()*4)::int] || lpad((random()*99999)::int::text,5,'0'),
       (ARRAY['厢式货车','面包车','轿车','冷藏车'])[1+(random()*3)::int],
       1+(random()*11)::int, (ARRAY['在用','维保中','闲置'])[1+(random()*2)::int],
       (random()*300000)::int, DATE '2026-07-13' - (180 + random()*2000)::int
FROM generate_series(1, 80) AS i;

CREATE TABLE energy_consumption (
    id INT PRIMARY KEY, warehouse_id INT NOT NULL, period_date DATE NOT NULL,
    electricity_kwh NUMERIC(12,2) NOT NULL, water_ton NUMERIC(10,2) NOT NULL, cost NUMERIC(12,2) NOT NULL
);
INSERT INTO energy_consumption
SELECT row_number() OVER (), w, DATE '2026-07-13' - d,
       round((500 + random()*5000)::numeric,2), round((5 + random()*80)::numeric,2),
       round((800 + random()*8000)::numeric,2)
FROM generate_series(1, 8) AS w, generate_series(1, 365) AS d;

COMMIT;
