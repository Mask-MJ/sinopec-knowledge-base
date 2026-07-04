export interface ProjectAnchor {
  aliases: string[];
  projectName: string;
  wellNumbers: string[];
}

function assertStringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${where} must be an array`);
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string' || item.length === 0) {
      throw new Error(`${where}[${index}] must be a non-empty string`);
    }
  });
  return value as string[];
}

export function loadRegistry(raw: unknown): ProjectAnchor[] {
  if (!Array.isArray(raw)) {
    throw new TypeError('anchor registry must be an array');
  }
  return raw.map((item, index) => {
    const where = `anchor registry[${index}]`;
    if (typeof item !== 'object' || item === null) {
      throw new Error(`${where} must be an object`);
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record.projectName !== 'string' ||
      record.projectName.length === 0
    ) {
      throw new Error(`${where}.projectName must be a non-empty string`);
    }
    return {
      projectName: record.projectName,
      aliases: assertStringArray(record.aliases, `${where}.aliases`),
      wellNumbers: assertStringArray(
        record.wellNumbers,
        `${where}.wellNumbers`,
      ),
    };
  });
}
