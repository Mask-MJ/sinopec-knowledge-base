# RAGFlow npm 供应链投毒事件专项排查与处置报告

| 项目 | 内容 |
| --- | --- |
| 事件名称 | Mini Shai-Hulud npm 自传播蠕虫（AntV 生态投毒波次） |
| 漏洞/事件编号 | CVE-2026-45321 |
| 涉及资产 | 知识库系统 RAG 引擎 RAGFlow v0.24.0（容器化部署） |
| 事件类型 | 开源软件供应链投毒（依赖包被植入凭据窃取型恶意代码） |
| 报告日期 | 2026 年 X 月 X 日 |
| 排查结论 | **本单位所部署 RAGFlow v0.24.0 未引入受投毒版本，未发现失陷证据** |
| 报告人 | XXX |

> **填写说明**：本报告中带 `XX` 的字段为现场信息，需按实际处置过程补齐；标注"（待现场核实）"的条目为需登录生产主机执行的取证动作，本报告已给出可直接执行的命令。所有版本号、时间戳、IOC 均来自实际核验，来源见文末附录三。

---

## 一、事件背景与应急处置

### 1.1 事件背景

2026 年 5 月，威胁组织 TeamPCP 针对 npm 生态发起 Mini Shai-Hulud 供应链攻击（Shai-Hulud 系列第四代，具备自传播蠕虫能力），分两个波次：

- **第一波（2026-05-11）**：攻击 TanStack 生态，通过劫持 GitHub Actions OIDC 令牌，经项目自有发布流水线推送恶意版本。该批恶意包**携带合法的 SLSA Build Level 3 供应链来源证明**，为业界首次记录到"具备有效签名认证的恶意 npm 包"，常规签名校验手段对其失效。
- **第二波（2026-05-19）**：攻击蚂蚁 AntV 数据可视化生态。攻击者控制 `@antv` 命名空间维护者账号 `atool`，在 **01:56:42 至 02:06:01 共约 22 分钟**内以自动化方式批量发包，Socket 统计影响 **323 个包、639 个恶意版本**。

**恶意载荷行为**：约 499 KB 的混淆 JavaScript，在 `npm install` 的 `postinstall` 生命周期钩子中静默执行，功能为：

1. 窃取 GitHub Actions Secrets、npm 发布令牌、云厂商访问凭据（AWS / Azure / GCP）；
2. 建立 C2 持久化通道；
3. 使用窃得的 npm 令牌自动向更多包投毒，实现蠕虫式扩散。

**与"挖矿"的关系**：该蠕虫本体不含挖矿模块。业界通报中的挖矿属于二阶后果——攻击者利用窃得的云凭据在受害者云账户内批量开设算力实例进行加密货币挖矿，同时可导致对象存储数据窃取、勒索软件投放或生产环境删除。

### 1.2 与本单位资产的关联性

本单位知识库系统采用 RAGFlow 作为 RAG 引擎。经核查，RAGFlow 前端工程 `web/package.json` 直接依赖 `@antv/g2`、`@antv/g6` 两个可视化组件库，经依赖树展开后共引入 **18 个 `@antv` 命名空间包**，其中 **17 个在 2026-05-19 攻击窗口内存在被投毒版本**，具备理论受影响条件，故立项开展专项排查。

### 1.3 应急处置动作

> 本次为主动专项排查，非由安全设备告警驱动。若贵单位由态势感知/流量设备触发，请按下表补齐。

| 时间 | 处置动作 | 执行/通知对象 | 证据 |
| --- | --- | --- | --- |
| X 日 X 点 X 分 | 接收 XX 平台告警 / 上级通报，研判涉及 RAGFlow 组件 | XXX | （附截图） |
| X 日 X 点 X 分 | 通知 XXX，封禁互联网攻击 IP `XXX.XXX.XXX.XXX`，并确认封禁成功 | XXX | （附截图） |
| X 日 X 点 X 分 | 在互联网出口临时阻断 npm 官方源与镜像源出向连接，冻结所有前端构建流水线 | 运维组 XXX | （附截图） |
| X 日 X 点 X 分 | 启动本报告所述专项排查 | 安全组 XXX | 见第二、三章 |

---

## 二、初步分析及初步处置

### 2.1 影响面判定

以"RAGFlow 依赖 `@antv` 系列包"为线索扩大排查范围，确定需核验的资产与代码位置：

| 序号 | 排查对象 | 位置 | 判定结果 |
| --- | --- | --- | --- |
| 1 | RAGFlow 前端依赖锁定文件 | `web/package-lock.json`（v0.24.0） | 未命中恶意版本 ✅ |
| 2 | RAGFlow 官方镜像构建方式 | `Dockerfile:170-172` | 按锁定文件构建，见 2.3 ✅ |
| 3 | 知识库业务系统前端 | `apps/client`（Vue 3 + pnpm） | 未安装 `@antv` 任何包 ✅ |
| 4 | 生产运行容器实例 | RAGFlow 生产/测试节点 | 待现场核实 ⚠ |
| 5 | 前端构建机 / CI 节点 | XXX | 待现场核实 ⚠ |

### 2.2 版本核验结论（核心证据）

对 RAGFlow v0.24.0 依赖树中全部 18 个 `@antv` 包，逐个向 npm 官方 registry 查询版本发布时间线，与本地锁定版本比对：

- **恶意版本发布规律**：攻击者对每个包统一发布两个"跳跃 minor 版本号"的恶意版本，时间戳精确落在 `2026-05-19T01:56:4X` 与 `2026-05-19T02:06:0X` 两个批次，与公开通报的 22 分钟自动化发包窗口完全吻合。
- **比对结果**：RAGFlow v0.24.0 锁定的 18 个包版本，**无一命中恶意版本清单**（完整对照表见附录一）。
- **时间线佐证**：
  - `web/package-lock.json` 最后一次变更：**2026-01-07 14:32:17**（commit `a442c9ca`）
  - v0.24.0 版本发布（tag）：**2026-02-10 17:24:03**（commit `392ec996`）
  - 攻击发生时间：**2026-05-19**

  锁定文件冻结时间**早于攻击 4 个月以上**，从时间维度上不存在引入恶意版本的可能。

- **上游追加验证**：另核查 RAGFlow 官方 `main` 分支最新锁定文件（最后更新 2026-07-27，即攻击后 2 个多月），21 个 `@antv` 包同样无一命中恶意版本，证明**上游项目自身的依赖锁定文件全程未被污染**。

### 2.3 构建方式风险评估

RAGFlow 官方 `Dockerfile` 第 170-172 行前端构建逻辑：

```dockerfile
RUN --mount=type=cache,id=ragflow_npm,target=/root/.npm,sharing=locked \
    export NODE_OPTIONS="--max-old-space-size=4096" && \
    cd web && npm install && npm run build
```

风险评估要点：

| 要素 | 现状 | 风险评价 |
| --- | --- | --- |
| 安装命令 | `npm install`（非 `npm ci`） | **中**。`npm install` 在锁定版本满足 `package.json` 范围时仍沿用锁定版本，本次未导致越界升级；但其不具备 `npm ci` 的严格性，锁定文件缺失或与声明冲突时会重新解析，属于潜在弱点，建议整改 |
| 版本声明范围 | `"@antv/g2": "^5.2.10"`、`"@antv/g6": "^5.0.10"` | **中**。`^` 范围可覆盖恶意版本 5.5.8/5.6.8、5.2.1/5.3.1，一旦绕过锁定文件即会中招 |
| 包源配置 | `web/.npmrc` 指向 `registry.npmmirror.com`（国内镜像） | **中性**。镜像同步延迟客观上缩小了攻击窗口，但官方下架后镜像端清理同样存在延迟，不应作为防护依赖 |
| 构建产物形态 | 多阶段构建，运行镜像通过 `COPY --from=builder /ragflow/web/dist` 引入编译产物 | **低**。运行时容器内不存在 `postinstall` 执行路径 |
| **构建上下文过滤** | **仓库根目录不存在 `.dockerignore` 文件**，而 production 阶段第 194 行 `COPY web web` 从构建上下文复制整个 `web/` 目录 | **高（仅自建镜像场景）**。详见 2.3.1 |

#### 2.3.1 自建镜像场景的恶意文件驻留风险（重点）

RAGFlow 仓库**未提供 `.dockerignore`**，而 `Dockerfile` production 阶段存在两条相关指令：

```dockerfile
COPY web web                                              # 第 194 行：从构建上下文复制整个 web/ 目录
COPY --from=builder /ragflow/web/dist /ragflow/web/dist    # 第 211 行：仅覆盖 dist 子目录
```

由此产生两种截然不同的结果：

| 部署方式 | 构建上下文中是否存在 `web/node_modules` | 结果 |
| --- | --- | --- |
| **拉取官方镜像** | 否。官方 CI 在干净 checkout 上构建，`node_modules` 已被 `.gitignore` 排除，构建上下文中不存在 | 镜像内无 `node_modules`，**无恶意文件驻留** ✅ |
| **本地源码自建镜像** | **是**（若构建前在 `web/` 下执行过 `npm install` / `npm run dev`） | 第 194 行将本地 `node_modules` **整体打入生产镜像**，第 211 行仅覆盖 `dist`、不覆盖 `node_modules` ⚠ |

**风险性质说明**：即使在自建场景下，恶意载荷**也不会被执行**——运行时容器不执行 `npm install`，`postinstall` 钩子无触发点。但恶意文件会以静态形式**驻留于生产镜像内**，后果为：

1. 主机 EDR / 防病毒 / 镜像安全扫描将持续告警，判定为"生产镜像内含恶意文件"；
2. 在等保测评、护网行动、供应链安全审计场景下构成实质性不合规；
3. 镜像分发至其他环境时，恶意文件随之扩散。

**本单位判定**：需在 3.4 项现场核实部署方式为"拉取官方镜像"还是"本地自建"。若为自建，须追加执行 3.5 项中针对容器内 `node_modules` 的排查命令。

### 2.4 传播路径判定

恶意载荷执行于 `npm install` 的 `postinstall` 阶段，**感染对象为执行安装的构建主机/CI 节点，而非运行容器**。需区分"代码执行"与"文件驻留"两种性质不同的风险：

**风险 A —— 恶意代码执行（凭据窃取，危害最重）**

- 采用**拉取官方镜像**方式部署的节点：容器内不执行 `npm install`，**不存在执行路径**；
- 采用**源码自行 `docker build`** 的节点：构建过程执行 `npm install`，恶意代码在**构建主机**上激活，窃取该主机及 CI 环境的全部凭据；
- 触发需**同时满足**：① 在本地从源码构建前端；② 锁定文件缺失、损坏，或执行过 `npm update` / 删除锁定文件后重装；③ 时间落在 2026-05-19 攻击发生至 npm 完成下架之间。

**风险 B —— 恶意文件驻留（合规风险，仅自建镜像场景）**

- 因仓库缺少 `.dockerignore`，本地 `web/node_modules` 会经第 194 行 `COPY web web` 打入生产镜像；
- 恶意文件不执行，但静态驻留，触发安全扫描告警并构成审计不合规；
- 触发条件较风险 A **更宽松**：只要构建前本地装过受投毒版本依赖即可，无需构建过程本身重新解析版本。

### 2.5 初步处置

| 时间 | 处置动作 | 证据 |
| --- | --- | --- |
| X 日 X 点 X 分 | 冻结全部前端构建流水线，禁止执行 `npm update` 及删除锁定文件的重装操作 | （附截图） |
| X 日 X 点 X 分 | 对 RAGFlow 生产节点 `10.X.X.X` 采取 XX 封禁策略，并开通溯源策略 | （附截图） |
| X 日 X 点 X 分 | 排查结果报告至组长 XXX | （附截图） |

---

## 三、上机溯源分析及取证过程

> 以下第 1-3 项为可离线完成、**已实际执行完毕**的取证；第 4-7 项需登录生产主机执行，命令已给出，执行后请补充截图与实际输出。

**X 日 X 点 X 分**，联系 XX 单位 XXX（联系电话：XXXXXXX），提供远程登录条件。 **X 日 X 点 X 分**，登录机器 `10.X.X.X` 开展以下工作：

### 3.1 依赖锁定文件取证（已完成）

对 v0.24.0 源码树逐包核验，结果见附录一。**结论：18 个 `@antv` 包锁定版本全部为攻击前的正常版本，无一命中。**

### 3.2 上游项目污染排查（已完成）

拉取 RAGFlow `main` 分支最新锁定文件比对恶意版本清单，21 个 `@antv` 包均未命中。**结论：上游发布链未被污染，官方镜像可信。**

### 3.3 业务系统自身依赖排查（已完成）

知识库业务系统前端 `apps/client` 采用 pnpm 管理依赖，核查 `pnpm-lock.yaml`：

- 仅在 `markstream-vue` 包的 `peerDependenciesMeta` 中出现 `@antv/infographic`，且标记为 **optional（可选）**；
- 实际安装目录 `node_modules/.pnpm/` 下**不存在任何 `@antv` 包**。

**结论：业务系统自身不受影响。**

### 3.4 运行容器镜像完整性核验（待现场核实）

```bash
# 核对运行中容器所用镜像与官方发布镜像的 digest 是否一致
docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}"
docker images --digests | grep -i ragflow
docker inspect <容器名> --format '{{.Image}} {{.Created}}'

# 核实容器内前端产物构建时间（应早于 2026-05-19）
docker exec <容器名> sh -c 'ls -la --time-style=full-iso /ragflow/web/dist | head'
docker exec <容器名> cat /ragflow/VERSION

# 【关键】确认运行镜像内是否含 node_modules —— 判定拉官方镜像 or 本地自建的决定性证据
docker exec <容器名> sh -c 'ls -d /ragflow/web/node_modules 2>&1'
```

判定标准：

| 现象 | 判定 | 后续动作 |
| --- | --- | --- |
| 镜像 digest 与 Docker Hub `infiniflow/ragflow:v0.24.0` 官方 digest 一致 | 官方镜像，未被替换 ✅ | 无需追加排查 |
| `/ragflow/web/node_modules` **不存在** | 官方构建路径，无恶意文件驻留 ✅ | 无需追加排查 |
| `/ragflow/web/node_modules` **存在** | **本地自建镜像**，构建上下文污染 ⚠ | **必须**执行 3.5 项容器内排查 |
| `/ragflow/web/dist` 文件时间早于 2026-05-19 | 构建于攻击窗口之前 ✅ | — |

**核实结果**：XXX（附截图）

### 3.5 恶意载荷落地文件排查（待现场核实）

Shai-Hulud 系列已知落地文件与持久化特征：

```bash
# 主机侧：npm 缓存与全局目录
find /root/.npm /home/*/.npm ~/.bun -name "bun_environment.js" -o -name "setup_bun.js" 2>/dev/null
ls -la ~/.bun 2>/dev/null

# 恶意载荷特征：约 499KB 的混淆 JS
find / -name "*.js" -size +450k -size -560k -newermt "2026-05-01" 2>/dev/null | grep -iE "node_modules|\.npm|\.cache" | head -20

# 构建缓存卷（Dockerfile 使用了 --mount=type=cache 挂载 /root/.npm）
docker builder du
docker buildx prune --filter until=0h --dry-run

# 【自建镜像场景必查】容器内驻留的 node_modules 版本核验
# 若 3.4 项发现容器内存在 node_modules，逐个比对 @antv 包实际版本是否命中附录一恶意版本
docker exec <容器名> sh -c 'for d in /ragflow/web/node_modules/@antv/*/; do \
  printf "%s\t" "$(basename $d)"; \
  grep -o "\"version\": *\"[^\"]*\"" "$d/package.json" | head -1; done'

# 容器内恶意载荷落地文件搜索
docker exec <容器名> sh -c 'find /ragflow/web/node_modules -name "bun_environment.js" -o -name "setup_bun.js" 2>/dev/null'
docker exec <容器名> sh -c 'find /ragflow/web/node_modules -name "*.js" -size +450k -size -560k 2>/dev/null | head -20'

# 构建上下文源目录同步排查（构建机本地的 web/node_modules 即污染来源）
ls -d <RAGFlow源码路径>/web/node_modules/@antv/*/ 2>/dev/null
```

**核实结果**：XXX（附截图）

### 3.6 主机异常行为排查（待现场核实）

针对"挖矿"这一二阶后果的核查项：

```bash
# CPU 占用异常进程（挖矿典型特征：单进程持续 >90% CPU）
top -bn1 | head -20
ps -eo pid,ppid,etime,pcpu,pmem,args --sort=-pcpu | head -20

# 容器内进程（对比正常 RAGFlow 进程清单，异常进程名如 xmrig/kdevtmpfsi/kinsing 等）
docker top <容器名>

# 外联行为：矿池常用端口与非常规出向连接
ss -tunp | grep -vE ':(80|443|9380|3306|9200|6379|9000|22)\b'
ss -tunp | grep -E ':(3333|4444|5555|7777|14444|45700)\b'

# 持久化：计划任务与自启动项
crontab -l; ls -la /etc/cron.*/ /var/spool/cron/crontabs/ 2>/dev/null
systemctl list-timers --all | head -20
find /etc/systemd/system /lib/systemd/system -newermt "2026-05-01" -name "*.service" 2>/dev/null

# 登录日志完整性（确认无删除痕迹）
last -F | head -30; lastb -F | head -20
ls -la /var/log/wtmp /var/log/btmp /var/log/auth.log*
```

**核实结果**：XXX（附截图）

### 3.7 凭据泄露影响面核查（待现场核实）

该蠕虫核心目的为凭据窃取，**即使未在本机执行安装，只要构建机曾经中招，凭据即已外泄**，须核查：

| 凭据类型 | 核查动作 | 结果 |
| --- | --- | --- |
| npm 发布令牌 | 检查 `~/.npmrc` 中 `_authToken` 是否存在，是否已轮换 | XXX |
| CI/CD Secrets | 检查代码托管平台 Actions Secrets 访问与修改审计日志 | XXX |
| 云平台 AK/SK | 检查云账号近 90 天异常 API 调用、异常地域实例开设记录 | XXX |
| Git 凭据 | 检查 `~/.git-credentials`、SSH 私钥是否驻留于构建机 | XXX |
| 公开仓库外泄 | 检索代码托管平台是否出现名为 `Shai-Hulud` 的异常公开仓库（该蠕虫会将窃得凭据以公开仓库形式外泄） | XXX |

### 3.8 已开展的处置工作

| 序号 | 处置动作 | 状态 |
| --- | --- | --- |
| 1 | 提取容器镜像 digest，与官方发布值比对，纳入内网 IOC 库 | XXX |
| 2 | 在互联网出口阻断已公开的 C2 域名与 IP（清单见附录二） | XXX |
| 3 | 对全部前端构建机执行恶意文件查杀，结果：发现 X 个，已 XXX（附截图） | XXX |
| 4 | X 日 X 点 X 分，通知项目组 XXX 轮换 npm 令牌、CI Secrets、云平台 AK/SK 及服务器口令 | XXX |
| 5 | X 点 X 分，收到反馈，该机器处置完毕 | XXX |

---

## 四、排查结论

**结论：本单位部署的 RAGFlow v0.24.0 未受 Mini Shai-Hulud 供应链投毒影响。**

三项独立证据支撑：

1. **版本证据**：v0.24.0 锁定的 18 个 `@antv` 包版本，与 2026-05-19 攻击窗口内发布的 34 个恶意版本无任何交集（附录一）；
2. **时间证据**：锁定文件冻结于 2026-01-07、版本发布于 2026-02-10，早于攻击 4 个月以上；上游 `main` 分支攻击后（2026-07-27）的锁定文件同样未被污染；
3. **架构证据**：恶意载荷仅在 `npm install` 阶段执行，运行时容器不执行安装动作，不存在载荷执行路径。

**遗留风险项**：

1. 第三章 3.4-3.7 各项需登录生产主机完成现场取证后方可完全闭环。
2. **部署方式尚未现场确认**。若存在本地源码自建镜像的节点，因 RAGFlow 仓库缺少 `.dockerignore`（详见 2.3.1），本地 `web/node_modules` 会被打入生产镜像，可能造成**恶意文件静态驻留**——该风险独立于"版本未命中"结论之外，须按 3.4 项判定标准逐节点核实。

**上游信息缺口（需关注）**：RAGFlow 官方 issue [#14945](https://github.com/infiniflow/ragflow/issues/14945) 中，维护者于 2026-05-15 回复"项目未直接使用受感染的 `@tanstack/router` 包family"——该回复**仅覆盖 05-11 的 TanStack 波次，未涵盖 05-19 的 AntV 波次**，而 RAGFlow 恰恰依赖 `@antv` 系列。该 issue 至今保持 open 状态且无后续更新，官方**从未就 AntV 波次作出正式说明**。本次结论系我方独立核验得出，不依赖官方表态。

---

## 五、加固建议

| 优先级 | 措施 | 说明 |
| --- | --- | --- |
| 高 | 构建流程禁用 `npm update`、禁止删除锁定文件后重装 | 这是本次架构下唯一可能中招的操作路径 |
| 高 | 生产环境统一使用官方镜像 digest 固定引用（`image: infiniflow/ragflow@sha256:...`），停止使用可变 tag | 防止镜像被替换 |
| 高 | 前端构建机剥离长期有效凭据，改用短时效 OIDC 令牌 | 本次攻击的核心目标即为长期凭据 |
| 高 | **自建镜像前必须清空 `web/node_modules`**，或在仓库根目录补充 `.dockerignore` 排除该目录 | 仓库当前无 `.dockerignore`，`COPY web web` 会将本地依赖目录整体打入生产镜像（详见 2.3.1） |
| 中 | 向上游提交 PR：① `Dockerfile` 中 `npm install` 改为 `npm ci`；② 补充 `.dockerignore` | 前者强制严格按锁定文件安装、消除越界解析风险；后者消除构建上下文污染 |
| 中 | 前端依赖安装统一加 `--ignore-scripts`，或启用 npm `minimumReleaseAge` 策略（延迟 N 天后才允许安装新版本） | 直接封堵 `postinstall` 执行路径 / 规避 22 分钟级速攻窗口 |
| 中 | 引入 SCA 工具对锁定文件做 CI 门禁扫描 | 需注意：本次攻击部分恶意包携带**有效 SLSA L3 签名**，签名校验不可单独作为防线 |
| 低 | 建立开源组件版本冻结与人工审核的升级流程 | 避免自动升级引入未审核版本 |

---

## 附录一：版本核验对照表

数据来源：npm 官方 registry 各包 `time` 字段（查询日期 2026-08-05）。

| `@antv` 包名 | RAGFlow v0.24.0 锁定版本 | 2026-05-19 恶意版本 | npm 当前 latest | 判定 |
| --- | --- | --- | --- | --- |
| @antv/algorithm | 0.1.26 | 0.2.26 / 0.3.26 | 0.1.26 | 未命中 ✅ |
| @antv/component | 2.1.11 | 2.2.11 / 2.3.11 | 2.1.11 | 未命中 ✅ |
| @antv/coord | 0.4.7 | 0.5.7 / 0.6.7 | 0.4.7 | 未命中 ✅ |
| @antv/event-emitter | 0.1.3 | 0.2.3 / 0.3.3 | 0.1.3 | 未命中 ✅ |
| @antv/expr | 1.0.2 | 1.1.2 / 1.2.2 | 1.0.2 | 未命中 ✅ |
| @antv/g | 6.3.1 | 6.4.1 / 6.5.1 | 6.3.1 | 未命中 ✅ |
| @antv/g-canvas | 2.2.0 | 2.3.0 / 2.4.0 | 2.2.0 | 未命中 ✅ |
| @antv/g-lite | 2.7.0 | 2.8.0 / 2.9.0 | 2.7.0 | 未命中 ✅ |
| @antv/g-math | 3.1.0 | 3.2.0 / 3.3.0 | 3.1.0 | 未命中 ✅ |
| @antv/g-plugin-dragndrop | 2.1.1 | 2.2.1 / 2.3.1 | 2.1.1 | 未命中 ✅ |
| @antv/g2 | 5.4.7 | 5.5.8 / 5.6.8 | 5.4.8 | 未命中 ✅ |
| @antv/g6 | 5.0.51 | 5.2.1 / 5.3.1 | 5.1.1 | 未命中 ✅ |
| @antv/graphlib | 2.0.4 | 2.1.4 / 2.2.4 | 2.0.4 | 未命中 ✅ |
| @antv/hierarchy | 0.7.1 | 0.8.1 / 0.9.1 | 0.7.1 | 未命中 ✅ |
| @antv/layout | 1.2.14-beta.9 | 无投毒版本 | 2.0.0 | 未命中 ✅ |
| @antv/scale | 0.4.16 / 0.5.2 | 0.6.2 / 0.7.2 | 0.5.2 | 未命中 ✅ |
| @antv/util | 2.0.17 / 3.3.11 | 3.4.11 / 3.5.11 | 3.3.11 | 未命中 ✅ |
| @antv/vendor | 1.0.11 | 1.1.11 / 1.2.11 | 1.0.11 | 未命中 ✅ |

**版本识别规律**（可用于快速自查）：攻击者对每个包机械地发布 "minor+1" 与 "minor+2" 两个版本，且 npm 官方已将全部包的 `latest` 标签回滚至攻击前版本——**若发现所装版本高于该包当前 `latest`，即为恶意版本**，此为最快的判别法。

npm 官方已完成下架，恶意版本仅残留于 registry 元数据中，当前按 `^` 范围重新安装不会再拉取到恶意版本。

## 附录二：IOC 清单（需补充）

| 类型 | 值 | 来源 |
| --- | --- | --- |
| 恶意包版本 | 见附录一（RAGFlow 相关部分，共 34 个版本） | npm registry 实测 |
| 恶意包总量 | 323 个包 / 639 个版本（全量清单见 Socket 通报） | Socket 通报 |
| 落地文件名 | `bun_environment.js`、`setup_bun.js` | 公开通报 |
| 载荷特征 | 约 499 KB 混淆 JavaScript，`postinstall` 阶段执行 | 微软安全通报 |
| C2 域名/IP | 待从最新威胁情报补充 | XXX |
| 外泄仓库特征 | 代码托管平台出现名为 `Shai-Hulud` 的异常公开仓库 | 公开通报 |

## 附录三：信息来源

| 来源 | 链接 |
| --- | --- |
| 微软安全响应中心 —— @antv 包投毒导致 CI/CD 凭据窃取 | https://www.microsoft.com/en-us/security/blog/2026/05/20/mini-shai-hulud-compromised-antv-npm-packages-enable-ci-cd-credential-theft/ |
| Socket —— 639 个 @antv 恶意版本分析 | https://socket.dev/blog/antv-packages-compromised |
| Tenable —— Mini Shai-Hulud (CVE-2026-45321) FAQ | https://www.tenable.com/blog/mini-shai-hulud-frequently-asked-questions |
| StepSecurity —— AntV 生态大规模投毒事件 | https://www.stepsecurity.io/blog/shai-hulud-here-we-go-again-mass-npm-supply-chain-attack-hits-the-antv-ecosystem |
| RAGFlow 官方 issue #14945（至今 open，仅回应 TanStack 波次） | https://github.com/infiniflow/ragflow/issues/14945 |
| 版本时间线核验 | npm 官方 registry API（`https://registry.npmjs.org/<包名>`） |
