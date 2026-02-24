import type { PluginOption } from 'vite';

import { getPackages } from '@manypkg/get-packages';
import dayjs from 'dayjs';
import { readPackageJSON } from 'pkg-types';

/**
 * 用于注入项目信息（版本号、构建时间、依赖列表等）
 */
async function viteMetadataPlugin(
  root = process.cwd(),
): Promise<PluginOption | undefined> {
  const { author, description, homepage, license, version } =
    await readPackageJSON(root);

  const buildTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

  return {
    async config() {
      const { dependencies, devDependencies } =
        await resolveMonorepoDependencies();

      const isAuthorObject = typeof author === 'object';
      const authorName = isAuthorObject ? author.name : author;
      const authorEmail = isAuthorObject ? author.email : null;
      const authorUrl = isAuthorObject ? author.url : null;

      return {
        define: {
          __APP_METADATA__: JSON.stringify({
            authorEmail,
            authorName,
            authorUrl,
            buildTime,
            dependencies,
            description,
            devDependencies,
            homepage,
            license,
            version,
          }),
          'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
        },
      };
    },
    enforce: 'post',
    name: 'vite:inject-metadata',
  };
}

async function resolveMonorepoDependencies() {
  const { packages } = await getPackages(process.cwd());

  const resultDevDependencies: Record<string, string | undefined> = {};
  const resultDependencies: Record<string, string | undefined> = {};

  for (const { packageJson } of packages) {
    const { dependencies = {}, devDependencies = {} } = packageJson;
    for (const [key, value] of Object.entries(dependencies)) {
      resultDependencies[key] = value;
    }
    for (const [key, value] of Object.entries(devDependencies)) {
      resultDevDependencies[key] = value;
    }
  }

  return {
    dependencies: resultDependencies,
    devDependencies: resultDevDependencies,
  };
}

export { viteMetadataPlugin };
