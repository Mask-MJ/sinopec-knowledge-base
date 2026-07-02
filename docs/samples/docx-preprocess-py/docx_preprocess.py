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
