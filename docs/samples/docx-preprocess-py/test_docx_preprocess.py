"""docx_preprocess 单元测试。

运行方式::

    cd docs/samples/docx-preprocess-py
    pip install pytest pytest-asyncio
    pytest -v
"""

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
    assert out is f


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
