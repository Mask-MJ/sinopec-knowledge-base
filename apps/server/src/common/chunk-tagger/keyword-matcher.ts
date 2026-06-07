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
