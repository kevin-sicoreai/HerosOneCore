-- Seed an "HR / personnel system" dataset (scenario 2) into the `hr` database.
-- Idempotent: drops and recreates the HR tables each run.
-- Target database: hr (the wrapper script connects to it; do NOT switch DB here).
-- Reference date "today" = 2026-07-09; all *event* dates stay before it. The
-- only forward-looking values are contract terms (fixed-term end_date and
-- renewal start_date), which legitimately extend past today.
-- Volumes: departments 45, positions 160, employees 20000,
--          attendance ~700k, payroll ~110k, applications 30000,
--          performance_reviews ~37k, trainings 200, training_records 45000,
--          promotions 6000, transfers 8000, leaves 50000, interviews ~36k,
--          contracts ~22k. (14 tables total.)
-- Note: every single-shot SELECT is kept under the platform's 50000-row fetch cap.

BEGIN;

-- Drop children before parents (dependency order); CASCADE covers the rest.
DROP TABLE IF EXISTS contracts, interviews, leaves, transfers, promotions,
                     training_records, trainings, performance_reviews,
                     applications, payroll, attendance, employees, positions,
                     departments CASCADE;

-- ---------------------------------------------------------------------------
-- departments (45)
-- ---------------------------------------------------------------------------
CREATE TABLE departments (
  id serial PRIMARY KEY,
  name text,
  city text,
  headcount_plan int,
  created_at timestamptz DEFAULT now()
);

-- 22 base names; ids 23..44 reuse them with a "-二组" variant, id 45 a "-三组".
INSERT INTO departments (name, city, headcount_plan)
SELECT
  CASE WHEN g <= 22 THEN names[g]
       WHEN g <= 44 THEN names[g-22] || '-二组'
       ELSE names[1] || '-三组' END,
  (ARRAY['北京','上海','深圳','杭州','成都','武汉','广州','西安'])[1+floor(random()*8)],
  (80 + floor(random()*720))::int
FROM generate_series(1,45) g
CROSS JOIN (SELECT ARRAY[
  '基础平台部','推荐算法部','搜索技术部','广告引擎部','风控与安全部','数据智能部',
  '云原生研发部','前端体验部','客户端研发部','测试工程部','大模型应用部','商业化产品部',
  '用户增长部','国际化业务部','直播技术部','电商中台部','支付结算部','物流调度部',
  '内容审核部','人力资源部','财务部','法务部'
] AS names) n;

-- ---------------------------------------------------------------------------
-- positions (160)
-- ---------------------------------------------------------------------------
CREATE TABLE positions (
  id serial PRIMARY KEY,
  title text,
  level text,
  department_id int REFERENCES departments(id),
  created_at timestamptz DEFAULT now()
);

-- A per-row random `lr` is materialized in the subquery so the weighted level
-- buckets are evaluated against one stable value (P5-P7 are the fat middle).
INSERT INTO positions (title, level, department_id)
SELECT
  (ARRAY['初级','','','高级','资深','专家'])[1+floor(random()*6)]
    || titles[1+floor(random()*20)],
  CASE WHEN lr < 0.10 THEN 'P4'
       WHEN lr < 0.25 THEN 'P5'
       WHEN lr < 0.50 THEN 'P6'
       WHEN lr < 0.70 THEN 'P7'
       WHEN lr < 0.82 THEN 'P8'
       WHEN lr < 0.88 THEN 'P9'
       WHEN lr < 0.94 THEN 'M1'
       WHEN lr < 0.98 THEN 'M2'
       ELSE 'M3' END,
  (1+floor(random()*45))::int
FROM (
  SELECT random() AS lr,
         ARRAY[
           '后端开发工程师','前端开发工程师','客户端开发工程师','算法工程师','数据工程师',
           '大数据工程师','机器学习工程师','测试开发工程师','SRE工程师','运维工程师',
           '安全工程师','产品经理','UI设计师','交互设计师','数据分析师',
           '项目经理','运营专员','HRBP','招聘专员','财务分析师'
         ] AS titles
  FROM generate_series(1,160)
) s;

-- ---------------------------------------------------------------------------
-- employees (20000)
-- ---------------------------------------------------------------------------
CREATE TABLE employees (
  id serial PRIMARY KEY,
  name text,
  gender text,
  age int,
  department_id int REFERENCES departments(id),
  position_id int REFERENCES positions(id),
  status text,
  hire_date date,
  term_date date,
  monthly_salary numeric(10,2),
  city text,
  email text
);

-- All per-row randoms are materialized in `raw`, then derived columns that must
-- agree with each other (hire_date -> term_date, dept -> city) are layered in
-- `comp`. `least(random(),random())` skews age toward the younger end (25~38).
INSERT INTO employees
  (name, gender, age, department_id, position_id, status,
   hire_date, term_date, monthly_salary, city, email)
SELECT
  sn[1+floor(r_sur*array_length(sn,1))]
    || gn[1+floor(r_giv*array_length(gn,1))]
    || CASE WHEN r_num < 0.15 THEN (id % 99)::text ELSE '' END,
  CASE WHEN r_gender < 0.6 THEN '男' ELSE '女' END,
  age,
  dept_id,
  (1+floor(r_pos*160))::int,
  emp_status,
  hire_date,
  CASE WHEN emp_status = '离职'
       THEN LEAST(hire_date + (90 + floor(r_termlen*1735))::int, date '2026-07-08')
       ELSE NULL END,
  salary,
  CASE WHEN r_drift < 0.10
       THEN (ARRAY['北京','上海','深圳','杭州','成都','武汉','广州','西安'])[1+floor(r_dcity*8)]
       ELSE dept_city END,
  'emp' || id || '@bigtech.cn'
FROM (
  SELECT
    raw.*,
    arr.sn, arr.gn,
    (date '2015-01-01'
       + (floor(r_hire * (date '2026-06-30' - date '2015-01-01')))::int) AS hire_date,
    CASE WHEN r_status < 0.85 THEN '在职' ELSE '离职' END AS emp_status,
    (22 + floor(r_age * 34))::int AS age,
    round((12000 + r_salary * 78000)::numeric, 2) AS salary,
    d.city AS dept_city
  FROM (
    SELECT
      g AS id,
      random() AS r_sur, random() AS r_giv, random() AS r_num,
      random() AS r_gender, least(random(), random()) AS r_age,
      random() AS r_pos, random() AS r_status, random() AS r_hire,
      random() AS r_termlen, random() AS r_salary,
      random() AS r_drift, random() AS r_dcity,
      (1 + floor(random() * 45))::int AS dept_id
    FROM generate_series(1,20000) g
  ) raw
  JOIN departments d ON d.id = raw.dept_id
  CROSS JOIN (SELECT
    ARRAY[
      '王','李','张','刘','陈','杨','赵','黄','周','吴','徐','孙','马','朱','胡','郭','何','高',
      '林','罗','郑','梁','谢','宋','唐','许','韩','冯','邓','曹','彭','曾','肖','田','董','袁',
      '潘','于','蒋','蔡','余','杜','叶','程','苏','魏','吕','丁','任','沈','姚','卢','姜','崔',
      '钟','谭','陆','汪','范','金','石','廖','贾','夏','韦','付','方','白','邹','孟','熊','秦',
      '邱','江','尹','薛','闫','段','雷','侯','龙','史','陶','黎','贺','顾','毛','郝','龚','邵',
      '万','钱','严','覃','武','戴','莫','孔','向','汤'
    ] AS sn,
    ARRAY[
      '伟','芳','娜','敏','静','丽','强','磊','军','洋','勇','艳','杰','娟','涛','明','超','秀英',
      '霞','平','刚','桂英','文','辉','建华','晨','欣','佳','子轩','雨桐','浩然','思远','志强',
      '海燕','雪梅','建国','丽娟','晓明','春花','国强','宇航','嘉怡','俊杰','梦琪','雅婷'
    ] AS gn
  ) arr
) comp;

-- ---------------------------------------------------------------------------
-- attendance (~700k) — biggest table
-- ---------------------------------------------------------------------------
CREATE TABLE attendance (
  id bigserial PRIMARY KEY,
  employee_id int REFERENCES employees(id),
  work_date date,
  status text,
  hours numeric(4,1)
);

-- Active employees only, crossed with the weekdays of 2026-05-12..2026-07-08.
-- The status/hours randoms (`rs`, `r_h`) are materialized once per row so the
-- weighted status bucket and the matching hours range stay consistent.
INSERT INTO attendance (employee_id, work_date, status, hours)
SELECT
  employee_id,
  work_date,
  CASE WHEN rs < 0.88 THEN '正常'
       WHEN rs < 0.93 THEN '迟到'
       WHEN rs < 0.95 THEN '早退'
       WHEN rs < 0.96 THEN '缺勤'
       ELSE '请假' END,
  CASE WHEN rs < 0.88 THEN round((8 + r_h * 2)::numeric, 1)   -- 正常 8~10
       WHEN rs < 0.95 THEN round((6 + r_h * 2)::numeric, 1)   -- 迟到/早退 6~8
       WHEN rs < 0.96 THEN 0                                  -- 缺勤 0
       ELSE round((r_h * 4)::numeric, 1) END                 -- 请假 0~4
FROM (
  SELECT
    e.id AS employee_id,
    d::date AS work_date,
    random() AS rs,
    random() AS r_h
  FROM (SELECT id FROM employees WHERE status = '在职') e
  CROSS JOIN generate_series(date '2026-05-12', date '2026-07-08', interval '1 day') d
  WHERE extract(dow FROM d) BETWEEN 1 AND 5
) base;

-- ---------------------------------------------------------------------------
-- payroll (~110k) — 6 months (2026-01..2026-06)
-- ---------------------------------------------------------------------------
CREATE TABLE payroll (
  id bigserial PRIMARY KEY,
  employee_id int REFERENCES employees(id),
  month text,
  base_salary numeric(10,2),
  bonus numeric(10,2),
  total numeric(12,2)
);

-- A month is included for a leaver only if they were still around on its 1st.
-- `bonus` is materialized in the subquery so `total` reuses the same value.
INSERT INTO payroll (employee_id, month, base_salary, bonus, total)
SELECT employee_id, month, base_salary, bonus, base_salary + bonus
FROM (
  SELECT
    e.id AS employee_id,
    m.month,
    e.monthly_salary AS base_salary,
    round((e.monthly_salary * random() * 0.4)::numeric, 2) AS bonus
  FROM employees e
  CROSS JOIN (VALUES
    ('2026-01', date '2026-01-01'),
    ('2026-02', date '2026-02-01'),
    ('2026-03', date '2026-03-01'),
    ('2026-04', date '2026-04-01'),
    ('2026-05', date '2026-05-01'),
    ('2026-06', date '2026-06-01')
  ) m(month, first_day)
  WHERE e.term_date IS NULL OR e.term_date >= m.first_day
) p;

-- ---------------------------------------------------------------------------
-- applications (30000)
-- ---------------------------------------------------------------------------
CREATE TABLE applications (
  id serial PRIMARY KEY,
  position_id int REFERENCES positions(id),
  candidate_name text,
  stage text,
  applied_at date,
  source text
);

-- Recruiting funnel; `rstage` and `rsrc` are materialized for stable buckets.
INSERT INTO applications (position_id, candidate_name, stage, applied_at, source)
SELECT
  (1+floor(random()*160))::int,
  sn[1+floor(random()*array_length(sn,1))] || gn[1+floor(random()*array_length(gn,1))],
  CASE WHEN rstage < 0.40 THEN '投递'
       WHEN rstage < 0.65 THEN '初筛'
       WHEN rstage < 0.83 THEN '面试'
       WHEN rstage < 0.90 THEN 'Offer'
       WHEN rstage < 0.95 THEN '入职'
       ELSE '淘汰' END,
  (date '2025-07-01'
     + (floor(random() * (date '2026-07-08' - date '2025-07-01')))::int) AS applied_at,
  CASE WHEN rsrc < 0.30 THEN '内推'
       WHEN rsrc < 0.70 THEN '招聘网站'
       WHEN rsrc < 0.85 THEN '猎头'
       ELSE '校招' END
FROM (
  SELECT
    random() AS rstage,
    random() AS rsrc,
    ARRAY[
      '王','李','张','刘','陈','杨','赵','黄','周','吴','徐','孙','马','朱','胡','郭','何','高',
      '林','罗','郑','梁','谢','宋','唐','许','韩','冯','邓','曹','彭','曾','肖','田','董','袁',
      '潘','于','蒋','蔡','余','杜','叶','程','苏','魏','吕','丁','任','沈','姚','卢','姜','崔',
      '钟','谭','陆','汪','范','金','石','廖','贾','夏','韦','付','方','白','邹','孟','熊','秦',
      '邱','江','尹','薛','闫','段','雷','侯','龙','史','陶','黎','贺','顾','毛','郝','龚','邵',
      '万','钱','严','覃','武','戴','莫','孔','向','汤'
    ] AS sn,
    ARRAY[
      '伟','芳','娜','敏','静','丽','强','磊','军','洋','勇','艳','杰','娟','涛','明','超','秀英',
      '霞','平','刚','桂英','文','辉','建华','晨','欣','佳','子轩','雨桐','浩然','思远','志强',
      '海燕','雪梅','建国','丽娟','晓明','春花','国强','宇航','嘉怡','俊杰','梦琪','雅婷'
    ] AS gn
  FROM generate_series(1,30000)
) s;

-- ---------------------------------------------------------------------------
-- performance_reviews (~37k) — two cycles per still-relevant employee
-- ---------------------------------------------------------------------------
CREATE TABLE performance_reviews (
  id serial PRIMARY KEY,
  employee_id int,
  cycle text,
  score numeric(4,1),
  rating text,
  department_name text,
  reviewer_id int,
  created_at date
);

-- Both cycles cover every employee except leavers who were already gone before
-- 2025-07-01. `score` is materialized in the subquery so the rating buckets and
-- the stored value agree. Worst case 20000*2 = 40000 rows, safely under the cap.
-- department_name is a snapshot join for direct per-department analysis.
INSERT INTO performance_reviews
  (employee_id, cycle, score, rating, department_name, reviewer_id, created_at)
SELECT
  employee_id,
  cycle,
  score,
  CASE WHEN score >= 95 THEN 'S'
       WHEN score >= 85 THEN 'A'
       WHEN score >= 70 THEN 'B'
       WHEN score >= 62 THEN 'C'
       ELSE 'D' END,
  department_name,
  (1 + floor(random() * 20000))::int,
  CASE WHEN cycle = '2025-H2' THEN date '2026-01-15' ELSE date '2026-07-08' END
FROM (
  SELECT
    e.id AS employee_id,
    c.cycle,
    -- Sum of three uniforms gives a bell-ish score in [60,100].
    round(((random() + random() + random()) / 3 * 40 + 60)::numeric, 1) AS score,
    d.name AS department_name
  FROM employees e
  JOIN departments d ON d.id = e.department_id
  CROSS JOIN (VALUES ('2025-H2'), ('2026-H1')) c(cycle)
  WHERE e.term_date IS NULL OR e.term_date >= date '2025-07-01'
) pr;

-- ---------------------------------------------------------------------------
-- trainings (200)
-- ---------------------------------------------------------------------------
CREATE TABLE trainings (
  id serial PRIMARY KEY,
  title text,
  category text,
  hours numeric(4,1),
  created_at date
);

-- A base course name plus a "第N期" suffix keeps all 200 rows distinct.
INSERT INTO trainings (title, category, hours, created_at)
SELECT
  titles[1 + floor(random() * array_length(titles, 1))] || ' 第' || g || '期',
  cats[1 + floor(random() * array_length(cats, 1))],
  round((2 + random() * 38)::numeric, 1),
  (date '2024-01-01'
     + (floor(random() * (date '2026-07-08' - date '2024-01-01')))::int)
FROM generate_series(1, 200) g
CROSS JOIN (SELECT
  ARRAY[
    'Kubernetes 实战','大模型应用开发','管理者沟通','数据安全合规','OKR 工作法',
    '云原生架构','分布式系统设计','前端工程化','推荐系统进阶','数据分析实战',
    'Go 高性能编程','团队领导力','职业化素养','信息安全意识','敏捷项目管理'
  ] AS titles,
  ARRAY['技术','管理','合规','通用素质'] AS cats
) n;

-- ---------------------------------------------------------------------------
-- training_records (45000)
-- ---------------------------------------------------------------------------
CREATE TABLE training_records (
  id serial PRIMARY KEY,
  employee_id int,
  training_id int,
  completed_at date,
  hours numeric(4,1),
  result text
);

-- Random employee x random course; hours are taken from the joined course.
-- `rr` is materialized so the pass/fail bucket is evaluated once per row.
-- Exactly 45000 rows (every generated training_id 1..200 always joins).
INSERT INTO training_records (employee_id, training_id, completed_at, hours, result)
SELECT
  (1 + floor(random() * 20000))::int,
  s.tid,
  (date '2025-07-01'
     + (floor(random() * (date '2026-07-08' - date '2025-07-01')))::int),
  t.hours,
  CASE WHEN s.rr < 0.92 THEN '通过' ELSE '未通过' END
FROM (
  SELECT
    (1 + floor(random() * 200))::int AS tid,
    random() AS rr
  FROM generate_series(1, 45000)
) s
JOIN trainings t ON t.id = s.tid;

-- ---------------------------------------------------------------------------
-- promotions (6000)
-- ---------------------------------------------------------------------------
CREATE TABLE promotions (
  id serial PRIMARY KEY,
  employee_id int,
  promote_date date,
  from_level text,
  to_level text
);

-- One adjacent level pair per row. `pick` (materialized) selects the same pair
-- for both from_level and to_level so the two columns always stay consistent.
INSERT INTO promotions (employee_id, promote_date, from_level, to_level)
SELECT
  (1 + floor(random() * 20000))::int,
  (date '2023-01-01'
     + (floor(random() * (date '2026-06-30' - date '2023-01-01')))::int),
  CASE pick WHEN 1 THEN 'P4' WHEN 2 THEN 'P5' WHEN 3 THEN 'P6' WHEN 4 THEN 'P7'
            WHEN 5 THEN 'P8' WHEN 6 THEN 'M1' ELSE 'M2' END,
  CASE pick WHEN 1 THEN 'P5' WHEN 2 THEN 'P6' WHEN 3 THEN 'P7' WHEN 4 THEN 'P8'
            WHEN 5 THEN 'P9' WHEN 6 THEN 'M2' ELSE 'M3' END
FROM (
  SELECT (1 + floor(random() * 7))::int AS pick
  FROM generate_series(1, 6000)
) s;

-- ---------------------------------------------------------------------------
-- transfers (8000)
-- ---------------------------------------------------------------------------
CREATE TABLE transfers (
  id serial PRIMARY KEY,
  employee_id int,
  transfer_date date,
  from_department_id int,
  to_department_id int,
  reason text
);

-- to_department_id is derived from from_dep plus a non-zero offset modulo 45,
-- which guarantees from != to. `roff`/`rr` are materialized for stability.
INSERT INTO transfers
  (employee_id, transfer_date, from_department_id, to_department_id, reason)
SELECT
  (1 + floor(random() * 20000))::int,
  (date '2023-01-01'
     + (floor(random() * (date '2026-06-30' - date '2023-01-01')))::int),
  from_dep,
  1 + ((from_dep - 1 + roff) % 45),
  CASE WHEN rr < 0.50 THEN '业务调整'
       WHEN rr < 0.80 THEN '个人申请'
       ELSE '组织优化' END
FROM (
  SELECT
    (1 + floor(random() * 45))::int AS from_dep,
    (1 + floor(random() * 44))::int AS roff,   -- 1..44, never a multiple of 45
    random() AS rr
  FROM generate_series(1, 8000)
) s;

-- ---------------------------------------------------------------------------
-- leaves (50000)
-- ---------------------------------------------------------------------------
CREATE TABLE leaves (
  id serial PRIMARY KEY,
  employee_id int,
  leave_type text,
  start_date date,
  end_date date,
  days numeric(4,1)
);

-- `rt` drives both the leave type and the matching days range, so they stay in
-- sync; `end_date` reuses the materialized `days`. Maternity leave is the long
-- tail (90~158 days); everything else is 0.5~15 days.
INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days)
SELECT
  (1 + floor(random() * 20000))::int,
  leave_type,
  start_date,
  start_date + round(days)::int,
  days
FROM (
  SELECT
    CASE WHEN rt < 0.40 THEN '年假'
         WHEN rt < 0.65 THEN '调休'
         WHEN rt < 0.80 THEN '病假'
         WHEN rt < 0.90 THEN '事假'
         WHEN rt < 0.95 THEN '婚假'
         ELSE '产假' END AS leave_type,
    (date '2025-07-01'
       + (floor(random() * (date '2026-07-01' - date '2025-07-01')))::int) AS start_date,
    CASE WHEN rt < 0.95 THEN round((0.5 + rd * 14.5)::numeric, 1)
         ELSE round((90 + rd * 68)::numeric, 1) END AS days
  FROM (
    SELECT random() AS rt, random() AS rd
    FROM generate_series(1, 50000)
  ) r
) s;

-- ---------------------------------------------------------------------------
-- interviews (~36k) — 1..3 rounds per non-"投递" application
-- ---------------------------------------------------------------------------
CREATE TABLE interviews (
  id serial PRIMARY KEY,
  application_id int,
  round int,
  interviewer_id int,
  result text,
  interview_date date
);

-- A per-application round count (1..3) is expanded by cross joining a 1..3
-- series and filtering; `rr`/`rd` are materialized once per resulting row.
INSERT INTO interviews
  (application_id, round, interviewer_id, result, interview_date)
SELECT
  application_id,
  round,
  (1 + floor(random() * 20000))::int,
  CASE WHEN rr < 0.55 THEN '通过'
       WHEN rr < 0.90 THEN '淘汰'
       ELSE '待定' END,
  applied_at + (3 + floor(rd * 28))::int   -- applied_at + 3..30 days
FROM (
  SELECT
    a.id AS application_id,
    gs.round,
    a.applied_at,
    random() AS rr,
    random() AS rd
  FROM (
    SELECT id, applied_at, (1 + floor(random() * 3))::int AS n_rounds
    FROM applications
    WHERE stage <> '投递'
  ) a
  CROSS JOIN generate_series(1, 3) AS gs(round)
  WHERE gs.round <= a.n_rounds
) s;

-- ---------------------------------------------------------------------------
-- contracts (~22k) — one per employee + ~10% renewals
-- ---------------------------------------------------------------------------
CREATE TABLE contracts (
  id serial PRIMARY KEY,
  employee_id int,
  contract_type text,
  start_date date,
  end_date date,
  sign_date date
);

-- Base contract: one per employee, starting on the hire date. `rt` (materialized)
-- picks the type; end_date depends on the type (fixed-term 3y, intern 6m, open-
-- ended NULL). sign_date equals start_date.
INSERT INTO contracts
  (employee_id, contract_type, start_date, end_date, sign_date)
SELECT
  employee_id,
  contract_type,
  start_date,
  CASE WHEN contract_type = '固定期限' THEN (start_date + interval '3 years')::date
       WHEN contract_type = '实习'     THEN (start_date + interval '6 months')::date
       ELSE NULL END,
  start_date
FROM (
  SELECT
    e.id AS employee_id,
    e.hire_date AS start_date,
    CASE WHEN rt < 0.70 THEN '固定期限'
         WHEN rt < 0.95 THEN '无固定期限'
         ELSE '实习' END AS contract_type
  FROM (SELECT id, hire_date, random() AS rt FROM employees) e
) s;

-- Renewal contract for ~10% of employees, starting 3 years after the hire date.
INSERT INTO contracts
  (employee_id, contract_type, start_date, end_date, sign_date)
SELECT
  employee_id,
  contract_type,
  start_date,
  CASE WHEN contract_type = '固定期限' THEN (start_date + interval '3 years')::date
       WHEN contract_type = '实习'     THEN (start_date + interval '6 months')::date
       ELSE NULL END,
  start_date
FROM (
  SELECT
    e.id AS employee_id,
    (e.hire_date + interval '3 years')::date AS start_date,
    CASE WHEN rt < 0.70 THEN '固定期限'
         WHEN rt < 0.95 THEN '无固定期限'
         ELSE '实习' END AS contract_type
  FROM (SELECT id, hire_date, random() AS rt, random() AS rpick FROM employees) e
  WHERE rpick < 0.10
) s;

-- ---------------------------------------------------------------------------
-- Indexes on the common foreign-key columns.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_positions_department  ON positions (department_id);
CREATE INDEX IF NOT EXISTS idx_employees_department   ON employees (department_id);
CREATE INDEX IF NOT EXISTS idx_employees_position     ON employees (position_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee    ON attendance (employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_employee       ON payroll (employee_id);
CREATE INDEX IF NOT EXISTS idx_applications_position  ON applications (position_id);
CREATE INDEX IF NOT EXISTS idx_perfreviews_employee   ON performance_reviews (employee_id);
CREATE INDEX IF NOT EXISTS idx_trainrecords_employee  ON training_records (employee_id);
CREATE INDEX IF NOT EXISTS idx_trainrecords_training  ON training_records (training_id);
CREATE INDEX IF NOT EXISTS idx_promotions_employee    ON promotions (employee_id);
CREATE INDEX IF NOT EXISTS idx_transfers_employee     ON transfers (employee_id);
CREATE INDEX IF NOT EXISTS idx_leaves_employee        ON leaves (employee_id);
CREATE INDEX IF NOT EXISTS idx_interviews_application  ON interviews (application_id);
CREATE INDEX IF NOT EXISTS idx_contracts_employee     ON contracts (employee_id);

COMMIT;

-- Row-count sanity check.
SELECT 'departments' AS table_name, count(*) AS rows FROM departments
UNION ALL SELECT 'positions',    count(*) FROM positions
UNION ALL SELECT 'employees',    count(*) FROM employees
UNION ALL SELECT 'attendance',   count(*) FROM attendance
UNION ALL SELECT 'payroll',      count(*) FROM payroll
UNION ALL SELECT 'applications', count(*) FROM applications
UNION ALL SELECT 'performance_reviews', count(*) FROM performance_reviews
UNION ALL SELECT 'trainings',    count(*) FROM trainings
UNION ALL SELECT 'training_records',    count(*) FROM training_records
UNION ALL SELECT 'promotions',   count(*) FROM promotions
UNION ALL SELECT 'transfers',    count(*) FROM transfers
UNION ALL SELECT 'leaves',       count(*) FROM leaves
UNION ALL SELECT 'interviews',   count(*) FROM interviews
UNION ALL SELECT 'contracts',    count(*) FROM contracts;
