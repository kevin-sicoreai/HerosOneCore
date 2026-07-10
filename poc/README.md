# P0 开源选型 PoC(Cube + Superset)

> 目标:验证「⑤分析」从自研切换到开源栈的可行性——指标语义层用 **Cube**,
> BI/看板用 **Apache Superset**,两者直接坐在平台数据面(Parquet/DuckDB)上。
> AIP 保留 deepagents(开源 SDK)自研薄壳,不迁移。
> 结论:**两条链路均验证通过,数字与自研指标层完全一致**(2026-07-10)。

> **⚠️ 方向更新(2026-07-10 headless 定案)**:平台采用「统一原生体验 +
> 开源引擎 headless 化」原则(见 `D:\workspace\palantir\palantir-capability-
> coverage-and-headless-plan.md`)——第三方 UI 不嵌入、不跳转。据此
> **Superset 出局**(其价值主要在 UI),本文的 Superset 部分仅作 PoC 记录;
> **Cube 保留**为唯一指标引擎,由 analysis 服务(BFF)转调,前端保持原生
> 页面。掩码/权限在 analysis 服务执行,浏览器不直连任何引擎。

## 一、Cube(指标语义层)

```bash
docker run -d --name poc-cube -p 4000:4000 \
  -e CUBEJS_DEV_MODE=true -e CUBEJS_DB_TYPE=duckdb -e CUBEJS_API_SECRET=poc-secret \
  -v "<仓库>/poc/cube/model:/cube/conf/model" \
  -v "<仓库>/services/data/_dataplane/raw/<hr连接器id>:/data/raw:ro" \
  -v "<仓库>/services/pipeline/_dataplane/mart/<管道id>:/data/mart:ro" \
  cubejs/cube:latest
```

- 指标以 **schema 文件**声明(`poc/cube/model/cubes/*.yml`):employees/departments 两个
  cube,join 对应本体链接「所属部门」,度量 在编人数(count+过滤)与 离职率(表达式)
- Playground:http://localhost:4000;REST:`/cubejs-api/v1/load?query={...}`

**验证结果**(vs 自研 `/metrics/query`):

| 指标 | Cube | 自研 | 一致 |
|---|---|---|---|
| 在编人数按部门 top5 | 支付结算部 412 / 物流调度部 411 / … | 同 | ✅(并列 404 的两部门排序不同,值全同) |
| 离职率整体 | 14.6% | 14.6% | ✅ |

## 二、Superset(BI/看板)

```bash
docker run -d --name poc-superset -p 8088:8088 \
  -e SUPERSET_SECRET_KEY=<换成随机串> \
  -v <同上两个数据面挂载> apache/superset:latest
# 初始化(一次性)
docker exec poc-superset superset db upgrade
docker exec poc-superset superset fab create-admin --username admin --password admin \
  --firstname A --lastname D --email admin@poc.local
docker exec poc-superset superset init
# DuckDB 驱动:镜像 venv 由 uv 管理且属主为 root,必须 -u root + uv 安装
docker exec -u root poc-superset sh -c \
  "uv pip install --python /app/.venv/bin/python3 duckdb duckdb-engine"
docker restart poc-superset
```

- 登录 http://localhost:8088(admin/admin)→ 数据库连接 `duckdb:///:memory:`
- 数据集用虚拟 SQL(`read_parquet('/data/raw/employees.parquet')` 等),即可拖拽做图

**验证结果**:SQL Lab 执行 员工×部门 join 的离职率查询,top5 与自研一致
(人力资源部-二组 19.1% …,第 5 名并列 16.3% 排序不同);mart
(dept_hr_summary)直接可读。

## 三、结论与已知事项

1. **可行**:Cube/Superset 均可零改造消费现有 Parquet 数据面,指标口径可完整迁移
2. **并列值排序**:不同引擎对并列值的次序不保证一致,对数时按(名称,值)集合比较
3. **Superset 装驱动的坑**:见上——普通 `pip install` 装不进它的 venv
4. **治理边界(P1 前必须解决)**:两者直连数据面,**绕过了本体层的薪酬掩码**;
   生产方案:DuckDB 层脱敏视图 或 Cube 列级安全 + Superset RLS,需与治理侧对齐
5. Windows 下 Superset 仅支持 Docker 运行(官方不支持原生 Windows);
   主机自研服务照旧使用 conda my_env,与容器环境互不影响

## 四、下一步(P1/P2)

- P1:7 个 HR 指标全量翻写为 Cube schema,分析工作台图表/看板改调 Cube REST
- P2:Superset 复刻看板 + 平台壳嵌入(guest token),下线自研分析页
