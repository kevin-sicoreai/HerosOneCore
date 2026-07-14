# 部署到 10.1.0.4（Docker Compose）

一套自包含镜像：8 个后端服务 + Next.js 前端 + nginx 网关。中间件（Postgres
`:5433`、MinIO `:9000`、OpenMetadata `:8585`、vLLM Qwen `:8000`）复用 10.1.0.4
上已有的容器，本栈不碰它们。镜像在 dev box 构建后搬到 10.1.0.4 运行。

## 拓扑

```
浏览器 → nginx(:${GATEWAY_PORT}) ┬─ /api/<svc>/* → 各后端服务(内网, 不对外发布)
                                 └─ /*           → web(next start, 内网)
后端 → 10.1.0.4 主机IP: Postgres:5433 / MinIO:9000 / OM:8585 / vLLM:8000
```

只有 nginx 发布端口；后端全部走 compose 内网服务名互通（`data` 的 8000 是容器内部端口，与主机上 vLLM 的 8000 不冲突）。

## 一次性准备

```bash
# dev box：拿到代码后
cp deploy/.env.example deploy/.env            # 填 META_DB_BASE_URL / DB_PREFIX / GATEWAY_PORT
```

在 **10.1.0.4** 上：
```bash
mkdir -p /workspace/herosonecore/config /workspace/herosonecore/pipeline
cp deploy/hoc.env.example /workspace/herosonecore/config/hoc.env
# 编辑 hoc.env，填入 JWT_SECRET / LLM_API_KEY / OM_TOKEN（其余可用 dev 默认值）
```

## 构建 → 搬运 → 运行

```bash
# 1) dev box 构建全部镜像（前端构建需外网拉字体/依赖）
docker compose -f deploy/docker-compose.yml build

# 2) 打包并搬到 10.1.0.4（沿用现有 save|ssh load 套路）
docker save \
  herosonecore-auth:latest herosonecore-data:latest herosonecore-pipeline:latest \
  herosonecore-ontology:latest herosonecore-governance:latest herosonecore-analysis:latest \
  herosonecore-assist:latest herosonecore-app-builder:latest \
  herosonecore-web:latest herosonecore-nginx:latest \
  | ssh user@10.1.0.4 'docker load'

# 3) 把 compose 文件与 deploy/.env 拷到 10.1.0.4（无需整份仓库）
scp deploy/docker-compose.yml deploy/.env user@10.1.0.4:/workspace/herosonecore/

# 4) 10.1.0.4 上启动（--no-build：直接用已 load 的镜像，不在共享机上构建）
cd /workspace/herosonecore
docker compose -f docker-compose.yml --env-file .env up -d --no-build
```

启动即自动建表（各服务 lifespan 里 `create_all`，幂等）；auth 幂等种子 admin/admin。

## 验证

```bash
docker compose -f docker-compose.yml ps          # 10 个容器都 healthy
curl -s http://localhost:${GATEWAY_PORT}/api/auth/health      # {"status":"ok"} 之类
curl -s http://localhost:${GATEWAY_PORT}/api/assist/meta      # 两个可选模型
# 浏览器打开 http://10.1.0.4:${GATEWAY_PORT} → admin / admin 登录
```

## 数据初始化（仅全新库才需要）

当前 `hoc_dev_*` 元数据库与源库 `herosonecore_ops_dev` **已种过数据，请勿重跑
`seed_ops.sh`**（它 `DROP CASCADE` 重建 60 表，是破坏性的）。只有面对一套全新空库时才需要：

```bash
# 在能连到 10.1.0.4 的机器上，依次：
APP_ENV=dev ./scripts/seed/seed_ops.sh                    # 灌源库业务数据
source scripts/env.sh dev && python scripts/seed/bootstrap_ops.py   # 串起 connector→…→治理
# 可选：OpenMetadata 目录同步（OM_TOKEN 约 1h 过期，先刷新）
curl -X POST http://localhost:${GATEWAY_PORT}/api/governance/catalog/sync
```

## 更新一个服务

```bash
# dev box：重建改动的服务镜像并搬运
docker compose -f deploy/docker-compose.yml build assist
docker save herosonecore-assist:latest | ssh user@10.1.0.4 'docker load'
# 10.1.0.4：重启该服务
docker compose -f docker-compose.yml up -d --no-build assist
```

## 备注 / 坑

- **前端 vs 后端在同一网络**：客户端用相对 `/api/*`，nginx 接管代理，因此
  `apps/web/next.config.ts` 的 rewrites 在此拓扑下不生效也不需要改。
- **密钥**：`hoc.env` 与 `deploy/.env` 都含明文凭据，放在 `/workspace/herosonecore`
  下即可，勿提交、建议轮换（尤其 DeepSeek key / JWT / OM token）。
- **analysis / app-builder 依赖**：已在各自 `pyproject.toml` 补上 `psycopg[binary]`
  （analysis 另加 `httpx`），否则镜像连 Postgres 会崩。
- **前端构建需外网**：`next build` 会拉 Google Fonts；务必在能出网的 dev box 构建。
- **k8s**：暂不做；此 compose 将来可平滑迁移到 k8s。
