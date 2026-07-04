# 中石化知识库 —— 文档解析 / 表格处理 / 专业词典 / 分块方式 技术说明

> 生成日期：2026-07-02 本文按四个问题组织：Word/PDF 解析代码、表格处理代码、专业词典建设与内容、分块方式代码与文字解释。所有关键代码完整贴出。

---

## 0. 系统总览

```
用户上传 (.docx / .pdf / .xlsx / .csv / .md / .txt …)
  │
  ├─▶ docx-preprocess.service.ts               pandoc: docx → markdown (绕开表格数字丢失问题)
  │
  ├─▶ knowledge-base.service.ts                POST /api/v1/datasets/{id}/documents
  │
  ├─▶ deepdoc/parser/{docx,pdf,excel}_parser.py   OCR / Layout / TSR + 结构化
  │
  ├─▶ rag/app/naive.py::chunk()                按 chunk_token_num=512 分块 + 滑动窗口 overlap
  │
  ├─▶ embedding + 入索引
  │
  ├─▶ chunk-tag-queue.service.ts               后台轮询,解析 DONE 即入队
  │
  └─▶ chunk-tagger.service.ts                  用「专业词典 + 项目名字典」给 chunk 打 important_keywords
```

四个问题的实现分布：

| 问题 | 主实现位置 |
| --- | --- |
| Word / PDF 解析 | [deepdoc/parser/docx_parser.py](ragflow-src/deepdoc/parser/docx_parser.py) / [deepdoc/parser/pdf_parser.py](ragflow-src/deepdoc/parser/pdf_parser.py)；docx 上传前置 [docx-preprocess.service.ts](apps/server/src/common/docx-preprocess/docx-preprocess.service.ts) 走 pandoc 转 markdown |
| 表格处理 | Word 表 → [docx_parser.py](ragflow-src/deepdoc/parser/docx_parser.py) 里的 `__extract_table_content`；Excel → [excel_parser.py](ragflow-src/deepdoc/parser/excel_parser.py)；PDF 表 → `TableStructureRecognizer` + 旋转纠偏 |
| 专业词典 | [sinopec-concept-dict.csv](apps/server/src/common/chunk-tagger/dataset/sinopec-concept-dict.csv) 2491 条术语；[keyword-matcher.ts](apps/server/src/common/chunk-tagger/keyword-matcher.ts) 匹配；[chunk-tagger.service.ts](apps/server/src/common/chunk-tagger/chunk-tagger.service.ts) 落地 |
| 分块方式 | [rag/app/naive.py](ragflow-src/rag/app/naive.py) `chunk()` 主入口；[rag/nlp/**init**.py](ragflow-src/rag/nlp/__init__.py) `naive_merge()` 合并算法；默认参数 [knowledge-base.defaults.ts](apps/server/src/common/defaults/knowledge-base.defaults.ts) |

---

## 1. Word / PDF 解析代码

### 1.1 Word 上传预处理 —— pandoc 转 markdown

**为什么存在**：旧版 `DocxParser` 在解析表格里 `<num>~<num>` / `<num>-<num>` 这类范围值时会静默丢掉第二个数字（例：`0-4m` → `0`，`395-1000m/s` → `395/s`），也会剥掉括号里的参数（`20m（inline）×40m` → `（inline）×`）。生产环境实测受此影响的都是勘探报告的观测系统参数表。方案是 docx 上传后先用系统 `pandoc` 转成 GitHub Flavored Markdown 再送入后续解析流程，markdown 通道不受此问题影响。pandoc 失败则降级为原 docx。

[apps/server/src/common/docx-preprocess/docx-preprocess.service.ts](apps/server/src/common/docx-preprocess/docx-preprocess.service.ts) 完整代码：

```ts
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

/**
 * Convert a docx buffer to a markdown buffer.
 *
 * Extracted as an injectable token so unit tests can stub pandoc out without
 * shelling out to a real binary.
 */
export type PandocRunner = (input: Buffer) => Promise<Buffer>;

export const PANDOC_RUNNER = Symbol('PANDOC_RUNNER');

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const MAX_PANDOC_BUFFER_BYTES = 50 * 1024 * 1024;

/**
 * Default runner: spawns the system `pandoc` binary, feeds the docx buffer on
 * stdin, and reads the markdown output from stdout. Errors propagate so the
 * caller can decide whether to fall back to the original file.
 */
export const defaultPandocRunner: PandocRunner = (input) =>
  new Promise<Buffer>((resolve, reject) => {
    const proc = spawn('pandoc', ['-f', 'docx', '-t', 'gfm']);
    const chunks: Buffer[] = [];
    let stderr = '';
    let totalBytes = 0;

    proc.stdout.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_PANDOC_BUFFER_BYTES) {
        proc.kill();
        reject(
          new Error(
            `pandoc output exceeded ${MAX_PANDOC_BUFFER_BYTES} bytes, aborted`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pandoc exited ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });

    proc.stdin.write(input);
    proc.stdin.end();
  });

function isDocx(file: Express.Multer.File): boolean {
  return /\.docx$/i.test(file.originalname) || file.mimetype === DOCX_MIME;
}

function rewriteAsMarkdown(
  file: Express.Multer.File,
  md: Buffer,
): Express.Multer.File {
  return {
    ...file,
    originalname: file.originalname.replace(/\.docx$/i, '.md'),
    mimetype: 'text/markdown',
    buffer: md,
    size: md.length,
  };
}

@Injectable()
export class DocxPreprocessService {
  private readonly logger = new Logger(DocxPreprocessService.name);
  private readonly runner: PandocRunner;

  constructor(@Inject(PANDOC_RUNNER) @Optional() runner?: PandocRunner) {
    this.runner = runner ?? defaultPandocRunner;
  }

  async preprocessFiles(
    files: Express.Multer.File[],
  ): Promise<Express.Multer.File[]> {
    return Promise.all(files.map((file) => this.preprocessOne(file)));
  }

  private async preprocessOne(
    file: Express.Multer.File,
  ): Promise<Express.Multer.File> {
    if (!isDocx(file)) return file;
    try {
      const md = await this.runner(file.buffer);
      this.logger.log(
        `docx → md: ${file.originalname} (${file.size}B → ${md.length}B)`,
      );
      return rewriteAsMarkdown(file, md);
    } catch (error) {
      this.logger.warn(
        `docx → md preprocess failed for ${file.originalname}; uploading original docx instead. Reason: ${(error as Error).message}`,
      );
      return file;
    }
  }
}
```

要点：

- 用 `spawn('pandoc', ['-f', 'docx', '-t', 'gfm'])` 走 stdin/stdout 管道，不落临时文件
- 50MB 输出上限保护（防内存爆炸）
- 转换成功：文件名后缀改 `.md`、mimetype 改 `text/markdown`、buffer 替换
- 转换失败：warn 后返回原 docx，不阻塞上传（可用性优先）
- Runner 通过 `PANDOC_RUNNER` symbol 注入，单测可 stub

### 1.2 Word 结构化解析 —— DocxParser（兜底路径）

前置 pandoc 失败或未启用预处理时走此路径。基于 `python-docx` 库遍历段落与表格。

[deepdoc/parser/docx_parser.py](ragflow-src/deepdoc/parser/docx_parser.py) 完整 139 行：

```python
from docx import Document
import re
import pandas as pd
from collections import Counter
from rag.nlp import rag_tokenizer
from io import BytesIO


class RAGFlowDocxParser:

    def __extract_table_content(self, tb):
        df = []
        for row in tb.rows:
            df.append([c.text for c in row.cells])
        return self.__compose_table_content(pd.DataFrame(df))

    def __compose_table_content(self, df):

        def blockType(b):
            pattern = [
                ("^(20|19)[0-9]{2}[年/-][0-9]{1,2}[月/-][0-9]{1,2}日*$", "Dt"),
                (r"^(20|19)[0-9]{2}年$", "Dt"),
                (r"^(20|19)[0-9]{2}[年/-][0-9]{1,2}月*$", "Dt"),
                ("^[0-9]{1,2}[月/-][0-9]{1,2}日*$", "Dt"),
                (r"^第*[一二三四1-4]季度$", "Dt"),
                (r"^(20|19)[0-9]{2}年*[一二三四1-4]季度$", "Dt"),
                (r"^(20|19)[0-9]{2}[ABCDE]$", "DT"),
                ("^[0-9.,+%/ -]+$", "Nu"),
                (r"^[0-9A-Z/\._~-]+$", "Ca"),
                (r"^[A-Z]*[a-z' -]+$", "En"),
                (r"^[0-9.,+-]+[0-9A-Za-z/$￥%<>（）()' -]+$", "NE"),
                (r"^.{1}$", "Sg")
            ]
            for p, n in pattern:
                if re.search(p, b):
                    return n
            tks = [t for t in rag_tokenizer.tokenize(b).split() if len(t) > 1]
            if len(tks) > 3:
                if len(tks) < 12:
                    return "Tx"
                else:
                    return "Lx"

            if len(tks) == 1 and rag_tokenizer.tag(tks[0]) == "nr":
                return "Nr"

            return "Ot"

        if len(df) < 2:
            return []
        max_type = Counter([blockType(str(df.iloc[i, j])) for i in range(
            1, len(df)) for j in range(len(df.iloc[i, :]))])
        max_type = max(max_type.items(), key=lambda x: x[1])[0]

        colnm = len(df.iloc[0, :])
        hdrows = [0]  # header is not necessarily appear in the first line
        if max_type == "Nu":
            for r in range(1, len(df)):
                tys = Counter([blockType(str(df.iloc[r, j]))
                              for j in range(len(df.iloc[r, :]))])
                tys = max(tys.items(), key=lambda x: x[1])[0]
                if tys != max_type:
                    hdrows.append(r)

        lines = []
        for i in range(1, len(df)):
            if i in hdrows:
                continue
            hr = [r - i for r in hdrows]
            hr = [r for r in hr if r < 0]
            t = len(hr) - 1
            while t > 0:
                if hr[t] - hr[t - 1] > 1:
                    hr = hr[t:]
                    break
                t -= 1
            headers = []
            for j in range(len(df.iloc[i, :])):
                t = []
                for h in hr:
                    x = str(df.iloc[i + h, j]).strip()
                    if x in t:
                        continue
                    t.append(x)
                t = ",".join(t)
                if t:
                    t += ": "
                headers.append(t)
            cells = []
            for j in range(len(df.iloc[i, :])):
                if not str(df.iloc[i, j]):
                    continue
                cells.append(headers[j] + str(df.iloc[i, j]))
            lines.append(";".join(cells))

        if colnm > 3:
            return lines
        return ["\n".join(lines)]

    def __call__(self, fnm, from_page=0, to_page=100000000):
        self.doc = Document(fnm) if isinstance(
            fnm, str) else Document(BytesIO(fnm))
        pn = 0 # parsed page
        secs = [] # parsed contents
        for p in self.doc.paragraphs:
            if pn > to_page:
                break

            runs_within_single_paragraph = [] # save runs within the range of pages
            for run in p.runs:
                if pn > to_page:
                    break
                if from_page <= pn < to_page and p.text.strip():
                    runs_within_single_paragraph.append(run.text) # append run.text first

                # wrap page break checker into a static method
                if 'lastRenderedPageBreak' in run._element.xml:
                    pn += 1

            secs.append(("".join(runs_within_single_paragraph), p.style.name if hasattr(p.style, 'name') else '')) # then concat run.text as part of the paragraph

        tbls = [self.__extract_table_content(tb) for tb in self.doc.tables]
        return secs, tbls
```

要点：

- `__call__` 返回 `(secs, tbls)`：正文段落列表 + 表格列表分开
- 段落层遍历 `paragraph → run`，按 `run.text` 拼段落文本（避免样式跨 run 断句）
- 分页跟踪：docx 没有真实"页"概念，用 `lastRenderedPageBreak` XML 标签追踪 Word 上一次渲染时的分页点
- `secs` 每项是 `(text, style_name)` 二元组，`style_name` 保留段落样式（供后续按标题层级判定）
- 表格走 `__extract_table_content` → `__compose_table_content` 智能处理（详见 §2.1）

### 1.3 PDF 解析器初始化 —— OCR + Layout + TSR 三模型

[deepdoc/parser/pdf_parser.py](ragflow-src/deepdoc/parser/pdf_parser.py) `RAGFlowPdfParser` 类初始化：

```python
from deepdoc.vision import OCR, AscendLayoutRecognizer, LayoutRecognizer, Recognizer, TableStructureRecognizer

class RAGFlowPdfParser:
    def __init__(self, **kwargs):
        """
        If you have trouble downloading HuggingFace models, -_^ this might help!!

        For Linux:
        export HF_ENDPOINT=https://hf-mirror.com

        For Windows:
        Good luck
        ^_-
        """

        self.ocr = OCR()
        self.parallel_limiter = None
        if settings.PARALLEL_DEVICES > 1:
            self.parallel_limiter = [asyncio.Semaphore(1) for _ in range(settings.PARALLEL_DEVICES)]

        layout_recognizer_type = os.getenv("LAYOUT_RECOGNIZER_TYPE", "onnx").lower()
        if layout_recognizer_type not in ["onnx", "ascend"]:
            raise RuntimeError("Unsupported layout recognizer type.")

        if hasattr(self, "model_speciess"):
            recognizer_domain = "layout." + self.model_speciess
        else:
            recognizer_domain = "layout"

        if layout_recognizer_type == "ascend":
            logging.debug("Using Ascend LayoutRecognizer")
            self.layouter = AscendLayoutRecognizer(recognizer_domain)
        else:  # onnx
            logging.debug("Using Onnx LayoutRecognizer")
            self.layouter = LayoutRecognizer(recognizer_domain)
        self.tbl_det = TableStructureRecognizer()

        self.updown_cnt_mdl = xgb.Booster()
        try:
            pip_install_torch()
            import torch.cuda
            if torch.cuda.is_available():
                self.updown_cnt_mdl.set_param({"device": "cuda"})
        except Exception:
            logging.info("No torch found.")
        try:
            model_dir = os.path.join(get_project_base_directory(), "rag/res/deepdoc")
            self.updown_cnt_mdl.load_model(os.path.join(model_dir, "updown_concat_xgb.model"))
        except Exception:
            model_dir = snapshot_download(
                repo_id="InfiniFlow/text_concat_xgb_v1.0",
                local_dir=os.path.join(get_project_base_directory(), "rag/res/deepdoc"),
                local_dir_use_symlinks=False,
            )
            self.updown_cnt_mdl.load_model(os.path.join(model_dir, "updown_concat_xgb.model"))

        self.page_from = 0
        self.column_num = 1
```

要点：

- **OCR**：deepdoc 自带 Onnx 部署，负责文本框检测 + 文字识别
- **LayoutRecognizer**：版式识别，给每个文字框打 `layout_type`（title / text / figure / table / caption / reference / …）；支持 Onnx（默认）与华为 Ascend NPU 两种后端
- **TableStructureRecognizer** (TSR)：CV 模型识别表格 cell 网格
- **updown_cnt_mdl**：XGBoost 二分类器，判断上下两个文本框是否应合并为一段（下文 `_concat_downward` 用它）
- **parallel_limiter**：多 GPU/NPU 时按设备数建 semaphore，控制单设备并发

### 1.4 PDF 主入口 —— 页面切图 → OCR → 版式 → 表格 → 合并

同文件 `__images__`（页面切图 + 并发 OCR）关键段：

```python
def __images__(self, fnm, zoomin=3, page_from=0, page_to=299, callback=None):
    self.lefted_chars = []
    self.mean_height = []
    self.mean_width = []
    self.boxes = []
    self.garbages = {}
    self.page_cum_height = [0]
    self.page_layout = []
    self.page_from = page_from
    start = timer()
    try:
        with sys.modules[LOCK_KEY_pdfplumber]:
            with pdfplumber.open(fnm) if isinstance(fnm, str) else pdfplumber.open(BytesIO(fnm)) as pdf:
                self.pdf = pdf
                self.page_images = [
                    p.to_image(resolution=72 * zoomin, antialias=True).annotated
                    for i, p in enumerate(self.pdf.pages[page_from:page_to])
                ]

                try:
                    self.page_chars = [
                        [c for c in page.dedupe_chars().chars if self._has_color(c)]
                        for page in self.pdf.pages[page_from:page_to]
                    ]
                except Exception as e:
                    logging.warning(f"Failed to extract characters for pages {page_from}-{page_to}: {str(e)}")
                    self.page_chars = [[] for _ in range(page_to - page_from)]

                self.total_page = len(self.pdf.pages)
    except Exception as e:
        logging.exception(f"RAGFlowPdfParser __images__, exception: {e}")
    logging.info(f"__images__ dedupe_chars cost {timer() - start}s")

    # 提取 PDF 大纲(书签目录)
    self.outlines = []
    try:
        with pdf2_read(fnm if isinstance(fnm, str) else BytesIO(fnm)) as pdf:
            self.pdf = pdf
            outlines = self.pdf.outline

            def dfs(arr, depth):
                for a in arr:
                    if isinstance(a, dict):
                        self.outlines.append((a["/Title"], depth))
                        continue
                    dfs(a, depth + 1)
            dfs(outlines, 0)
    except Exception as e:
        logging.warning(f"Outlines exception: {e}")

    # 采样判定是否英文文档(用于后续分词/合并逻辑分流)
    self.is_english = [
        re.search(
            r"[ a-zA-Z0-9,/¸;:'\[\]\(\)!@#$%^&*\"?<>._-]{30,}",
            "".join(random.choices([c["text"] for c in self.page_chars[i]],
                                    k=min(100, len(self.page_chars[i]))))
        )
        for i in range(len(self.page_chars))
    ]
    if sum([1 if e else 0 for e in self.is_english]) > len(self.page_images) / 2:
        self.is_english = True
    else:
        self.is_english = False

    # 并发 OCR:每页一个 async task
    async def __img_ocr(i, id, img, chars, limiter):
        j = 0
        while j + 1 < len(chars):
            if (
                chars[j]["text"]
                and chars[j + 1]["text"]
                and re.match(r"[0-9a-zA-Z,.:;!%]+", chars[j]["text"] + chars[j + 1]["text"])
                and chars[j + 1]["x0"] - chars[j]["x1"] >= min(chars[j + 1]["width"], chars[j]["width"]) / 2
            ):
                chars[j]["text"] += " "
            j += 1

        if limiter:
            async with limiter:
                await thread_pool_exec(self.__ocr, i + 1, img, chars, zoomin, id)
        else:
            self.__ocr(i + 1, img, chars, zoomin, id)

        if callback and i % 6 == 5:
            callback((i + 1) * 0.6 / len(self.page_images))

    async def __img_ocr_launcher():
        def __ocr_preprocess():
            chars = self.page_chars[i] if not self.is_english else []
            self.mean_height.append(np.median(sorted([c["height"] for c in chars])) if chars else 0)
            self.mean_width.append(np.median(sorted([c["width"] for c in chars])) if chars else 8)
            self.page_cum_height.append(img.size[1] / zoomin)
            return chars

        if self.parallel_limiter:
            tasks = []
            for i, img in enumerate(self.page_images):
                chars = __ocr_preprocess()
                semaphore = self.parallel_limiter[i % settings.PARALLEL_DEVICES]

                async def wrapper(i=i, img=img, chars=chars, semaphore=semaphore):
                    await __img_ocr(i, i % settings.PARALLEL_DEVICES, img, chars, semaphore)

                tasks.append(asyncio.create_task(wrapper()))
                await asyncio.sleep(0)

            try:
                await asyncio.gather(*tasks, return_exceptions=False)
            except Exception as e:
                logging.error(f"Error in OCR: {e}")
                for t in tasks:
                    t.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
                raise
        else:
            for i, img in enumerate(self.page_images):
                chars = __ocr_preprocess()
                await __img_ocr(i, 0, img, chars, None)

    start = timer()
    asyncio.run(__img_ocr_launcher())
    logging.info(f"__images__ {len(self.page_images)} pages cost {timer() - start}s")

    if not self.is_english and not any([c for c in self.page_chars]) and self.boxes:
        bxes = [b for bxs in self.boxes for b in bxs]
        self.is_english = re.search(
            r"[ \na-zA-Z0-9,/¸;:'\[\]\(\)!@#$%^&*\"?<>._-]{30,}",
            "".join([b["text"] for b in random.choices(bxes, k=min(30, len(bxes)))]),
        )

    logging.debug(f"Is it English: {self.is_english}")
    self.page_cum_height = np.cumsum(self.page_cum_height)
    assert len(self.page_cum_height) == len(self.page_images) + 1

    # 全页无 OCR 结果 → 放大 3 倍重跑(应对小字号扫描件)
    if len(self.boxes) == 0 and zoomin < 9:
        self.__images__(fnm, zoomin * 3, page_from, page_to, callback)
```

同文件 `__call__` 编排解析流水线：

```python
def __call__(self, fnm, need_image=True, zoomin=3, return_html=False, auto_rotate_tables=None):
    """
    Parse a PDF file.

    Args:
        fnm: PDF file path or binary content
        need_image: Whether to extract images
        zoomin: Zoom factor
        return_html: Whether to return tables in HTML format
        auto_rotate_tables: Whether to enable auto orientation correction for tables.
                           None: Use TABLE_AUTO_ROTATE env var setting (default: True)
                           True: Enable auto orientation correction
                           False: Disable auto orientation correction
    """
    if auto_rotate_tables is None:
        auto_rotate_tables = os.getenv("TABLE_AUTO_ROTATE", "true").lower() in ("true", "1", "yes")

    self.__images__(fnm, zoomin)                 # 1. 页面切图 + 并发 OCR
    self._layouts_rec(zoomin)                    # 2. 版式识别(给每个文字框打 layout_type)
    self._table_transformer_job(zoomin, auto_rotate=auto_rotate_tables)  # 3. 表格结构识别 + 旋转纠偏
    self._text_merge()                           # 4. 同行文本框水平合并
    self._concat_downward()                      # 5. 上下文本框竖向合并(XGBoost 判)
    self._filter_forpages()                      # 6. 过滤重复页眉页脚
    tbls = self._extract_table_figure(need_image, zoomin, return_html, False)  # 7. 抽取表格+图
    return self.__filterout_scraps(deepcopy(self.boxes), zoomin), tbls
```

带 callback 进度上报的入口（分块流程实际调用的是它）：

```python
def parse_into_bboxes(self, fnm, callback=None, zoomin=3):
    start = timer()
    self.__images__(fnm, zoomin, callback=callback)
    if callback:
        callback(0.40, "OCR finished ({:.2f}s)".format(timer() - start))

    start = timer()
    self._layouts_rec(zoomin)
    if callback:
        callback(0.63, "Layout analysis ({:.2f}s)".format(timer() - start))

    auto_rotate_tables = os.getenv("TABLE_AUTO_ROTATE", "true").lower() in ("true", "1", "yes")

    start = timer()
    self._table_transformer_job(zoomin, auto_rotate=auto_rotate_tables)
    if callback:
        callback(0.83, "Table analysis ({:.2f}s)".format(timer() - start))

    start = timer()
    self._text_merge()
    self._concat_downward()
    self._naive_vertical_merge(zoomin)
    if callback:
        callback(0.92, "Text merged ({:.2f}s)".format(timer() - start))
```

PDF 解析全流水线一句话概括：**页面栅格化 → OCR → 版式分类 → 表格识别（含旋转纠偏）→ 水平/竖向文本框合并 → 页眉页脚过滤 → 输出正文 boxes + 表格 tbls**。

---

## 2. 表格处理代码

三种文件类型分别有独立处理路径。

### 2.1 Word 表格 —— 智能表头识别 + 键值对展平

已在 §1.2 完整贴出 `docx_parser.py`。表格处理走 `__extract_table_content` → `__compose_table_content`（33-114 行）：

**算法核心**：

1. 每个 cell 打类型标签（`blockType`）：
   - `Dt` 日期、`Nu` 数字、`Ca` 编码、`En` 英文、`NE` 数字+单位、`Sg` 单字
   - `Tx` 短文本、`Lx` 长文本、`Nr` 人名、`Ot` 其他
2. 统计全表出现最多的类型（通常是 `Nu`，代表数据主体）
3. 表头不一定在第 0 行：偏离主类型的行判定为表头（多级表头也能识别）
4. 每个数据行拼成 `列名: 值; 列名: 值; …`（分号连接）
5. 宽表（`> 3` 列）每行独立返回；窄表整表合成一段（保留上下文）

拼接示例：

| 项目     | 2024Q1 | 2024Q2 |
| -------- | ------ | ------ |
| 采集道数 | 5000   | 6000   |
| 覆盖次数 | 120    | 150    |

拼接为两个 chunk：

- `项目: 采集道数; 2024Q1: 5000; 2024Q2: 6000`
- `项目: 覆盖次数; 2024Q1: 120; 2024Q2: 150`

对纯文本 embedding 检索非常友好。

### 2.2 Excel 表格 —— 多格式加载 + 巨表优化 + 图片提取

[deepdoc/parser/excel_parser.py](ragflow-src/deepdoc/parser/excel_parser.py) 完整代码：

```python
import logging
import re
import sys
from io import BytesIO

import pandas as pd
from openpyxl import Workbook, load_workbook
from PIL import Image

from rag.nlp import find_codec

# copied from `/openpyxl/cell/cell.py`
ILLEGAL_CHARACTERS_RE = re.compile(r"[\000-\010]|[\013-\014]|[\016-\037]")


class RAGFlowExcelParser:
    @staticmethod
    def _load_excel_to_workbook(file_like_object):
        if isinstance(file_like_object, bytes):
            file_like_object = BytesIO(file_like_object)

        # Read first 4 bytes to determine file type
        file_like_object.seek(0)
        file_head = file_like_object.read(4)
        file_like_object.seek(0)

        if not (file_head.startswith(b"PK\x03\x04") or file_head.startswith(b"\xd0\xcf\x11\xe0")):
            logging.info("Not an Excel file, converting CSV to Excel Workbook")

            try:
                file_like_object.seek(0)
                df = pd.read_csv(file_like_object, on_bad_lines='skip')
                return RAGFlowExcelParser._dataframe_to_workbook(df)

            except Exception as e_csv:
                raise Exception(f"Failed to parse CSV and convert to Excel Workbook: {e_csv}")

        try:
            return load_workbook(file_like_object, data_only=True)
        except Exception as e:
            logging.info(f"openpyxl load error: {e}, try pandas instead")
            try:
                file_like_object.seek(0)
                try:
                    dfs = pd.read_excel(file_like_object, sheet_name=None)
                    return RAGFlowExcelParser._dataframe_to_workbook(dfs)
                except Exception as ex:
                    logging.info(f"pandas with default engine load error: {ex}, try calamine instead")
                    file_like_object.seek(0)
                    df = pd.read_excel(file_like_object, engine="calamine")
                    return RAGFlowExcelParser._dataframe_to_workbook(df)
            except Exception as e_pandas:
                raise Exception(f"pandas.read_excel error: {e_pandas}, original openpyxl error: {e}")

    @staticmethod
    def _clean_dataframe(df: pd.DataFrame):
        def clean_string(s):
            if isinstance(s, str):
                return ILLEGAL_CHARACTERS_RE.sub(" ", s)
            return s
        return df.apply(lambda col: col.map(clean_string))

    @staticmethod
    def _dataframe_to_workbook(df):
        if isinstance(df, dict) and len(df) > 1:
            return RAGFlowExcelParser._dataframes_to_workbook(df)

        df = RAGFlowExcelParser._clean_dataframe(df)
        wb = Workbook()
        ws = wb.active
        ws.title = "Data"

        for col_num, column_name in enumerate(df.columns, 1):
            ws.cell(row=1, column=col_num, value=column_name)

        for row_num, row in enumerate(df.values, 2):
            for col_num, value in enumerate(row, 1):
                ws.cell(row=row_num, column=col_num, value=value)
        return wb

    @staticmethod
    def _dataframes_to_workbook(dfs: dict):
        wb = Workbook()
        default_sheet = wb.active
        wb.remove(default_sheet)

        for sheet_name, df in dfs.items():
            df = RAGFlowExcelParser._clean_dataframe(df)
            ws = wb.create_sheet(title=sheet_name)
            for col_num, column_name in enumerate(df.columns, 1):
                ws.cell(row=1, column=col_num, value=column_name)
            for row_num, row in enumerate(df.values, 2):
                for col_num, value in enumerate(row, 1):
                    ws.cell(row=row_num, column=col_num, value=value)
        return wb

    @staticmethod
    def _extract_images_from_worksheet(ws, sheetname=None):
        """
        Extract images from a worksheet and enrich them with vision-based descriptions.

        Returns: List[dict]
        """
        images = getattr(ws, "_images", [])
        if not images:
            return []

        raw_items = []

        for img in images:
            try:
                img_bytes = img._data()
                pil_img = Image.open(BytesIO(img_bytes)).convert("RGB")

                anchor = img.anchor
                if hasattr(anchor, "_from") and hasattr(anchor, "_to"):
                    r1, c1 = anchor._from.row + 1, anchor._from.col + 1
                    r2, c2 = anchor._to.row + 1, anchor._to.col + 1
                    if r1 == r2 and c1 == c2:
                        span = "single_cell"
                    else:
                        span = "multi_cell"
                else:
                    r1, c1 = anchor._from.row + 1, anchor._from.col + 1
                    r2, c2 = r1, c1
                    span = "single_cell"

                item = {
                    "sheet": sheetname or ws.title,
                    "image": pil_img,
                    "image_description": "",
                    "row_from": r1,
                    "col_from": c1,
                    "row_to": r2,
                    "col_to": c2,
                    "span_type": span,
                }
                raw_items.append(item)
            except Exception:
                continue
        return raw_items

    @staticmethod
    def _get_actual_row_count(ws):
        max_row = ws.max_row
        if not max_row:
            return 0
        if max_row <= 10000:
            return max_row

        max_col = min(ws.max_column or 1, 50)

        def row_has_data(row_idx):
            for col_idx in range(1, max_col + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                if cell.value is not None and str(cell.value).strip():
                    return True
            return False

        if not any(row_has_data(i) for i in range(1, min(101, max_row + 1))):
            return 0

        left, right = 1, max_row
        last_data_row = 1

        while left <= right:
            mid = (left + right) // 2
            found = False
            for r in range(mid, min(mid + 10, max_row + 1)):
                if row_has_data(r):
                    found = True
                    last_data_row = max(last_data_row, r)
                    break
            if found:
                left = mid + 1
            else:
                right = mid - 1

        for r in range(last_data_row, min(last_data_row + 500, max_row + 1)):
            if row_has_data(r):
                last_data_row = r

        return last_data_row

    @staticmethod
    def _get_rows_limited(ws):
        actual_rows = RAGFlowExcelParser._get_actual_row_count(ws)
        if actual_rows == 0:
            return []
        return list(ws.iter_rows(min_row=1, max_row=actual_rows))

    def html(self, fnm, chunk_rows=256):
        from html import escape

        file_like_object = BytesIO(fnm) if not isinstance(fnm, str) else fnm
        wb = RAGFlowExcelParser._load_excel_to_workbook(file_like_object)
        tb_chunks = []

        def _fmt(v):
            if v is None:
                return ""
            return str(v).strip()

        for sheetname in wb.sheetnames:
            ws = wb[sheetname]
            try:
                rows = RAGFlowExcelParser._get_rows_limited(ws)
            except Exception as e:
                logging.warning(f"Skip sheet '{sheetname}' due to rows access error: {e}")
                continue

            if not rows:
                continue

            tb_rows_0 = "<tr>"
            for t in list(rows[0]):
                tb_rows_0 += f"<th>{escape(_fmt(t.value))}</th>"
            tb_rows_0 += "</tr>"

            for chunk_i in range((len(rows) - 1) // chunk_rows + 1):
                tb = ""
                tb += f"<table><caption>{sheetname}</caption>"
                tb += tb_rows_0
                for r in list(rows[1 + chunk_i * chunk_rows : min(1 + (chunk_i + 1) * chunk_rows, len(rows))]):
                    tb += "<tr>"
                    for i, c in enumerate(r):
                        if c.value is None:
                            tb += "<td></td>"
                        else:
                            tb += f"<td>{escape(_fmt(c.value))}</td>"
                    tb += "</tr>"
                tb += "</table>\n"
                tb_chunks.append(tb)

        return tb_chunks

    def markdown(self, fnm):
        import pandas as pd

        file_like_object = BytesIO(fnm) if not isinstance(fnm, str) else fnm
        try:
            file_like_object.seek(0)
            df = pd.read_excel(file_like_object)
        except Exception as e:
            logging.warning(f"Parse spreadsheet error: {e}, trying to interpret as CSV file")
            file_like_object.seek(0)
            df = pd.read_csv(file_like_object, on_bad_lines='skip')
        df = df.replace(r"^\s*$", "", regex=True)
        return df.to_markdown(index=False)

    def __call__(self, fnm):
        file_like_object = BytesIO(fnm) if not isinstance(fnm, str) else fnm
        wb = RAGFlowExcelParser._load_excel_to_workbook(file_like_object)

        res = []
        for sheetname in wb.sheetnames:
            ws = wb[sheetname]
            try:
                rows = RAGFlowExcelParser._get_rows_limited(ws)
            except Exception as e:
                logging.warning(f"Skip sheet '{sheetname}' due to rows access error: {e}")
                continue
            if not rows:
                continue
            ti = list(rows[0])
            for r in list(rows[1:]):
                fields = []
                for i, c in enumerate(r):
                    if not c.value:
                        continue
                    t = str(ti[i].value) if i < len(ti) else ""
                    t += ("：" if t else "") + str(c.value)
                    fields.append(t)
                if not fields:
                    continue
                line = "; ".join(fields)
                if sheetname.lower().find("sheet") < 0:
                    line += " ——" + sheetname
                res.append(line)
        return res

    @staticmethod
    def row_number(fnm, binary):
        if fnm.split(".")[-1].lower().find("xls") >= 0:
            wb = RAGFlowExcelParser._load_excel_to_workbook(BytesIO(binary))
            total = 0

            for sheetname in wb.sheetnames:
                try:
                    ws = wb[sheetname]
                    total += RAGFlowExcelParser._get_actual_row_count(ws)
                except Exception as e:
                    logging.warning(f"Skip sheet '{sheetname}' due to rows access error: {e}")
                    continue
            return total

        if fnm.split(".")[-1].lower() in ["csv", "txt"]:
            encoding = find_codec(binary)
            txt = binary.decode(encoding, errors="ignore")
            return len(txt.split("\n"))
```

要点：

- **三级加载降级**：openpyxl（xlsx 首选）→ pandas 默认引擎 → calamine 引擎（老 xls / 特殊格式兜底）
- **CSV 通用兜底**：文件头不是 ZIP（PK 头）也不是 OLE（D0 CF）就当 CSV 处理
- **非法字符清理**：`ILLEGAL_CHARACTERS_RE` 剥掉控制字符（xlsx 规范不允许）
- **巨表优化**：`_get_actual_row_count` 二分找真实数据行数，避免 openpyxl 报 `max_row` 虚高（万行以上）
- **图片提取**：从 `ws._images` 提图 + 锚定坐标 + 跨 cell 类型（供 vision 模型后续描述）
- **三种输出**：
  - `__call__` → 每行 `列名：值; 列名：值 ——sheet名`（默认，走文本分块）
  - `html(chunk_rows=256)` → 分块 HTML `<table>`（走结构化通道）
  - `markdown(fnm)` → pandas `to_markdown`（走 markdown 通道）

### 2.3 PDF 表格 —— TSR + 4 角度旋转纠偏

PDF 表格由 `pdf_parser.py` 的以下方法协作完成：

```
_table_transformer_job(zoomin, auto_rotate=True)
  ├─ 检测每个 layout_type == "table" 的区域
  ├─ auto_rotate 开启时:测试 0° / 90° / 180° / 270° 四个角度
  │   ├─ 每个角度用 OCR 打分,挑分数最高的角度
  │   └─ 用旋转后图像跑 TSR
  └─ TSR 输出:cell 网格坐标 + 每 cell 分配 OCR 文字

_ocr_rotated_tables(ZM, table_layouts, tsr_results, tbcnt)
  ├─ 旋转后的表格图重新 OCR
  ├─ 用新 OCR 结果替换 self.boxes 里该表格区域的旧结果
  └─ 坐标从"旋转后"映射回"原图"

_extract_table_figure(need_image, zoomin, return_html, ...)
  ├─ 遍历 boxes,把 layout_type ∈ {table caption} 的框吸附到最近的表格上
  │   (走 TableStructureRecognizer.is_caption 判定)
  ├─ 抽出所有表格图像(need_image=True 时)
  └─ return_html=True 时输出 HTML 表格,否则输出结构化行文本
```

关键设计：

- **纯 CV 识别 cell 网格**：TSR 不依赖 OCR，直接从图像识别表格网格线，能处理无边框表、合并单元格
- **OCR 后置匹配**：OCR 文本框按坐标落入哪个 cell 就归属哪个 cell，避免"竖排文字被 OCR 打乱"
- **扫描件横板表格**：勘探报告里的观测系统参数表常是横板（把整页转 90° 印在竖版页面上），4 角度扫描能自动摆正
- **caption 吸附**：`is_caption(box)` 判定「表 1-1 观测系统参数」这类标题，绑到相邻表格上

---

## 3. 专业词典建设 & 内容

RAG 系统只提供了通用同义词（`rag/res/synonym.json`），中石化物探场景需要专门的行业词典。以下是词典的构成、匹配算法、落地入口。

### 3.1 词典文件

**路径**：[apps/server/src/common/chunk-tagger/dataset/sinopec-concept-dict.csv](apps/server/src/common/chunk-tagger/dataset/sinopec-concept-dict.csv)

**规模**：**2491 条术语**（截止 2026-07-02）

**格式**：CSV 两列

```
term,tags
AGC,数据处理
AGC增益,资料品质
ARCGIS联动设计,技术对策
BOOMBOX-III,接收设备;激发参数
CDP,数据处理
CDP线,数据处理
CDP网格,观测系统
CDP道集,数据处理
CGG地震数据处理系统,数据处理
CMP道集,数据处理
COG文件,数据处理;测量定位
COG误差,测量定位;激发参数
CPT静力触探,表层调查
CSP记录格式,接收设备;表层调查
Crossline,观测系统
C级网点,测量定位
DEM高程,工区情况
DMO速度偏移,数据处理
DSU-I数字检波器,接收设备
EPBP,施工组织;质量控制
ESQC,数据处理;质量控制
GNSS,测量定位
GNSSRTK,测量定位
GNSS控制网,测量定位
GNSS控制网点,测量定位
GNSS点之记,测量定位
GNSS静态观测,测量定位
GPS,测量定位
GPSRTK,测量定位
GPS控制网,测量定位
HSE,施工组织
HSE作业指导书,施工组织
HSE管理体系,施工组织
HSSE,施工组织
HSSE检查与整改,施工组织
I+II类剖面,质量控制;资料品质
INodal节点仪,接收设备
Inline,观测系统
I类剖面,质量控制;资料品质
KLSeis,数据处理;表层调查
KLseisⅡ,数据处理
KLseisⅡ质量监控,数据处理;质量控制
Klseis分析软件,数据处理
Mh,测量定位;质量控制
Ms,测量定位;质量控制
Mx,测量定位;质量控制
My,测量定位;质量控制
...
```

**约束**（`keyword-matcher.ts` 里注释明确）：

- `term` 字段不得含英文逗号（CSV 列分隔符冲突）
- 多个 `tags` 用 `;` 分隔，不用逗号

### 3.2 词典构成 —— 分类维度

按前 80 条样本归纳的分类维度：

| 分类 tag | 覆盖范围 | 样例 term |
| --- | --- | --- |
| `数据处理` | 处理软件、序列、指标 | `CDP`、`AGC`、`CGG地震数据处理系统`、`KLseisⅡ`、`DMO速度偏移` |
| `观测系统` | 网格/线号/道集布设 | `CDP网格`、`Crossline`、`Inline` |
| `测量定位` | GPS/GNSS/控制网 | `GNSSRTK`、`GPS控制网`、`C级网点`、`GNSS点之记` |
| `接收设备` | 检波器/记录仪 | `BOOMBOX-III`、`DSU-I数字检波器`、`INodal节点仪` |
| `表层调查` | 表层结构探测 | `CPT静力触探`、`KLSeis`、`CSP记录格式` |
| `激发参数` | 震源相关 | `COG误差`、`BOOMBOX-III` |
| `施工组织` | 项目管理 | `EPBP`、`HSE作业指导书`、`HSSE教育`、`HSE目标管理` |
| `质量控制` | 质检指标 | `ESQC`、`Mh` / `Ms` / `Mx` / `My`、`I类剖面` |
| `资料品质` | 成果质量 | `AGC增益`、`GNSS控制网报告`、`I+II类剖面` |
| `技术对策` | 设计方案 | `ARCGIS联动设计`、`GM联动设计` |
| `工区情况` | 地理/表层 | `DEM高程` |

**词典构成的观察**：

1. **大量英文/英中混合缩略语**（AGC、HSE、GNSS 类）—— 抓的是行业实际书写形态，不是纯中文
2. **组合词精细**（`GNSS` / `GNSSRTK` / `GNSS动态差分` / `GNSS接收机` / `GNSS控制测量报告` / `GNSS控制点` / `GNSS控制网` / `GNSS控制网点` …）—— 用 substring 命中即可覆盖变体
3. **多标签共现**（`BOOMBOX-III → 接收设备;激发参数`）—— 一条术语可标多个业务维度，检索侧可按 tag 过滤

### 3.3 关键词匹配算法

[apps/server/src/common/chunk-tagger/keyword-matcher.ts](apps/server/src/common/chunk-tagger/keyword-matcher.ts) 完整代码：

```ts
// cspell:disable-file
import { readFileSync } from 'node:fs';

export interface RegexPattern {
  name: string;
  pattern: string;
  tags?: string[];
}

export interface CompiledRegex {
  name: string;
  re: RegExp;
  tags: string[];
}

export interface KeywordMatcher {
  match(text: string): string[];
}

/** 解析概念字典 CSV(首行 header,`term,tags`;多 tag 用 `;` 分隔) */
export function parseDict(csv: string): Map<string, string[]> {
  const lines = csv.split('\n').slice(1).filter(Boolean);
  const map = new Map<string, string[]>();
  for (const line of lines) {
    // 约束: term 字段不得含英文逗号;多 tag 用 `;` 分隔(不用逗号)。
    const [term, tagStr] = line.split(',');
    if (!term || !tagStr) continue;
    map.set(
      term.trim(),
      tagStr
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean),
    );
  }
  return map;
}

export function loadDict(path: string): Map<string, string[]> {
  return parseDict(readFileSync(path, 'utf8'));
}

/** 解析正则目录 JSON,预编译为全局正则 */
export function parseRegexCatalog(json: string): CompiledRegex[] {
  const arr = JSON.parse(json) as RegexPattern[];
  return arr.map((r) => ({
    name: r.name,
    re: new RegExp(r.pattern, 'g'),
    tags: r.tags ?? [],
  }));
}

export function loadRegex(path: string): CompiledRegex[] {
  return parseRegexCatalog(readFileSync(path, 'utf8'));
}

/** 对一段 chunk 文本匹配关键词(概念字典 substring + 正则 matchAll),cap maxKeywords */
export function matchChunk(
  text: string,
  dict: Map<string, string[]>,
  regexes: CompiledRegex[],
  maxKeywords: number,
): string[] {
  const keywords = new Set<string>();
  const tags = new Set<string>();
  for (const [term, ts] of dict) {
    if (text.includes(term)) {
      keywords.add(term);
      for (const t of ts) tags.add(t);
    }
  }
  for (const { re, tags: rTags } of regexes) {
    const matches = [...text.matchAll(re)].slice(0, 8);
    if (matches.length === 0) continue;
    for (const m of matches) keywords.add(m[0].trim());
    for (const t of rTags) tags.add(t);
  }
  return [...keywords, ...tags].slice(0, maxKeywords);
}

/** 从 doc 文件名推断归属项目(作为强制 important_keyword;未命中返回 []) */
export function inferProjectKeywords(docName: string): string[] {
  const rules: Array<[RegExp, string[]]> = [
    [/顺8井北/, ['顺8井北', '顺8井北三维']],
    [/顺中二期|顺中2期/, ['顺中二期', '顺中2期']],
    [/顺中(?!二期)/, ['顺中', '顺中三维', '顺中一期']],
    [/顺北42井东?/, ['顺北42井东', '顺北42']],
    [/顺北43井东?/, ['顺北43井东', '顺北43']],
    [/顺北21井区?/, ['顺北21', '顺北21井区']],
    [/帅垛西/, ['帅垛西', '帅垛西三维']],
    [/史家堡|草舍/, ['史家堡', '草舍', '史家堡-草舍']],
    [/永安/, ['永安', '永安三维']],
    [/宿南/, ['宿南二维', '宿南']],
    [/张集东/, ['张集东', '张集东三维']],
    [/方山新井/, ['方山新井']],
    [/中21井区?/, ['中21井区', '中21']],
    [/页岩气|彭水/, ['页岩气', '彭水']],
  ];
  for (const [re, kws] of rules) {
    if (re.test(docName)) return kws;
  }
  return [];
}

/** 从字典/正则文件构造一个有状态的 matcher(供 DI 注入) */
export function createKeywordMatcher(
  dictPath: string,
  regexPath: string,
  maxKeywords: number,
): KeywordMatcher {
  const dict = loadDict(dictPath);
  const regexes = loadRegex(regexPath);
  return {
    match: (text: string) => matchChunk(text, dict, regexes, maxKeywords),
  };
}
```

要点：

- **substring 命中**：直接 `text.includes(term)`，命中即计入 keywords，并把该 term 的所有 tags 计入 tags
- **正则辅助目录**：`regexPath` 指向另一份 JSON（`{name, pattern, tags}[]`），预编译为全局正则；每条规则最多取前 8 个 match（防单一模式刷屏）
- **输出结构**：`[keywords..., tags...].slice(0, maxKeywords)` —— 关键词与标签合并后统一截断

### 3.4 项目名字典 —— 实体锚定

`inferProjectKeywords`（同文件）是词典的第二半：**从文件名推项目名当作强制注入的重要关键词**。

**为什么需要**：不同项目的文档里都会出现"顺北"这类关键词但指代不同区块（顺北 42 井 vs 顺北 43 井）。检索侧只按语义 embedding 匹配会跨项目串台，把 A 项目的文档搜到 B 项目问题里。

**做法**：从上传时的文件名匹配项目名规则，把项目名注入 chunk 的 `important_keywords`。这样 BM25 检索时会强命中同项目文档、弱命中他项目文档。

生产环境验证：这一层显著改善了跨项目问答的准确率（例：Q14「顺北42」相关问题的干扰完全消除、日期段进 rank3）。

### 3.5 词典落地 —— ChunkTaggerService

[apps/server/src/common/chunk-tagger/chunk-tagger.service.ts](apps/server/src/common/chunk-tagger/chunk-tagger.service.ts) 完整代码：

```ts
import type { KeywordMatcher } from './keyword-matcher';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { RagflowService } from '@/common/ragflow/ragflow.service';

import {
  CONCURRENCY,
  KEYWORD_MATCHER,
  MAX_KEYWORDS,
} from './chunk-tagger.constants';
import { inferProjectKeywords } from './keyword-matcher';

interface RagflowChunk {
  content?: string;
  id: string;
}

interface ListChunksResponse {
  chunks?: RagflowChunk[];
  total?: number;
}

export interface TagDocumentResult {
  empty: number;
  failed: number;
  totalChunks: number;
  updated: number;
}

const PAGE_SIZE = 100;

@Injectable()
export class ChunkTaggerService {
  private readonly logger = new Logger(ChunkTaggerService.name);

  constructor(
    private readonly ragflow: RagflowService,
    @Inject(KEYWORD_MATCHER) private readonly matcher: KeywordMatcher,
  ) {}

  /**
   * 给单个 doc 的所有 chunk 写入 important_keywords。全自动与回填共用。
   *
   * 单个 chunk 的 PUT 失败会被计入 `failed` 并继续处理其余 chunk —— 本方法**不会**因
   * 个别失败而 reject。调用方应检查返回的 `failed` 字段判断是否存在部分失败
   * (例如 failed 等于 totalChunks 往往意味着鉴权/网络等系统性故障)。
   * 注意:列 chunk 的 GET 失败仍会向上 reject(无法继续)。
   */
  async tagDocument(
    datasetId: string,
    docId: string,
    docName: string,
  ): Promise<TagDocumentResult> {
    const chunks = await this.listChunks(datasetId, docId);
    const projectKws = inferProjectKeywords(docName);
    const result: TagDocumentResult = {
      totalChunks: chunks.length,
      updated: 0,
      empty: 0,
      failed: 0,
    };

    await this.processBatch(chunks, CONCURRENCY, async (chunk) => {
      const matched = this.matcher.match(chunk.content ?? '');
      const kws = [...new Set([...projectKws, ...matched])].slice(
        0,
        MAX_KEYWORDS,
      );
      if (kws.length === 0) {
        result.empty++;
        return;
      }
      try {
        await this.ragflow.request(
          'PUT',
          `/api/v1/datasets/${datasetId}/documents/${docId}/chunks/${chunk.id}`,
          { important_keywords: kws },
        );
        result.updated++;
      } catch (error) {
        result.failed++;
        this.logger.warn(
          `PUT chunk ${chunk.id} 失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });

    this.logger.log(
      `tagDocument ${docName}: total=${result.totalChunks} updated=${result.updated} empty=${result.empty} failed=${result.failed}`,
    );
    return result;
  }

  private async listChunks(
    datasetId: string,
    docId: string,
  ): Promise<RagflowChunk[]> {
    const all: RagflowChunk[] = [];
    const MAX_PAGES = 1000;
    let page = 1;
    for (; page <= MAX_PAGES; page++) {
      const data = await this.ragflow.request<ListChunksResponse>(
        'GET',
        `/api/v1/datasets/${datasetId}/documents/${docId}/chunks`,
        { page, page_size: PAGE_SIZE },
      );
      const chunks = data.chunks ?? [];
      all.push(...chunks);
      if (
        chunks.length < PAGE_SIZE ||
        (data.total !== undefined && all.length >= data.total)
      ) {
        return all;
      }
    }
    this.logger.warn(
      `listChunks 命中 ${MAX_PAGES} 页安全上限 (doc ${docId}),仅收集 ${all.length} 个 chunk,可能未覆盖全部`,
    );
    return all;
  }

  private async processBatch<T>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<void>,
  ): Promise<void> {
    for (let i = 0; i < items.length; i += concurrency) {
      await Promise.all(
        items.slice(i, i + concurrency).map((item) => fn(item)),
      );
    }
  }
}
```

落地流程：

1. **拉取 chunk**：`listChunks` 分页拉（100/页，安全上限 1000 页），把该文档所有已切好的 chunk 收齐
2. **计算关键词**：对每个 chunk `matcher.match(content)`（词典命中 + 正则匹配）+ `inferProjectKeywords(docName)`（项目名注入），并集去重后截断到 `MAX_KEYWORDS`
3. **写回**：`PUT /api/v1/datasets/{ds}/documents/{doc}/chunks/{ck}` 更新 `important_keywords` 字段
4. **BM25 加权**：检索接口按 `important_keywords` 加权命中项，词典命中的关键词在召回排序里显著加分

触发方式：

- **自动**：文档解析 DONE 后，`ChunkTagQueueService` 后台轮询入队 → 逐 doc 打 tag
- **手动回填**：admin 调用 `POST /knowledge-base/{id}/backfill-keywords` 给存量库补打

---

## 4. 分块方式代码 & 文字解释

### 4.1 默认参数配置

[apps/server/src/common/defaults/knowledge-base.defaults.ts](apps/server/src/common/defaults/knowledge-base.defaults.ts) 完整代码：

```ts
/**
 * sinopec-kb 默认知识库 parser_config（中石化勘探技术报告 docx → naive 切片场景）。
 *
 * 让新机器部署时新建 KB 自动启用与 prod KB 一致的解析参数：
 * - layout_recognize=DeepDOC 比 Plain Text 多保留表格结构
 * - chunk_token_num=512 / delimiter='\n' 是 PR #18 实验实测最佳点
 * - raptor 与 graphrag 默认 OFF：这俩在内存紧张机器（< 32 GB）会触发 OOM。
 *   prod 上是手工开启的，新机器要不要开取决于内存规格；想全开请通过 env
 *   `KB_DEFAULT_RAPTOR=1` / `KB_DEFAULT_GRAPHRAG=1` 显式打开。
 */
import process from 'node:process';

const RAPTOR_ON = process.env.KB_DEFAULT_RAPTOR === '1';
const GRAPHRAG_ON = process.env.KB_DEFAULT_GRAPHRAG === '1';

export const DEFAULT_KB_PARSER_CONFIG = {
  layout_recognize: 'DeepDOC',
  chunk_token_num: 512,
  delimiter: '\n',
  raptor: {
    use_raptor: RAPTOR_ON,
    prompt:
      'Please summarize the following paragraphs. Be careful with the numbers, do not make things up. Paragraphs as following:\n      {cluster_content}\nThe above is the content you need to summarize.',
    max_token: 256,
    threshold: 0.1,
    max_cluster: 64,
    random_seed: 0,
  },
  graphrag: {
    use_graphrag: GRAPHRAG_ON,
    entity_types: ['organization', 'person', 'geo', 'event', 'category'],
    method: 'light',
  },
} as const;
```

参数说明：

- `layout_recognize: 'DeepDOC'` —— 保留表格结构（`Plain Text` 只走 OCR 拼文本）
- `chunk_token_num: 512` —— 单 chunk 目标 token 数，PR #18 实验实测最佳（128 太碎、1024 过粗）
- `delimiter: '\n'` —— 纯换行分段；不加中文标点是为了不在句中断
- `raptor` / `graphrag` —— 摘要聚类 / 实体图谱，可选增强，小内存机器默认关闭

### 4.2 KB 创建时下发参数

[apps/server/src/modules/knowledge-base/knowledge-base.service.ts](apps/server/src/modules/knowledge-base/knowledge-base.service.ts) 创建接口关键片段：

```ts
async create(user: ActiveUserData, dto: CreateKnowledgeBaseDto) {
  const userData = await this.prisma.client.user.findUniqueOrThrow({
    where: { id: user.sub },
    include: { dept: true },
  });

  if (
    dto.permission === 'team' &&
    !userData.isAdmin &&
    !userData.isDeptAdmin
  ) {
    throw new ForbiddenException('仅部门主管可创建部门公开知识库');
  }

  const parserConfig = {
    ...DEFAULT_KB_PARSER_CONFIG,
    ...dto.parserConfig,
  };
  const ragflowData = await this.ragflow.request<{ id: string }>(
    'POST',
    '/api/v1/datasets',
    {
      name: dto.name,
      embedding_model: dto.embeddingModel,
      chunk_method: dto.chunkMethod,       // 默认 'naive';还可选 book/paper/qa/table/law
      parser_config: parserConfig,
      description: dto.description,
      permission: dto.permission,
      avatar: dto.avatar,
    },
  );

  try {
    return await this.prisma.client.knowledgeBase.create({
      data: {
        name: dto.name,
        avatar: dto.avatar,
        description: dto.description,
        embeddingModel: dto.embeddingModel as string,
        permission: dto.permission,
        chunkMethod: dto.chunkMethod,
        parserConfig: dto.parserConfig,
        order: dto.order,
        datasetId: ragflowData.id,
        deptId: dto.permission === 'team' ? userData.deptId : null,
        createBy: user.username,
      },
    });
  } catch (error) {
    this.logger.error(
      `DB 写入失败，回滚 RAGFlow 数据集: ${ragflowData.id}`,
      error,
    );
    try {
      await this.ragflow.request('DELETE', '/api/v1/datasets', {
        ids: [ragflowData.id],
      });
      this.logger.log(`RAGFlow 数据集 ${ragflowData.id} 已成功回滚`);
    } catch (rollbackError) {
      this.logger.error(
        `RAGFlow 回滚失败，孤儿数据集: ${ragflowData.id}`,
        rollbackError,
      );
    }
    throw error;
  }
}
```

要点：

- **参数继承**：`DEFAULT_KB_PARSER_CONFIG` 作为兜底，用户传入 `dto.parserConfig` 覆盖字段
- **两步创建**：先建远端 dataset 得 `datasetId`，再写本地 DB；DB 失败自动回滚远端 dataset（防孤儿）
- **权限校验**：`team` 权限的 KB 只有部门管理员/系统管理员能建

### 4.3 分块主入口 —— chunk() 分派与三大分支

[rag/app/naive.py](ragflow-src/rag/app/naive.py) 主入口 `chunk()`（737-1076 行）关键段：

```python
def chunk(filename, binary=None, from_page=0, to_page=100000, lang="Chinese", callback=None, **kwargs):
    """
    Supported file formats are docx, pdf, excel, txt.
    This method apply the naive ways to chunk files.
    Successive text will be sliced into pieces using 'delimiter'.
    Next, these successive pieces are merge into chunks whose token number is no more than 'Max token number'.
    """
    urls = set()
    url_res = []

    is_english = lang.lower() == "english"
    parser_config = kwargs.get("parser_config", {
        "chunk_token_num": 512,
        "delimiter": "\n!?。；！？",
        "layout_recognize": "DeepDOC",
        "analyze_hyperlink": True,
    })

    # 处理子分隔符 (children_delimiter): 用户传入的分隔符里 `xxx` 反引号包裹的走硬切
    child_deli = (parser_config.get("children_delimiter") or "").encode("utf-8").decode("unicode_escape").encode("latin1").decode("utf-8")
    cust_child_deli = re.findall(r"`([^`]+)`", child_deli)
    child_deli = "|".join(re.sub(r"`([^`]+)`", "", child_deli))
    if cust_child_deli:
        cust_child_deli = sorted(set(cust_child_deli), key=lambda x: -len(x))
        cust_child_deli = "|".join(re.escape(t) for t in cust_child_deli if t)
        child_deli += cust_child_deli

    is_markdown = False
    table_context_size = max(0, int(parser_config.get("table_context_size", 0) or 0))
    image_context_size = max(0, int(parser_config.get("image_context_size", 0) or 0))

    doc = {"docnm_kwd": filename, "title_tks": rag_tokenizer.tokenize(re.sub(r"\.[a-zA-Z]+$", "", filename))}
    doc["title_sm_tks"] = rag_tokenizer.fine_grained_tokenize(doc["title_tks"])
    res = []
    pdf_parser = None
    section_images = None

    # 处理内嵌文件(如 docx 里嵌的 xlsx)
    is_root = kwargs.get("is_root", True)
    embed_res = []
    if is_root:
        embeds = []
        if binary is not None:
            embeds = extract_embed_file(binary)
        else:
            raise Exception("Embedding extraction from file path is not supported.")

        for embed_filename, embed_bytes in embeds:
            try:
                sub_res = chunk(embed_filename, binary=embed_bytes, lang=lang, callback=callback, is_root=False, **kwargs) or []
                embed_res.extend(sub_res)
            except Exception as e:
                error_msg = f"Failed to chunk embed {embed_filename}: {e}"
                logging.error(error_msg)
                if callback:
                    callback(0.05, error_msg)
                continue

    # ─── 分支 1: .docx ───────────────────────────────
    if re.search(r"\.docx$", filename, re.IGNORECASE):
        callback(0.1, "Start to parse.")
        if parser_config.get("analyze_hyperlink", False) and is_root:
            urls = extract_links_from_docx(binary)
            for index, url in enumerate(urls):
                html_bytes, metadata = extract_html(url)
                if not html_bytes:
                    continue
                try:
                    sub_url_res = chunk(url, html_bytes, callback=callback, lang=lang, is_root=False, **kwargs)
                except Exception as e:
                    logging.info(f"Failed to chunk url in registered file type {url}: {e}")
                    sub_url_res = chunk(f"{index}.html", html_bytes, callback=callback, lang=lang, is_root=False, **kwargs)
                url_res.extend(sub_url_res)

        # docx 里 word/NULL 关系修复 (python-openxml issues#1105)
        _SerializedRelationships.load_from_xml = load_from_xml_v2

        # sections = (text, image, tables)
        sections = Docx()(filename, binary)

        # chunks list[dict]   images list - index of image chunk in chunks
        chunks, images = naive_merge_docx(
            sections,
            int(parser_config.get("chunk_token_num", 128)),
            parser_config.get("delimiter", "\n!?。；！？"),
            table_context_size,
            image_context_size,
        )

        # 图片走 vision 模型生成描述
        vision_figure_parser_docx_wrapper_naive(chunks=chunks, idx_lst=images, callback=callback, **kwargs)

        callback(0.8, "Finish parsing.")
        st = timer()

        res.extend(doc_tokenize_chunks_with_images(chunks, doc, is_english, child_delimiters_pattern=child_deli))
        logging.info("naive_merge({}): {}".format(filename, timer() - st))
        res.extend(embed_res)
        res.extend(url_res)
        return res

    # ─── 分支 2: .pdf ────────────────────────────────
    elif re.search(r"\.pdf$", filename, re.IGNORECASE):
        layout_recognizer, parser_model_name = normalize_layout_recognizer(
            parser_config.get("layout_recognize", "DeepDOC")
        )

        if parser_config.get("analyze_hyperlink", False) and is_root:
            urls = extract_links_from_pdf(binary)

        if isinstance(layout_recognizer, bool):
            layout_recognizer = "DeepDOC" if layout_recognizer else "Plain Text"

        # 按 layout_recognize 选 parser:
        # by_deepdoc / by_mineru / by_docling / by_paddleocr / by_tcadp / by_plaintext
        name = layout_recognizer.strip().lower()
        parser = PARSERS.get(name, by_plaintext)
        callback(0.1, "Start to parse.")

        sections, tables, pdf_parser = parser(
            filename=filename,
            binary=binary,
            from_page=from_page,
            to_page=to_page,
            lang=lang,
            callback=callback,
            layout_recognizer=layout_recognizer,
            mineru_llm_name=parser_model_name,
            paddleocr_llm_name=parser_model_name,
            **kwargs,
        )

        if not sections and not tables:
            return []

        # 表格/图片上下文尺寸配置:把周围文字段一并绑进表格 chunk
        if table_context_size or image_context_size:
            tables = append_context2table_image4pdf(sections, tables, image_context_size)

        # 结构化 parser(tcadp/docling/mineru/paddleocr)已经切好片,不再走文本合并
        if name in ["tcadp", "docling", "mineru", "paddleocr"]:
            parser_config["chunk_token_num"] = 0

        # 表格单独走 tokenize_table,不与正文合并
        res = tokenize_table(tables, doc, is_english)
        callback(0.8, "Finish parsing.")

    # ─── 分支 3: .csv / .xlsx / .xls ─────────────────
    elif re.search(r"\.(csv|xlsx?)$", filename, re.IGNORECASE):
        callback(0.1, "Start to parse.")

        layout_recognizer = parser_config.get("layout_recognize", "DeepDOC")
        if layout_recognizer == "TCADP Parser":
            # 腾讯云 TCADP 处理(结构化服务,一步到位)
            table_result_type = parser_config.get("table_result_type", "1")
            markdown_image_response_type = parser_config.get("markdown_image_response_type", "1")
            tcadp_parser = TCADPParser(
                table_result_type=table_result_type,
                markdown_image_response_type=markdown_image_response_type,
            )
            if not tcadp_parser.check_installation():
                callback(-1, "TCADP parser not available. Please check Tencent Cloud API configuration.")
                return res

            file_type = "XLSX" if re.search(r"\.xlsx?$", filename, re.IGNORECASE) else "CSV"
            sections, tables = tcadp_parser.parse_pdf(
                filepath=filename, binary=binary, callback=callback,
                output_dir=os.environ.get("TCADP_OUTPUT_DIR", ""), file_type=file_type,
            )
            parser_config["chunk_token_num"] = 0
            res = tokenize_table(tables, doc, is_english)
            callback(0.8, "Finish parsing.")
        else:
            # 默认路径:走 ExcelParser
            excel_parser = ExcelParser()
            if parser_config.get("html4excel"):
                # HTML 结构化路径:每 12 行一 chunk
                sections = [(_, "") for _ in excel_parser.html(binary, 12) if _]
                parser_config["chunk_token_num"] = 0
            else:
                # 默认路径:每行一 chunk(下方 chunk_token_num=0 触发不合并)
                sections = [(_, "") for _ in excel_parser(binary) if _]

    # ─── 分支 4: .txt / 代码文件 ──────────────────────
    elif re.search(r"\.(txt|py|js|java|c|cpp|h|php|go|ts|sh|cs|kt|sql)$", filename, re.IGNORECASE):
        callback(0.1, "Start to parse.")
        sections = TxtParser()(
            filename, binary,
            parser_config.get("chunk_token_num", 128),
            parser_config.get("delimiter", "\n!?;。；！？"),
        )
        callback(0.8, "Finish parsing.")

    # ─── 分支 5: .md / .markdown / .mdx ──────────────
    # (docx 经 pandoc 预处理后走这里)
    elif re.search(r"\.(md|markdown|mdx)$", filename, re.IGNORECASE):
        callback(0.1, "Start to parse.")
        markdown_parser = Markdown(int(parser_config.get("chunk_token_num", 128)))
        sections, tables, section_images = markdown_parser(
            filename, binary,
            separate_tables=False,
            delimiter=parser_config.get("delimiter", "\n!?;。；！？"),
            return_section_images=True,
        )

        is_markdown = True

        # 图片走 vision 模型描述
        try:
            vision_model = LLMBundle(kwargs["tenant_id"], LLMType.IMAGE2TEXT)
            callback(0.2, "Visual model detected. Attempting to enhance figure extraction...")
        except Exception as e:
            logging.warning(f"Failed to detect figure extraction: {e}")
            vision_model = None

        if vision_model:
            for idx, (section_text, _) in enumerate(sections):
                images = []
                if section_images and len(section_images) > idx and section_images[idx] is not None:
                    images.append(section_images[idx])
                if images and len(images) > 0:
                    combined_image = reduce(concat_img, images) if len(images) > 1 else images[0]
                    if section_images:
                        section_images[idx] = combined_image
                    else:
                        section_images = [None] * len(sections)
                        section_images[idx] = combined_image
                    markdown_vision_parser = VisionFigureParser(
                        vision_model=vision_model,
                        figures_data=[((combined_image, ["markdown image"]), [(0, 0, 0, 0, 0)])],
                        **kwargs,
                    )
                    boosted_figures = markdown_vision_parser(callback=callback)
                    sections[idx] = (
                        section_text + "\n\n" + "\n\n".join([fig[0][1] for fig in boosted_figures]),
                        sections[idx][1],
                    )

        if parser_config.get("hyperlink_urls", False) and is_root:
            for idx, (section_text, _) in enumerate(sections):
                soup = markdown_parser.md_to_html(section_text)
                hyperlink_urls = markdown_parser.get_hyperlink_urls(soup)
                urls.update(hyperlink_urls)
        res = tokenize_table(tables, doc, is_english)
        callback(0.8, "Finish parsing.")

    # ─── 分支 6: .htm / .html ────────────────────────
    elif re.search(r"\.(htm|html)$", filename, re.IGNORECASE):
        callback(0.1, "Start to parse.")
        chunk_token_num = int(parser_config.get("chunk_token_num", 128))
        sections = HtmlParser()(filename, binary, chunk_token_num)
        sections = [(_, "") for _ in sections if _]
        callback(0.8, "Finish parsing.")

    # ─── 分支 7: .json / .jsonl ──────────────────────
    elif re.search(r"\.(json|jsonl|ldjson)$", filename, re.IGNORECASE):
        callback(0.1, "Start to parse.")
        chunk_token_num = int(parser_config.get("chunk_token_num", 128))
        sections = JsonParser(chunk_token_num)(binary)
        sections = [(_, "") for _ in sections if _]
        callback(0.8, "Finish parsing.")

    # ─── 分支 8: 老式 .doc ───────────────────────────
    elif re.search(r"\.doc$", filename, re.IGNORECASE):
        callback(0.1, "Start to parse.")
        try:
            from tika import parser as tika_parser
        except Exception as e:
            callback(0.8, f"tika not available: {e}. Unsupported .doc parsing.")
            return []

        binary = BytesIO(binary)
        doc_parsed = tika_parser.from_buffer(binary)
        if doc_parsed.get("content", None) is not None:
            sections = doc_parsed["content"].split("\n")
            sections = [(_, "") for _ in sections if _]
            callback(0.8, "Finish parsing.")
        else:
            return []
    else:
        raise NotImplementedError("file type not supported yet(pdf, xlsx, doc, docx, txt supported)")

    # ─── 通用分块合并 ───────────────────────────────
    st = timer()
    overlapped_percent = normalize_overlapped_percent(parser_config.get("overlapped_percent", 0))

    if is_markdown:
        # markdown 走单独的贪心合并(与 naive_merge 不同,不带位置标签)
        merged_chunks = []
        merged_images = []
        chunk_limit = max(0, int(parser_config.get("chunk_token_num", 128)))

        current_text = ""
        current_tokens = 0
        current_image = None

        for idx, sec in enumerate(sections):
            text = sec[0] if isinstance(sec, tuple) else sec
            sec_tokens = num_tokens_from_string(text)
            sec_image = section_images[idx] if section_images and idx < len(section_images) else None

            if current_text and current_tokens + sec_tokens > chunk_limit:
                merged_chunks.append(current_text)
                merged_images.append(current_image)
                # overlap:上一个 chunk 尾部保留 overlapped_percent 进下一 chunk
                overlap_part = ""
                if overlapped_percent > 0:
                    overlap_len = int(len(current_text) * overlapped_percent / 100)
                    if overlap_len > 0:
                        overlap_part = current_text[-overlap_len:]
                current_text = overlap_part
                current_tokens = num_tokens_from_string(current_text)
                current_image = current_image if overlap_part else None

            if current_text:
                current_text += "\n" + text
            else:
                current_text = text
            current_tokens += sec_tokens

            if sec_image:
                current_image = concat_img(current_image, sec_image) if current_image else sec_image

        if current_text:
            merged_chunks.append(current_text)
            merged_images.append(current_image)

        chunks = merged_chunks
        has_images = merged_images and any(img is not None for img in merged_images)

        if has_images:
            res.extend(tokenize_chunks_with_images(chunks, doc, is_english, merged_images, child_delimiters_pattern=child_deli))
        else:
            res.extend(tokenize_chunks(chunks, doc, is_english, pdf_parser, child_delimiters_pattern=child_deli))
    else:
        # 非 markdown:走 naive_merge / naive_merge_with_images
        if section_images:
            if all(image is None for image in section_images):
                section_images = None

        if section_images:
            chunks, images = naive_merge_with_images(
                sections, section_images,
                int(parser_config.get("chunk_token_num", 128)),
                parser_config.get("delimiter", "\n!?。；！？"),
                overlapped_percent,
            )
            res.extend(tokenize_chunks_with_images(chunks, doc, is_english, images, child_delimiters_pattern=child_deli))
        else:
            chunks = naive_merge(
                sections,
                int(parser_config.get("chunk_token_num", 128)),
                parser_config.get("delimiter", "\n!?。；！？"),
                overlapped_percent,
            )
            res.extend(tokenize_chunks(chunks, doc, is_english, pdf_parser, child_delimiters_pattern=child_deli))

    # 分析出的外链(超链接)递归 chunk
    if urls and parser_config.get("analyze_hyperlink", False) and is_root:
        for index, url in enumerate(urls):
            html_bytes, metadata = extract_html(url)
            if not html_bytes:
                continue
            try:
                sub_url_res = chunk(url, html_bytes, callback=callback, lang=lang, is_root=False, **kwargs)
            except Exception as e:
                logging.info(f"Failed to chunk url in registered file type {url}: {e}")
                sub_url_res = chunk(f"{index}.html", html_bytes, callback=callback, lang=lang, is_root=False, **kwargs)
            url_res.extend(sub_url_res)

    logging.info("naive_merge({}): {}".format(filename, timer() - st))

    if embed_res:
        res.extend(embed_res)
    if url_res:
        res.extend(url_res)
    return res
```

分支速览表：

| 后缀 | 解析器 | 是否走 `naive_merge` |
| --- | --- | --- |
| `.docx` | `Docx()` → `naive_merge_docx` | 专用 docx 版 |
| `.pdf` | `by_deepdoc` / `by_mineru` / `by_docling` / `by_paddleocr` / `by_tcadp` / `by_plaintext` | DeepDOC / plaintext 走 `naive_merge`；其他结构化 parser 已切好片，不再合并 |
| `.xlsx` / `.csv` | `ExcelParser()` 或 `TCADPParser` | 默认每行一 chunk，不合并（`chunk_token_num=0`） |
| `.md` / `.markdown` | `Markdown()` | 走独立的 markdown 贪心合并（保留 section 结构） |
| `.txt` / 代码 | `TxtParser()` | `naive_merge` |
| `.html` | `HtmlParser()` | `naive_merge` |
| `.json` / `.jsonl` | `JsonParser()` | `naive_merge` |
| `.doc` | tika 解析 | `naive_merge`（按 `\n` 切段） |

### 4.4 核心合并算法 —— naive_merge

[rag/nlp/**init**.py](ragflow-src/rag/nlp/__init__.py) `naive_merge`（1070-1126 行）完整代码：

```python
def naive_merge(sections: str | list, chunk_token_num=128, delimiter="\n。；！？", overlapped_percent=0):
    from deepdoc.parser.pdf_parser import RAGFlowPdfParser
    if not sections:
        return []
    if isinstance(sections, str):
        sections = [sections]
    if isinstance(sections[0], str):
        sections = [(s, "") for s in sections]
    cks = [""]
    tk_nums = [0]

    def add_chunk(t, pos):
        nonlocal cks, tk_nums, delimiter
        tnum = num_tokens_from_string(t)
        if not pos:
            pos = ""
        if tnum < 8:
            pos = ""
        # Ensure that the length of the merged chunk does not exceed chunk_token_num
        if cks[-1] == "" or tk_nums[-1] > chunk_token_num * (100 - overlapped_percent) / 100.:
            if cks:
                overlapped = RAGFlowPdfParser.remove_tag(cks[-1])
                t = overlapped[int(len(overlapped) * (100 - overlapped_percent) / 100.):] + t
            if t.find(pos) < 0:
                t += pos
            cks.append(t)
            tk_nums.append(tnum)
        else:
            if cks[-1].find(pos) < 0:
                t += pos
            cks[-1] += t
            tk_nums[-1] += tnum

    custom_delimiters = [m.group(1) for m in re.finditer(r"`([^`]+)`", delimiter)]
    has_custom = bool(custom_delimiters)
    if has_custom:
        custom_pattern = "|".join(re.escape(t) for t in sorted(set(custom_delimiters), key=len, reverse=True))
        cks, tk_nums = [], []
        for sec, pos in sections:
            split_sec = re.split(r"(%s)" % custom_pattern, sec, flags=re.DOTALL)
            for sub_sec in split_sec:
                if re.fullmatch(custom_pattern, sub_sec or ""):
                    continue
                text = "\n" + sub_sec
                local_pos = pos
                if num_tokens_from_string(text) < 8:
                    local_pos = ""
                if local_pos and text.find(local_pos) < 0:
                    text += local_pos
                cks.append(text)
                tk_nums.append(num_tokens_from_string(text))
        return cks

    for sec, pos in sections:
        add_chunk("\n" + sec, pos)

    return cks
```

带图片版 `naive_merge_with_images`（1129-1198 行）完整代码：

```python
def naive_merge_with_images(texts, images, chunk_token_num=128, delimiter="\n。；！？", overlapped_percent=0):
    from deepdoc.parser.pdf_parser import RAGFlowPdfParser
    if not texts or len(texts) != len(images):
        return [], []
    cks = [""]
    result_images = [None]
    tk_nums = [0]

    def add_chunk(t, image, pos=""):
        nonlocal cks, result_images, tk_nums, delimiter
        tnum = num_tokens_from_string(t)
        if not pos:
            pos = ""
        if tnum < 8:
            pos = ""
        if cks[-1] == "" or tk_nums[-1] > chunk_token_num * (100 - overlapped_percent) / 100.:
            if cks:
                overlapped = RAGFlowPdfParser.remove_tag(cks[-1])
                t = overlapped[int(len(overlapped) * (100 - overlapped_percent) / 100.):] + t
            if t.find(pos) < 0:
                t += pos
            cks.append(t)
            result_images.append(image)
            tk_nums.append(tnum)
        else:
            if cks[-1].find(pos) < 0:
                t += pos
            cks[-1] += t
            if result_images[-1] is None:
                result_images[-1] = image
            else:
                result_images[-1] = concat_img(result_images[-1], image)
            tk_nums[-1] += tnum

    custom_delimiters = [m.group(1) for m in re.finditer(r"`([^`]+)`", delimiter)]
    has_custom = bool(custom_delimiters)
    if has_custom:
        custom_pattern = "|".join(re.escape(t) for t in sorted(set(custom_delimiters), key=len, reverse=True))
        cks, result_images, tk_nums = [], [], []
        for text, image in zip(texts, images):
            text_str = text[0] if isinstance(text, tuple) else text
            if text_str is None:
                text_str = ""
            text_pos = text[1] if isinstance(text, tuple) and len(text) > 1 else ""
            split_sec = re.split(r"(%s)" % custom_pattern, text_str)
            for sub_sec in split_sec:
                if re.fullmatch(custom_pattern, sub_sec or ""):
                    continue
                text_seg = "\n" + sub_sec
                local_pos = text_pos
                if num_tokens_from_string(text_seg) < 8:
                    local_pos = ""
                if local_pos and text_seg.find(local_pos) < 0:
                    text_seg += local_pos
                cks.append(text_seg)
                result_images.append(image)
                tk_nums.append(num_tokens_from_string(text_seg))
        return cks, result_images

    for text, image in zip(texts, images):
        if isinstance(text, tuple):
            text_str = text[0] if text[0] is not None else ""
            text_pos = text[1] if len(text) > 1 else ""
            add_chunk("\n" + text_str, image, text_pos)
        else:
            add_chunk("\n" + (text or ""), image)

    return cks, result_images
```

**分块算法要点（文字解释）**：

1. **输入约定**：`sections = [(text, pos), ...]`，每段自带 `pos` 位置元信息（PDF DeepDOC 场景是页码+坐标标签，Word 场景可能是段落 style 名）

2. **贪心合并**：
   - 维护当前 chunk `cks[-1]` 与其 token 数 `tk_nums[-1]`
   - 遍历每段 `(sec, pos)`：如果当前 chunk 已达 `chunk_token_num × (100-overlap%) / 100`，就 **开新 chunk**；否则追加到当前

3. **滑动窗口 overlap**：
   - 开新 chunk 时不是"空开新"，而是把上一 chunk 尾部按 `overlapped_percent` 比例前置到新 chunk
   - 好处：一句话被切在 chunk 边界上时，两侧 chunk 都保留了这句话的一部分，检索时不会因为"关键词跨 chunk"而丢召回
   - `remove_tag` 工具函数用于剥掉 PDF 场景插入的位置标签（避免位置标签污染 overlap 内容）

4. **位置标签附着**：
   - 每段的 `pos` 会插到 chunk 里对应位置，供前端在检索结果里点回原文（PDF 场景显示页码高亮）
   - Token 数 < 8 的段不带位置（防噪声段抢走版式定位）

5. **自定义硬切**（`custom_delimiters` 分支）：
   - `delimiter` 里用反引号 `` ` `` 包起来的字符串是"硬切分隔符"，例如 ``"\n`----------`"``
   - 硬切分支：`re.split` 一切到底，命中即断，**不再走贪心合并**
   - 用途：知识库里有明确"章节分隔线"的文档（如"===="或"----"分节）

6. **带图片版差异**（`naive_merge_with_images`）：
   - 每段除文本外还带一个 image
   - 追加合并时，多个 image 会用 `concat_img` 拼成一张（vertical concat）
   - 开新 chunk 时 image 也开新

7. **docx 专用版** `naive_merge_docx`（同文件 1449 行起）：
   - 额外处理 `table_context_size`（表格前后 N 段作为表格 chunk 的上下文）与 `image_context_size`
   - 输出 `(chunks, images)`：`images` 记录了 chunks 里哪些索引位置对应到图片

---

## 附录：端到端流程

```
1. 用户上传 (apps/client Vue)
2. → apps/server (NestJS)
3. server: DocxPreprocessService.preprocessFiles()
     └─ .docx → pandoc → .md   (跳过表格数字丢失问题)
     └─ 其他类型透传
4. server: KnowledgeBaseService
     └─ POST /api/v1/datasets/{id}/documents         (上传文件)
     └─ POST /api/v1/datasets/{id}/chunks            (触发解析)
5. 解析:rag/app/naive.py::chunk(filename, binary, parser_config=...)
     ├─ 按后缀分派到:
     │   ├─ Docx / DocxParser
     │   ├─ Pdf / PdfParser (走 OCR + Layout + TSR 流水线)
     │   ├─ ExcelParser
     │   ├─ Markdown / TxtParser / HtmlParser / JsonParser
     │   └─ tika (老 .doc)
     ├─ tokenize_table(tables, ...)                  (表格单独分词入库)
     └─ naive_merge / naive_merge_with_images / naive_merge_docx
        └─ 贪心合并到 chunk_token_num=512,overlap 滑动窗口
6. 分词 + embedding + 入索引
7. server: ChunkTagQueueService (后台轮询)
     └─ 发现 doc.run == 'DONE' → 入队
8. server: ChunkTaggerService.tagDocument(datasetId, docId, docName)
     ├─ listChunks(...)                              (分页拉 chunk)
     ├─ 每个 chunk:
     │   ├─ matcher.match(content)                   (词典 substring + 正则命中)
     │   └─ inferProjectKeywords(docName)            (项目名注入,实体锚定)
     └─ PUT /api/v1/datasets/{ds}/documents/{doc}/chunks/{ck}
        └─ 更新 important_keywords 字段
9. 检索时:
     ├─ BM25 (含 important_keywords 加权)
     ├─ 向量召回
     └─ Rerank
```
