# 虚机 CPU 指令集问题 — 运维处理单

> 提交日期：2026-06-10　目标虚机：hostname `wtdmx-Standard-PC-i440FX-PIIX-1996`（中石化知识库部署机）

## 一、一句话问题

这台 **KVM 虚拟机的 vCPU 用了 QEMU 默认的 `qemu64` 通用型号，缺少 `x86-64-v2` 指令集**，导致部分现代容器镜像（MySQL 8、新版 MinIO 等）无法启动。**请将该虚机的 CPU 模型改为 host-passthrough（或 x86-64-v2 以上的具名型号）并重启。**

## 二、影响

部署 RAGFlow 时，以下容器**直接崩溃重启（exit 127）**：

| 服务 | 现象 |
|---|---|
| MySQL 8.0.39 | `Fatal glibc error: CPU does not support x86-64-v2`，反复重启 |
| MinIO（新版）| 同上，反复重启 |

> Elasticsearch、Redis、RAGFlow 主程序不受影响（能正常运行），所以问题**仅在 CPU 指令集**，不是配置、不是网络、不是镜像损坏。

## 三、证据

```text
# CPU 型号
$ grep -m1 "model name" /proc/cpuinfo
model name : Common KVM processor

# 缺失的关键指令（x86-64-v2 基线要求）
sse4_2  ✗ 缺
popcnt  ✗ 缺
ssse3   ✗ 缺
sse4_1  ✗ 缺
（现有仅 sse / sse2 / sse3(pni) / cx16）

# 容器报错
Fatal glibc error: CPU does not support x86-64-v2

# 平台标识
systemd-detect-virt        = kvm
/sys/class/dmi/id/sys_vendor   = QEMU
/sys/class/dmi/id/product_name = Standard PC (i440FX + PIIX, 1996)
product_version                = pc-i440fx-6.1   (QEMU machine type)
bios_vendor                    = SeaBIOS
```

## 四、根因

QEMU/KVM 全虚拟机，启动时 vCPU 模型用的是默认 **`qemu64`**。该型号为保证虚机能在异构宿主机之间热迁移，**只暴露最基础的 x86-64-v1 指令**，主动屏蔽了宿主机上较新的指令（SSE4.x / POPCNT / AVX 等）。宿主机物理 CPU 大概率支持，只是**没有透传进虚机**。

## 五、请运维处理（核心诉求）

将该虚机 vCPU 模型从 `qemu64` 改为下列之一，**改完重启虚机**：

- **首选 `host-passthrough`**（`-cpu host`）：直接使用宿主机 CPU 全部指令，一步到位。
- 若需保留跨宿主机热迁移：选一个**集群内所有宿主机都支持的具名型号**，且需 ≥ `Westmere`（含 SSE4.2/POPCNT，满足 x86-64-v2）。如 `Westmere` / `SandyBridge` / `Haswell` 等。

各管理平台对应改法（按你们实际用的来）：

| 平台 | 操作 |
|---|---|
| libvirt / virsh | `virsh edit <域名>`，将 `<cpu>` 段改为 `<cpu mode='host-passthrough' check='none'/>`，保存后 `virsh shutdown` + `virsh start`（**重启生效，reboot 不够**） |
| Proxmox VE | VM → Hardware → Processors → **Type** 改为 `host`（或 ≥ Westmere），关机再开机 |
| OpenStack/Nova | 计算节点 `nova.conf` 设 `cpu_mode=host-passthrough` 或 flavor/镜像属性指定，重建/硬重启实例 |
| 其他云管平台 | 在虚机规格/CPU 透传选项中开启"主机透传 / host CPU passthrough"，重启虚机 |

> ⚠️ `host-passthrough` 会降低跨**异构**宿主机的热迁移能力；若该虚机有迁移需求，请改用集群通用的 ≥ Westmere 具名型号。

## 六、验证（改完后自检）

虚机重启后执行，能看到输出即修复成功：

```bash
grep -o -m1 -E 'sse4_2|popcnt' /proc/cpuinfo
# 期望输出包含 sse4_2 / popcnt（原来这两个是缺的）
```

之后部署侧 `docker compose up -d` 即可让 MySQL / MinIO 正常启动，无需再改任何业务配置。
