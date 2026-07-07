-- Seed a "supply chain operations" dataset into the source database.
-- Idempotent: drops and recreates the supply-chain tables each run.
-- Volumes: suppliers 30, warehouses 10, products 200, inventory ~1150,
--          purchase_orders 800, shipments 700.

BEGIN;

DROP TABLE IF EXISTS shipments, purchase_orders, inventory, products, warehouses, suppliers CASCADE;

-- Suppliers
CREATE TABLE suppliers (
  id serial PRIMARY KEY, name text, region text, rating numeric(2,1),
  lead_time_days int, created_at timestamptz DEFAULT now()
);
INSERT INTO suppliers (name, region, rating, lead_time_days)
SELECT '供应商-'||lpad(g::text,3,'0'),
       (ARRAY['华东','华北','华南','西南','海外'])[1+floor(random()*5)],
       round((3 + random()*2)::numeric,1), (3+floor(random()*25))::int
FROM generate_series(1,30) g;

-- Warehouses
CREATE TABLE warehouses (id serial PRIMARY KEY, name text, city text, capacity int);
INSERT INTO warehouses (name, city, capacity)
SELECT '仓库-'||g, (ARRAY['上海','北京','广州','成都','武汉','西安','沈阳','杭州','深圳','重庆'])[g],
       (5000+floor(random()*20000))::int
FROM generate_series(1,10) g;

-- Products (each tied to a supplier)
CREATE TABLE products (
  id serial PRIMARY KEY, sku text, name text, category text,
  unit_cost numeric(10,2), supplier_id int REFERENCES suppliers(id)
);
INSERT INTO products (sku, name, category, unit_cost, supplier_id)
SELECT 'SKU-'||lpad(g::text,5,'0'), '产品-'||g,
       (ARRAY['原材料','零部件','包装材料','成品','耗材'])[1+floor(random()*5)],
       round((10+random()*990)::numeric,2), 1+floor(random()*30)
FROM generate_series(1,200) g;

-- Inventory (a product in a subset of warehouses)
CREATE TABLE inventory (
  id serial PRIMARY KEY, product_id int REFERENCES products(id),
  warehouse_id int REFERENCES warehouses(id), on_hand int, reorder_point int,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO inventory (product_id, warehouse_id, on_hand, reorder_point)
SELECT p, w, floor(random()*2000)::int, (50+floor(random()*200))::int
FROM generate_series(1,200) p, generate_series(1,10) w
WHERE random() < 0.6;

-- Purchase orders (from suppliers)
CREATE TABLE purchase_orders (
  id serial PRIMARY KEY, supplier_id int REFERENCES suppliers(id),
  order_date date, status text, total_amount numeric(12,2)
);
INSERT INTO purchase_orders (supplier_id, order_date, status, total_amount)
SELECT 1+floor(random()*30),
       (date '2026-01-01' + ((floor(random()*180))::int||' days')::interval)::date,
       (ARRAY['待审批','已下单','部分到货','已完成','已取消'])[1+floor(random()*5)],
       round((1000+random()*99000)::numeric,2)
FROM generate_series(1,800);

-- Shipments (against purchase orders, into warehouses)
CREATE TABLE shipments (
  id serial PRIMARY KEY, po_id int REFERENCES purchase_orders(id),
  warehouse_id int REFERENCES warehouses(id), ship_date date, eta date, status text, carrier text
);
INSERT INTO shipments (po_id, warehouse_id, ship_date, eta, status, carrier)
SELECT 1+floor(random()*800), 1+floor(random()*10),
       sd, (sd + ((2+floor(random()*10))::int||' days')::interval)::date,
       (ARRAY['在途','已交付','延误','清关中'])[1+floor(random()*4)],
       (ARRAY['顺丰','德邦','中通','DHL','马士基'])[1+floor(random()*5)]
FROM (SELECT (date '2026-01-01' + ((floor(random()*180))::int||' days')::interval)::date sd
      FROM generate_series(1,700)) s;

COMMIT;
