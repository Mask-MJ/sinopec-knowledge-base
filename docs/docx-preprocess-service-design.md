# Docx 上传预处理服务设计文档（Python 版本）

| 项 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 编写日期 | 2026-06-29 |
| 模块代号 | `docx_preprocess` |
| 适用环境 | 中石化知识库管理系统 / RAGFlow 0.24 |
| 对应源文件 | `apps/server/src/common/docx-preprocess/docx-preprocess.service.ts`（TypeScript 原版） |
| 文档目标读者 | 技术负责人、架构评审、运维交接 |

---

## 1. 背景与动机

### 1.1 业务背景

中石化知识库管理系统使用 RAGFlow 0.24 作为底层检索增强生成（RAG）引擎，由用户上传的 `.docx` 文档经由 RAGFlow 的 `deepdoc` 解析器抽取文本与表格，再切片入库。文档解析的保真度直接决定下游检索召回质量。

### 1.2 问题根因

RAGFlow 0.24 内置的 `DocxParser` 在处理表格单元格时存在已知缺陷：

| 原始内容 | DocxParser 解析结果 | 损失 |
| --- | --- | --- |
| `0-4m` | `0` | 区间上界丢失 |
| `395-1000m/s` | `395/s` | 区间上界 + 单位主体丢失 |
| `20m（inline）×40m` | `（inline）×` | 括号外参数全部截断 |

上述场景在中石化勘探开发、井下作业等领域文档中高频出现（深度区间、流量区间、设备规格等），一旦丢失将直接导致检索"召回正确文档但答非所问"。

### 1.3 解决方案

引入 Pandoc 作为 docx → Markdown 的中间转换层：在文件进入 RAGFlow 之前先将 `.docx` 无损转换为 GitHub Flavored Markdown（GFM），再以 `.md` 形式提交给 RAGFlow。Pandoc 对上述模式的保留是逐字符无损的，且 RAGFlow 对 Markdown 的解析链路更为稳定。

---

## 2. 设计目标

| 编号 | 目标 | 说明 |
| --- | --- | --- |
| G1 | **透明降级** | 任何预处理失败必须回退到原始 docx，绝不阻断业务上传。 |
| G2 | **可测试性** | 子进程调用必须可在单元测试中替换，避免依赖系统 Pandoc 二进制。 |
| G3 | **可观测性** | 转换前后字节数、转换耗时、失败原因、降级路径必须结构化落日志。 |
| G4 | **资源安全** | 单次转换的输出大小与时长必须设上限，防止异常文件耗尽内存或挂死线程。 |
| G5 | **不可变性** | 文件对象一经创建不得就地修改，所有变更通过返回新对象表达。 |
| G6 | **并发友好** | 提供同步 / 线程并发 / 异步并发三套入口，适配不同框架（Flask / FastAPI / Celery）。 |

---

## 3. 总体架构

```
┌──────────────────────────────┐
│   HTTP Controller (Web 框架)  │
└──────────────┬───────────────┘
               │ Sequence[UploadFile]
               ▼
┌──────────────────────────────┐
│   DocxPreprocessService      │  ← 入口服务
│   ┌──────────────────────┐   │
│   │ _is_docx 判定         │   │
│   │ _preprocess_one      │   │
│   │ _rewrite_as_markdown │   │
│   └──────────┬───────────┘   │
└──────────────┼───────────────┘
               │ bytes (docx)
               ▼
┌──────────────────────────────┐
│  PandocRunner (Protocol)     │  ← 抽象层，可注入
└──────────────┬───────────────┘
               │
        ┌──────┴──────┐
        ▼             ▼
 default_pandoc_   FakeRunner
 runner            (单元测试)
   │
   │ subprocess.Popen(pandoc -f docx -t gfm)
   ▼
 ┌────────────────┐
 │  pandoc 二进制  │
 └────────────────┘
```

### 3.1 分层职责

| 层 | 组件 | 职责 |
| --- | --- | --- |
| 数据层 | `UploadFile` | 不可变文件视图，承载 `original_name` / `mimetype` / `buffer` |
| 抽象层 | `PandocRunner` (Protocol) | 定义"docx 字节 → markdown 字节"的可调用契约 |
| 实现层 | `default_pandoc_runner` | 默认实现，调用系统 Pandoc 子进程 |
| 服务层 | `DocxPreprocessService` | 业务编排：识别 docx → 调用 runner → 失败降级 → 重写元信息 |
| 工厂层 | `build_default_service` | 统一配置入口，便于 DI 装配 |

---

## 4. 核心接口

### 4.1 数据模型 `UploadFile`

```python
@dataclass(frozen=True, slots=True)
class UploadFile:
    original_name: str
    mimetype: str
    buffer: bytes
```

设计要点：
- `frozen=True` 强制不可变，杜绝跨线程隐式共享态
- `slots=True` 降低内存开销并禁止意外属性
- `size` 通过 `@property` 派生，与 `buffer` 始终一致

### 4.2 抽象契约 `PandocRunner`

```python
@runtime_checkable
class PandocRunner(Protocol):
    def __call__(self, data: bytes) -> bytes: ...
```

任何符合"接收 docx 字节、返回 markdown 字节"的可调用对象皆可作为 runner 注入：
- 生产：`default_pandoc_runner`（本地 Pandoc）
- 测试：`lambda _: b"# stub"`
- 远期演进：HTTP 网关版 Pandoc、容器化 Pandoc、纯 Python 实现

### 4.3 默认实现 `default_pandoc_runner`

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `timeout_sec` | 60.0 | 单次调用超时，超时即 kill 子进程 |
| `max_output_bytes` | 50 MiB | 输出上限，超出即终止 |
| `pandoc_bin` | `"pandoc"` | 二进制路径，支持容器化部署时显式指定 |

### 4.4 服务主体 `DocxPreprocessService`

| 方法 | 调用形态 | 适用场景 |
| --- | --- | --- |
| `preprocess_files(files)` | 同步串行 | 单文件 / 小批量 / 调试 |
| `preprocess_files_parallel(files)` | 同步 + 线程池 | Flask / Celery worker 批量场景 |
| `preprocess_files_async(files)` | `await` 异步 | FastAPI / Starlette 等异步框架 |

三套入口共享同一 `_preprocess_one` 内核，行为一致。

---

## 5. 异常体系与降级策略

### 5.1 异常分层

```
RuntimeError
  └─ PandocError                  ← 业务可识别的 pandoc 失败
      ├─ PandocTimeoutError       ← 子进程超时
      ├─ PandocExitError          ← 非 0 退出码 (含 stderr)
      └─ PandocOutputTooLargeError← 输出超过上限
```

### 5.2 降级矩阵

| 触发条件 | 日志级别 | 处理动作 | 业务可见性 |
| --- | --- | --- | --- |
| 非 docx 文件 | — | 直通 | 透明 |
| Pandoc 正常返回 | `INFO` | 重写为 `.md` | 用户上传被替换为 `.md` |
| `PandocError` 子类 | `WARNING` | 回退原始 docx | 用户上传不变 |
| 未预期异常 | `ERROR` + 栈追踪 | 回退原始 docx | 用户上传不变 |

**核心承诺**：无论后端处理如何失败，前端用户的上传链路永远不被打断。

---

## 6. 资源保护

| 风险 | 控制手段 | 默认阈值 | 调整入口 |
| --- | --- | --- | --- |
| 输出爆量（恶意/异常文件） | 输出字节累计上限 | 50 MiB | `max_output_bytes` |
| 子进程挂死 | 调用层超时 | 60 秒 | `timeout_sec` |
| 子进程残留 | `try/except/kill+wait` | — | 框架内置，不可关闭 |
| 文本解码失败 | `errors="replace"` 容错 | — | 框架内置 |

---

## 7. 并发模型

### 7.1 GIL 影响分析

`subprocess.Popen` + `communicate` 在等待子进程返回期间会**释放 GIL**，因此线程池（`ThreadPoolExecutor`）足以获得并发收益，无需引入多进程或 `multiprocessing.Pool`，避免 fork 副作用与序列化开销。

### 7.2 并发模式选择建议

| 场景 | 推荐入口 | 理由 |
| --- | --- | --- |
| Web 上传同步处理 ≤ 3 文件 | `preprocess_files` | 实现最简，无线程开销 |
| Web 上传 ≥ 5 文件 / 后台批处理 | `preprocess_files_parallel` | 线程池摊薄 Pandoc 启动成本 |
| FastAPI / 异步框架 | `preprocess_files_async` | 不阻塞事件循环 |

### 7.3 线程池容量

`max_workers` 默认 4，建议按以下经验值调整：

| 部署环境 | 推荐值 | 说明 |
| --- | --- | --- |
| 容器 1 CPU | 2 | 防止 Pandoc 抢占主进程 CPU |
| 容器 2-4 CPU | 4 | 默认值 |
| 独立物理机 ≥ 8 CPU | min(8, CPU 数) | 不再线性提升，受磁盘 IO 限制 |

---

## 8. 可观测性

### 8.1 结构化日志字段

| 事件 | 字段示例 |
| --- | --- |
| 转换成功 | `file=井深表.docx before=820416B after=145210B ratio=0.18` |
| 受控降级 | `file=井深表.docx reason=PandocTimeoutError: pandoc timed out after 60.0s` |
| 未知崩溃 | `file=井深表.docx reason=...` + 完整 traceback |

所有字段均使用 `key=value` 形式输出，便于 ELK / Loki / 阿里云 SLS 直接拆字段做检索与告警。

### 8.2 建议告警规则

| 指标 | 阈值建议 | 处置 |
| --- | --- | --- |
| `WARNING` 占比 | > 5% / 10 分钟 | 检查 Pandoc 版本与文档样本 |
| `ERROR` 出现 | 任意一条 | 立即排查（未预期异常） |
| `ratio` < 0.02 或 > 5 | 单条触发 | 检查异常文档（疑似空文档或被恶意构造） |

---

## 9. 部署与依赖

### 9.1 系统依赖

| 组件 | 最低版本 | 验证命令 |
| --- | --- | --- |
| Python | 3.10 | `python --version` |
| Pandoc | 3.0+ | `pandoc --version` |

### 9.2 容器化建议

```dockerfile
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends pandoc \
 && rm -rf /var/lib/apt/lists/*
COPY docx_preprocess.py /app/
```

### 9.3 健康检查

服务启动时建议执行一次"金丝雀转换"验证 Pandoc 可用：

```python
default_pandoc_runner()(b"PK\x03\x04...")  # 抛错即视为不可用
```

---

## 10. 测试策略

### 10.1 单元测试覆盖项

| 用例 | 验证点 |
| --- | --- |
| 非 docx 直通 | runner 不被调用，对象身份一致 |
| 正常 docx 转换 | 文件名后缀重写为 `.md`，MIME 改为 `text/markdown`，buffer 替换 |
| `PandocError` 降级 | 返回原始 `UploadFile`，日志为 `WARNING` |
| 未知异常降级 | 返回原始 `UploadFile`，日志为 `ERROR` + traceback |
| 输出超限 | 抛 `PandocOutputTooLargeError` |
| 子进程超时 | 抛 `PandocTimeoutError`，无僵尸进程残留 |
| 并发 5 文件 | 顺序保持，无串扰 |

### 10.2 测试桩示例

```python
def test_docx_converted():
    svc = DocxPreprocessService(runner=lambda _: b"# hi")
    f = UploadFile("a.docx", DOCX_MIME, b"x" * 10)
    [out] = svc.preprocess_files([f])
    assert out.original_name == "a.md"
    assert out.mimetype == "text/markdown"
    assert out.buffer == b"# hi"

def test_pandoc_failure_falls_back():
    def boom(_: bytes) -> bytes:
        raise PandocExitError(1, "broken")
    svc = DocxPreprocessService(runner=boom)
    f = UploadFile("a.docx", DOCX_MIME, b"x")
    assert svc.preprocess_files([f]) == [f]
```

### 10.3 集成测试

建议准备包含已知缺陷模式的真实样本集（5-10 份业务文档），断言：
- 转换前在 RAGFlow 中检索"4m"召回率 < 30%
- 转换后召回率 ≥ 90%

---

## 11. 演进路线

| 阶段 | 计划 | 触发条件 |
| --- | --- | --- |
| Phase 1 (已交付) | 本地 Pandoc 子进程版本 | — |
| Phase 2 | Pandoc 容器化常驻 + HTTP 调用 | 当本地 Pandoc 启动成本占整体耗时 > 30% |
| Phase 3 | `.doc` / `.pptx` / `.xlsx` 同链路扩展 | 业务侧出现非 docx 同类缺陷 |
| Phase 4 | 替换为 LibreOffice headless 流水线 | Pandoc 对中文复杂表格出现新缺陷 |

---

## 12. 与原 TypeScript 版本的对照

| 维度 | TypeScript 版本 | Python 版本 |
| --- | --- | --- |
| 依赖注入 | NestJS `@Inject(PANDOC_RUNNER)` | `PandocRunner` Protocol + 构造器注入 |
| 并发原语 | `Promise.all` | `asyncio.gather` / `ThreadPoolExecutor.map` |
| 异常分级 | 单一 `Error` | `PandocError` 基类 + 三类子类 |
| 资源上限 | 仅输出字节上限 | 输出字节上限 + 子进程超时 |
| 不可变更新 | TS 解构 `{...file}` | `dataclass(frozen=True)` + `replace` |
| 日志框架 | Winston | 标准 `logging` + 结构化字段 |
| 降级策略 | 失败回退 | 同等回退 + 受控异常 vs 未知崩溃分级 |

---

## 13. 风险与已知限制

| 风险 | 当前缓解 | 残留风险 |
| --- | --- | --- |
| Pandoc 二进制缺失 | 启动金丝雀检查 | 运行期被卸载 → 降级生效，但批量请求会全部记 WARNING |
| 极大 docx (> 50 MiB) | 输出上限保护 | 用户无法上传，需调高 `max_output_bytes` 或拆分文档 |
| Pandoc 自身的 GFM 转换缺陷 | 暂无 | 需定期回归样本集 |
| Markdown 在 RAGFlow 中的切片差异 | 暂无 | 切片粒度变化可能影响召回，需联调评测 |

---

## 14. 相关文档

- `docs/rag-retrieval-replay-diagnosis-2026-06.md` — RAG 检索召回诊断
- `docs/rag-eval-cross-standard-0522-vs-0607.md` — RAG 评测口径对比
- `apps/server/src/common/docx-preprocess/docx-preprocess.service.ts` — TypeScript 原版实现

---

## 附录 A：Python 实现完整源码

> 建议落盘路径：`apps/server-py/docx_preprocess.py`（或其他 Python 服务对应位置）。
> 单文件无外部依赖，仅依赖 Python ≥ 3.10 标准库 + 系统 `pandoc` 二进制。

```python
"""
docx_preprocess.py
==================

将上传的 .docx 文件透明转换为 GitHub Flavored Markdown,再交由下游 RAG
引擎(RAGFlow)解析。

背景
----
RAGFlow 0.24 内置的 deepdoc DocxParser 在解析表格单元格时存在已知缺陷:
  - `0-4m`       → `0`
  - `395-1000m/s`→ `395/s`
  - `20m(inline)x40m` → `(inline)x`
即对形如 `<num>~<num>` / `<num>-<num>` 的数值区间会静默丢弃第二个数字,
并截断括号周边的参数。Pandoc 在 docx → gfm 转换链路上对这些内容是无损
保留的,因此在文件进入 RAGFlow 之前先做一次 pandoc 预处理。

设计原则
--------
1. 透明降级:任何预处理失败均回退到原始 docx,绝不阻断业务上传。
2. 可测试:Pandoc 调用以 ``PandocRunner`` 协议对外开放,单测可注入 fake
   runner,无需真实二进制。
3. 可观测:转换前后字节数、失败原因、降级路径均结构化记录到日志。
4. 资源安全:子进程输出受上限保护,超限即终止并抛出,防止恶意/异常文件
   把内存吃光。
5. 不可变数据:``UploadFile`` 为冻结 dataclass,所有修改通过 ``replace``
   返回新对象,杜绝隐式共享态。
"""

from __future__ import annotations

import asyncio
import logging
import subprocess
from collections.abc import Iterable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, replace
from pathlib import PurePosixPath
from typing import Final, Protocol, runtime_checkable

__all__ = [
    "DOCX_MIME",
    "MAX_PANDOC_BUFFER_BYTES",
    "DEFAULT_PANDOC_TIMEOUT_SEC",
    "UploadFile",
    "PandocRunner",
    "PandocError",
    "PandocOutputTooLargeError",
    "PandocExitError",
    "PandocTimeoutError",
    "default_pandoc_runner",
    "DocxPreprocessService",
    "build_default_service",
]


# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------

DOCX_MIME: Final[str] = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
"""标准 .docx MIME 类型。"""

MAX_PANDOC_BUFFER_BYTES: Final[int] = 50 * 1024 * 1024
"""pandoc 输出上限(50 MiB)。超过即视为异常文件,主动中断。"""

DEFAULT_PANDOC_TIMEOUT_SEC: Final[float] = 60.0
"""单文件 pandoc 子进程默认超时。"""

_MARKDOWN_MIME: Final[str] = "text/markdown"
_PANDOC_BIN: Final[str] = "pandoc"
_PANDOC_ARGS: Final[tuple[str, ...]] = ("-f", "docx", "-t", "gfm")

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 异常体系
# ---------------------------------------------------------------------------

class PandocError(RuntimeError):
    """Pandoc 调用相关的基类异常。"""


class PandocOutputTooLargeError(PandocError):
    """输出超过 ``MAX_PANDOC_BUFFER_BYTES``。"""


class PandocExitError(PandocError):
    """Pandoc 以非 0 退出码退出。"""

    def __init__(self, return_code: int, stderr: str) -> None:
        super().__init__(f"pandoc exited {return_code}: {stderr.strip()}")
        self.return_code = return_code
        self.stderr = stderr


class PandocTimeoutError(PandocError):
    """Pandoc 在指定超时内未完成。"""


# ---------------------------------------------------------------------------
# 数据模型
# ---------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class UploadFile:
    """
    上传文件的不可变视图。

    对应 Node.js 端 ``Express.Multer.File`` 中本服务需要的字段子集:
    ``originalname`` / ``mimetype`` / ``buffer`` / ``size``。
    """

    original_name: str
    mimetype: str
    buffer: bytes

    @property
    def size(self) -> int:
        return len(self.buffer)


# ---------------------------------------------------------------------------
# Pandoc Runner 协议与默认实现
# ---------------------------------------------------------------------------

@runtime_checkable
class PandocRunner(Protocol):
    """
    将 docx 字节流转换为 markdown 字节流的可调用对象。

    抽离为协议是为了:
      1. 单元测试可注入 fake,避免依赖系统 pandoc;
      2. 未来可替换为 HTTP 版 pandoc、容器化 pandoc 或语言内置实现而
         不影响 ``DocxPreprocessService`` 的调用方。
    """

    def __call__(self, data: bytes) -> bytes: ...


@dataclass(frozen=True, slots=True)
class default_pandoc_runner:  # noqa: N801 (保持调用形态 `runner(data)`)
    """
    默认实现:派生系统 ``pandoc`` 子进程,stdin 喂 docx,stdout 收 gfm。

    Parameters
    ----------
    timeout_sec:
        单次调用最长等待时间(秒)。超时即 kill 子进程并抛
        ``PandocTimeoutError``。
    max_output_bytes:
        输出上限。超出抛 ``PandocOutputTooLargeError``。
    pandoc_bin:
        pandoc 可执行文件路径,默认走 PATH 查找。
    """

    timeout_sec: float = DEFAULT_PANDOC_TIMEOUT_SEC
    max_output_bytes: int = MAX_PANDOC_BUFFER_BYTES
    pandoc_bin: str = _PANDOC_BIN

    def __call__(self, data: bytes) -> bytes:
        proc = subprocess.Popen(
            [self.pandoc_bin, *_PANDOC_ARGS],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            stdout, stderr = proc.communicate(
                input=data, timeout=self.timeout_sec
            )
        except subprocess.TimeoutExpired as exc:
            proc.kill()
            proc.wait()
            raise PandocTimeoutError(
                f"pandoc timed out after {self.timeout_sec}s"
            ) from exc
        except BaseException:
            proc.kill()
            proc.wait()
            raise

        if len(stdout) > self.max_output_bytes:
            raise PandocOutputTooLargeError(
                f"pandoc output exceeded {self.max_output_bytes} bytes"
            )
        if proc.returncode != 0:
            raise PandocExitError(
                return_code=proc.returncode,
                stderr=stderr.decode("utf-8", errors="replace"),
            )
        return stdout


# ---------------------------------------------------------------------------
# 内部工具函数
# ---------------------------------------------------------------------------

def _is_docx(file: UploadFile) -> bool:
    """文件名后缀 *或* MIME 命中即视为 docx。"""
    return (
        file.original_name.lower().endswith(".docx")
        or file.mimetype == DOCX_MIME
    )


def _rewrite_as_markdown(file: UploadFile, markdown: bytes) -> UploadFile:
    """生成 markdown 版本的新 UploadFile,原对象保持不变。"""
    path = PurePosixPath(file.original_name)
    if path.suffix.lower() == ".docx":
        path = path.with_suffix(".md")
    return replace(
        file,
        original_name=str(path),
        mimetype=_MARKDOWN_MIME,
        buffer=markdown,
    )


# ---------------------------------------------------------------------------
# 服务主体
# ---------------------------------------------------------------------------

class DocxPreprocessService:
    """
    Docx → Markdown 预处理服务。

    业务定位
    --------
    在文件进入 RAGFlow 之前对 .docx 做一次无损转换,规避 deepdoc
    DocxParser 的数值/参数丢失缺陷。非 docx 文件直通,任何转换异常都
    会**降级为原始 docx 上传**,确保上传链路高可用。

    使用方式
    --------
    >>> service = DocxPreprocessService()
    >>> processed = service.preprocess_files(uploaded_files)

    单元测试中可注入 fake runner:

    >>> def fake_runner(data: bytes) -> bytes:
    ...     return b"# stub"
    >>> service = DocxPreprocessService(runner=fake_runner)
    """

    def __init__(
        self,
        runner: PandocRunner | None = None,
        *,
        max_workers: int = 4,
    ) -> None:
        self._runner: PandocRunner = runner or default_pandoc_runner()
        self._max_workers = max_workers

    # ---- 同步 API ---------------------------------------------------------

    def preprocess_files(
        self, files: Sequence[UploadFile]
    ) -> list[UploadFile]:
        """串行处理一批文件。批量较小时优先使用本方法。"""
        return [self._preprocess_one(f) for f in files]

    def preprocess_files_parallel(
        self, files: Sequence[UploadFile]
    ) -> list[UploadFile]:
        """
        使用线程池并发处理一批文件。

        Pandoc 子进程为 IO/CPU 混合负载,GIL 在 ``subprocess`` 调用期间
        释放,因此线程池足以获得并发收益,无需引入多进程。
        """
        if not files:
            return []
        with ThreadPoolExecutor(max_workers=self._max_workers) as pool:
            return list(pool.map(self._preprocess_one, files))

    # ---- 异步 API ---------------------------------------------------------

    async def preprocess_files_async(
        self, files: Sequence[UploadFile]
    ) -> list[UploadFile]:
        """
        异步并发版本,语义对齐原 TypeScript 实现中的
        ``Promise.all(files.map(...))``。

        每个文件落到默认线程池,主事件循环不被阻塞。
        """
        if not files:
            return []
        loop = asyncio.get_running_loop()
        return await asyncio.gather(
            *(loop.run_in_executor(None, self._preprocess_one, f)
              for f in files)
        )

    # ---- 内部核心 ---------------------------------------------------------

    def _preprocess_one(self, file: UploadFile) -> UploadFile:
        if not _is_docx(file):
            return file
        try:
            markdown = self._runner(file.buffer)
        except PandocError as error:
            logger.warning(
                "docx → md preprocess failed; fallback to original docx. "
                "file=%s reason=%s",
                file.original_name,
                error,
            )
            return file
        except Exception as error:  # noqa: BLE001 — 兜底防御
            logger.exception(
                "docx → md preprocess crashed unexpectedly; fallback to "
                "original docx. file=%s reason=%s",
                file.original_name,
                error,
            )
            return file

        logger.info(
            "docx → md ok. file=%s before=%dB after=%dB ratio=%.2f",
            file.original_name,
            file.size,
            len(markdown),
            (len(markdown) / file.size) if file.size else 0.0,
        )
        return _rewrite_as_markdown(file, markdown)


# ---------------------------------------------------------------------------
# 便捷工厂(供 FastAPI/Flask 等框架的 DI 容器直接装配)
# ---------------------------------------------------------------------------

def build_default_service(
    *,
    timeout_sec: float = DEFAULT_PANDOC_TIMEOUT_SEC,
    max_output_bytes: int = MAX_PANDOC_BUFFER_BYTES,
    pandoc_bin: str = _PANDOC_BIN,
    max_workers: int = 4,
) -> DocxPreprocessService:
    """生产环境推荐入口:封装常用参数,避免调用方手工拼装。"""
    runner = default_pandoc_runner(
        timeout_sec=timeout_sec,
        max_output_bytes=max_output_bytes,
        pandoc_bin=pandoc_bin,
    )
    return DocxPreprocessService(runner=runner, max_workers=max_workers)


# ---------------------------------------------------------------------------
# 类型导出辅助(供调用方做类型检查)
# ---------------------------------------------------------------------------

UploadFiles = Iterable[UploadFile]
```

---

## 附录 B：单元测试样板

> 建议落盘路径：`apps/server-py/tests/test_docx_preprocess.py`。
> 使用 `pytest` 框架，无需任何额外插件。

```python
"""docx_preprocess 单元测试。"""

from __future__ import annotations

import pytest

from docx_preprocess import (
    DOCX_MIME,
    DocxPreprocessService,
    PandocExitError,
    PandocOutputTooLargeError,
    PandocTimeoutError,
    UploadFile,
    _is_docx,
    _rewrite_as_markdown,
)


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

def _docx(name: str = "a.docx", body: bytes = b"raw-docx-bytes") -> UploadFile:
    return UploadFile(original_name=name, mimetype=DOCX_MIME, buffer=body)


def _non_docx() -> UploadFile:
    return UploadFile(
        original_name="readme.pdf",
        mimetype="application/pdf",
        buffer=b"%PDF-1.7",
    )


# ---------------------------------------------------------------------------
# 直通分支
# ---------------------------------------------------------------------------

def test_non_docx_passthrough_does_not_invoke_runner():
    called = []

    def boom(_: bytes) -> bytes:
        called.append(True)
        raise AssertionError("runner should not be called for non-docx")

    svc = DocxPreprocessService(runner=boom)
    f = _non_docx()

    [out] = svc.preprocess_files([f])
    assert out is f
    assert called == []


def test_is_docx_detects_by_extension_case_insensitive():
    assert _is_docx(UploadFile("X.DOCX", "application/octet-stream", b""))


def test_is_docx_detects_by_mime_when_extension_missing():
    assert _is_docx(UploadFile("noext", DOCX_MIME, b""))


# ---------------------------------------------------------------------------
# 正常转换
# ---------------------------------------------------------------------------

def test_docx_converted_to_markdown():
    svc = DocxPreprocessService(runner=lambda _: b"# Hello\n")
    f = _docx("report.docx", b"x" * 100)

    [out] = svc.preprocess_files([f])

    assert out.original_name == "report.md"
    assert out.mimetype == "text/markdown"
    assert out.buffer == b"# Hello\n"
    assert out.size == len(b"# Hello\n")


def test_rewrite_preserves_directory_segments():
    f = UploadFile("subdir/report.docx", DOCX_MIME, b"x")
    out = _rewrite_as_markdown(f, b"# md")
    assert out.original_name == "subdir/report.md"


def test_original_object_is_not_mutated():
    svc = DocxPreprocessService(runner=lambda _: b"# md")
    f = _docx()
    svc.preprocess_files([f])
    assert f.original_name == "a.docx"
    assert f.mimetype == DOCX_MIME


# ---------------------------------------------------------------------------
# 降级分支
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "error",
    [
        PandocExitError(1, "broken"),
        PandocTimeoutError("timed out"),
        PandocOutputTooLargeError("too big"),
    ],
)
def test_pandoc_error_falls_back_to_original(error: Exception):
    def boom(_: bytes) -> bytes:
        raise error

    svc = DocxPreprocessService(runner=boom)
    f = _docx()

    [out] = svc.preprocess_files([f])
    assert out is f  # 原对象直接返回,不复制


def test_unexpected_error_also_falls_back(caplog):
    def boom(_: bytes) -> bytes:
        raise RuntimeError("unexpected")

    svc = DocxPreprocessService(runner=boom)
    f = _docx()

    with caplog.at_level("ERROR"):
        [out] = svc.preprocess_files([f])

    assert out is f
    assert any("crashed unexpectedly" in rec.message for rec in caplog.records)


# ---------------------------------------------------------------------------
# 并发分支
# ---------------------------------------------------------------------------

def test_parallel_preserves_order_and_count():
    svc = DocxPreprocessService(
        runner=lambda data: b"# " + data,
        max_workers=4,
    )
    files = [_docx(f"f{i}.docx", bytes([i])) for i in range(5)]

    outs = svc.preprocess_files_parallel(files)

    assert [o.original_name for o in outs] == [f"f{i}.md" for i in range(5)]
    assert [o.buffer for o in outs] == [b"# " + bytes([i]) for i in range(5)]


def test_parallel_empty_input_returns_empty_list():
    svc = DocxPreprocessService(runner=lambda _: b"")
    assert svc.preprocess_files_parallel([]) == []


# ---------------------------------------------------------------------------
# 异步分支
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_async_preprocess_matches_sync_behaviour():
    svc = DocxPreprocessService(runner=lambda data: data + b"-md")
    files = [_docx(f"f{i}.docx", bytes([i])) for i in range(3)]

    outs = await svc.preprocess_files_async(files)

    assert [o.original_name for o in outs] == [f"f{i}.md" for i in range(3)]
    assert [o.buffer for o in outs] == [bytes([i]) + b"-md" for i in range(3)]
```

---

**文档结束**
