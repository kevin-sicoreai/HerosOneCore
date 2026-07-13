# HR 场景运行手册

> 面向拉取 `hr` 分支后从零启动平台的开发者(或直接交给 Claude Code 执行)。
> 按顺序执行即可;所有脚本幂等,重复执行安全。

## 平台现状(hr 分支)

平台演示域为**人事系统(HR)**:14 张源表约 108 万行(员工 2 万/考勤 71.7 万等),
六大能力全链路贯通——接入 → 管道 → 治理(列级敏感数据权限)→ 本体 → 分析(cube 指标)→ AIP。
供应链场景已下线(种子脚本保留在 `scripts/seed/seed_base.sql` 等,默认不使用)。

## 前置条件

- Docker(源库 Postgres 容器)
- Python 3.12+(各服务;pipeline 的 venv 必须 3.12,dbt 不支持 3.14)
- Node.js(前端)
- 网络约定:**服务间地址一律用 `127.0.0.1`,不要用 `localhost`**
  (Windows 上 localhost 先解析 IPv6,每个请求多 ~2 秒)

## 启动顺序

### 1. 源库容器 + 灌数据

```bash
bash scripts/infra/start_source_db.sh     # 启动 askdelphi-src 容器(Postgres, shop/shop)
bash scripts/seed/seed_hr.sh              # 建 hr 库并灌 14 张表(约 1-2 分钟)
```

结束时会打印各表行数校验(employees 20000 / attendance ~71 万等)。

### 2. 启动后端服务(7 个,顺序不严格,auth/data 先起最好)

按 `scripts/services/start_*.sh` 启动 auth(8005)/data(8000)/pipeline(8001)/
ontology(8003)/governance(8004)。脚本已内置必需环境变量,其中两个是硬要求:

| 服务 | 关键环境变量 | 不设的后果 |
|---|---|---|
| ontology | `PREVIEW_MAX_LIMIT=50000` | 员工 2 万行被截到 1000,分析与指标结果错误 |
| pipeline | `PYTHONUTF8=1` | dbt 工程文件按 ANSI 编码写出,中文 SQL 解析失败(exit 2) |

analysis(8008)与 assist(8006)没有独立启动脚本,手动启动:

```bash
cd services/analysis    && python -m uvicorn app.main:app --host 127.0.0.1 --port 8008
cd services/assist      && python -m uvicorn app.main:app --host 127.0.0.1 --port 8006
cd services/app-builder && python -m uvicorn app.main:app --host 127.0.0.1 --port 8002
```

assist 需要 LLM Key:复制 `services/assist/.env.example` 为 `.env`,
填入 DeepSeek(或任意 OpenAI 兼容)的 `LLM_API_KEY`。

### 3. 一键引导平台元数据(核心步骤)

连接器/同步/管道/本体对象/治理分级都存在各服务的 SQLite(不入 git),
拉取代码后为空,由引导脚本重建:

```bash
python scripts/seed/bootstrap_hr.py
```

它幂等地完成:健康检查 → 建 `hr source db` 连接器 → 同步 14 表 →
建"人力数据加工"管道并运行(产出 dept_hr_summary 部门人力概览、
recruiting_funnel 招聘漏斗两个 mart)→ 建 6 个本体对象类型 + 6 条链接 →
注册敏感列分级(PII-薪酬、敏感-绩效)→ 回填数据集中文显示名。

### 4. 前端

```bash
cd apps/web && npm install && npm run dev    # http://localhost:3000
```

登录账号:`admin/admin`(平台管理员,可见薪酬明文)、
`analyst/analyst`(数据分析师,薪酬/绩效列显示 ***)。

### 5. 指标引擎(Cube,可选)

analysis 的 `/metrics/query` 默认走 Cube(自研引擎作兜底)。先由本体生成
Cube schema,再拉起容器:

```bash
cd services/analysis && python -m app.tools.generate_cube_schema   # 生成 cube/model/
bash cube/up.sh                                                    # 起 askdelphi-cube(:4000)
```

生成器每对象类型产一个 `cube/model/cubes/<api_name>.yml`(敏感列不出维度)+
`metric_map.json`(指标→Cube 成员映射)。重跑覆盖输出目录,幂等。

指标定义现为声明式,存于 analysis 的 SQLite(`metric_defs` 表,启动时从旧硬编码
清单幂等种子出 7 个 HR 指标)。在前端「指标语义」页查看;管理员可新建/编辑/删除
(写操作限管理员,校验对象/列/链接后落库并发审计)。每次写入自动重新生成
`cube/model`(生成失败不回滚,响应带 warning,查询回落自研引擎),故通常无需手动跑生成器。

引擎切换:analysis 默认 `METRICS_ENGINE=cube`;想强制自研引擎设
`METRICS_ENGINE=native`。Cube 不可用(未起/连不上/成员缺失)时,查询自动
回落自研引擎,结果 `meta.engine` 标 `cube` / `native` / `native-fallback`。

## 验收清单(跑完应全部成立)

1. **数据页**:16 个数据集(14 raw + 2 mart),中文显示名 + 英文标识副标
2. **本体管理器**:员工/部门/职位/绩效考核/招聘投递/培训记录 6 类型 + 6 链接
3. **对象浏览器**:选"员工"看实例(admin 薪酬明文,analyst 为 ***),
   点实例可下钻关系(所属部门/绩效考核/培训记录)
4. **分析工作台**:秒开;表格分页/排序;图表镜头选"采购…"已无——
   HR 指标 7 个(在编 17,000/离职率 15%/人均月薪 ¥51,224 等)
5. **治理后台**:血缘图中文标签(hr source db → 员工/绩效考核… → mart);
   审计里有"读取敏感数据(已掩码/明文)"事件
6. **AIP 助手**:问"哪个部门离职率最高"(走指标,基础平台部-三组 18%)、
   "员工 1024 是谁"(对象溯源 + 敏感字段合规话术)、"生成本月人力月报"

## 已知问题与约定

- **管道目录锁(Windows)**:若管道重跑报 `WinError 32`(目录被占用),
  是历史 dbt 进程残留句柄;新建一个管道(新 id 新目录)或重启机器。
- 分析服务对行集有 **30 秒缓存**,数据面变化最多延迟 30 秒可见。
- 服务间读接口开放、写接口需 token;analysis 自铸服务令牌读全量算聚合,
  终端用户的掩码在本体/数据服务出口完成。analysis 的 `/analyze` **明细模式**
  也按治理分级对敏感列(如月薪)就地掩码并发审计;**聚合模式不掩码**
  (聚合值为派生数,平台策略允许)。
- 各服务 SQLite 文件名以各自 `app/core/config.py` 默认值为准;
  data 服务如本地已有历史库,注意 `DATABASE_URL` 与实际文件一致。
