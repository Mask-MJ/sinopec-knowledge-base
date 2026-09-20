# RAGFlow 部署（v0.27.1）

给 210 这类连不上 GitHub 的内网机用：配置文件随本仓库一起拉过去，不用再去 clone RAGFlow 源码。

## 文件来源

`docker-compose.yml`、`docker-compose-base.yml`、`service_conf.yaml.template`、`entrypoint.sh`、`init.sql` 都是 RAGFlow **v0.27.1 tag 下 `docker/` 目录的原文**，没有改动。升级 RAGFlow 时从对应 tag 重新导出这几个文件即可。

`env.example` 是上游 `docker/.env`，改了三处：

| 项 | 上游 | 这里 | 为什么 |
| --- | --- | --- | --- |
| `SVR_WEB_HTTP_PORT` | 80 | 8081 | 80 留给业务系统的 nginx |
| `SVR_WEB_HTTPS_PORT` | 443 | 8443 | 同上 |
| 四个 `*_PASSWORD` | `infini_rag_flow` | `CHANGE_ME` | 默认密码不进仓库，首次部署时由脚本随机生成 |

## 用法

```bash
bash deploy/ragflow/bootstrap.sh
```

可重复执行，每步都是先查后建。干完这些事：

1. 把配置铺到 `/var/www/ragflow/docker`，首次生成 `.env`（各服务密码随机，权限 600）
2. `docker compose up -d` 起容器，等 `/api/v1/system/healthz` 返回 200（最多 10 分钟，ES 首次启动慢）
3. 注册管理员账号（密码要先用 RAGFlow 的公钥加密，脚本调容器里的函数做）
4. 配 Xinference 的 `chat` 和 `embedding` 两个模型并设为默认
5. 生成给业务系统用的 API key 并打印出来

跑之前要先有镜像。这台机器拉不到 dockerhub 的话，镜像源见下面。

## 可调项（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `RAGFLOW_DIR` | `/var/www/ragflow/docker` | 部署目录 |
| `ADMIN_EMAIL` | `admin@sinopec.com` | 管理员账号 |
| `ADMIN_PASSWORD` | 随机生成 | 不传就随机生成一个 24 位密码，存进部署目录的 `.admin-credentials`（权限 600）。要指定就 `ADMIN_PASSWORD=xxx bash deploy/ragflow/bootstrap.sh` |
| `MODEL_BASE_URL` | `http://10.55.247.252:19997` | Xinference 地址，RAGFlow 内部会自动补 `/v1` |
| `INSTANCE_NAME` | `xinference-252` | provider 实例名 |
| `CHAT_MAX_TOKENS` | `131072` | chat 模型上下文上限，**必须和底层模型真实上限一致** |
| `EMBED_MAX_TOKENS` | `8192` | embedding 模型上限 |

## 要改端口的话（有坑）

上游 `.env` 里的端口变量语义**不一致**，改错会让 RAGFlow 起不来：

| 变量 | 是什么 | 能不能改 |
| --- | --- | --- |
| `EXPOSE_MYSQL_PORT` | MySQL 的宿主端口 | 要避让就改这个 |
| `MYSQL_PORT` | **容器内**端口，`service_conf.yaml.template` 用它连库 | **别动**，动了 RAGFlow 会连 `mysql:<你改的端口>` 然后 Connection refused |
| `ES_PORT` / `MINIO_PORT` / `MINIO_CONSOLE_PORT` / `REDIS_PORT` | 宿主端口（容器内端口在 `service_conf` 里写死 9200/9000/6379） | 可以改 |
| `SVR_HTTP_PORT` / `SVR_WEB_HTTP_PORT` | RAGFlow 自己的 API / 控制台端口 | 可以改 |

## 模型为什么叫 chat 和 embedding

内网规范：RAGFlow 里登记成 `chat@Xinference` 和 `embedding@Xinference`，不写 `bge-m3`、`qwen3.6-27b` 这类具体型号。这样底层换模型时 RAGFlow 这边不用改，已经建好的知识库和对话也不受影响。

有一个坑要记住：**换底层模型时 `CHAT_MAX_TOKENS` 必须跟着改**。RAGFlow 用这个值算往 prompt 里塞多少 chunk，配大了会超模型真实上限，报错还会被吞成看不出原因的 `GENERIC_ERROR`。

## 拉镜像

内网机直连 dockerhub 通常拉不动，按顺序试国内源，拉到后改回官方名，compose 里就不用改：

```bash
pull() {
  want=$1; shift
  docker image inspect "$want" >/dev/null 2>&1 && { echo "已存在：$want"; return 0; }
  for src in "$@"; do
    docker pull "$src" && docker tag "$src" "$want" && return 0
  done
  echo "失败：$want"; return 1
}
pull infiniflow/ragflow:v0.27.1 \
  swr.cn-north-4.myhuaweicloud.com/infiniflow/ragflow:v0.27.1 \
  registry.cn-hangzhou.aliyuncs.com/infiniflow/ragflow:v0.27.1 \
  infiniflow/ragflow:v0.27.1
pull mysql:8.0.40 docker.1ms.run/library/mysql:8.0.40 mysql:8.0.40
pull pgsty/silo:RELEASE.2026-08-06T00-00-00Z \
  docker.1ms.run/pgsty/silo:RELEASE.2026-08-06T00-00-00Z \
  pgsty/silo:RELEASE.2026-08-06T00-00-00Z
pull elasticsearch:8.11.3 docker.1ms.run/library/elasticsearch:8.11.3 elasticsearch:8.11.3
pull valkey/valkey:8 docker.1ms.run/valkey/valkey:8 valkey/valkey:8
```

RAGFlow 镜像解压后 11.4GB，加上其余的，磁盘至少留 15GB。

## 部署完之后

1. 把脚本打印的 API key 填进业务系统的 `.env`：`RAGFLOW_API_KEY` 和 `RAGFLOW_HOST`
2. 账号建好后建议关掉注册：`.env` 里 `REGISTER_ENABLED=0`，再 `docker compose up -d ragflow-cpu`
3. 业务系统用 [scripts/deploy.sh](../../scripts/deploy.sh) 部署，它会先检查 RAGFlow 版本够不够新
