import type { Linter } from 'eslint';

import tseslint from 'typescript-eslint';

import { interopDefault } from '../util';

export async function vue(): Promise<Linter.Config[]> {
  const pluginVue = await interopDefault(import('eslint-plugin-vue'));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vue-eslint-parser has no type declarations
  const parserVue: Linter.Parser = await interopDefault(
    // @ts-expect-error - vue-eslint-parser has no type declarations
    import('vue-eslint-parser'),
  );

  const flatRecommended = pluginVue.configs['flat/recommended'];

  return [
    ...flatRecommended,
    {
      files: ['**/*.vue'],
      languageOptions: {
        parser: parserVue,
        parserOptions: {
          ecmaFeatures: { jsx: true },
          extraFileExtensions: ['.vue'],
          parser: tseslint.parser,
          sourceType: 'module',
        },
      },
      plugins: {
        vue: pluginVue as Record<string, unknown>,
      },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- eslint-plugin-vue processor type mismatch
      processor: pluginVue.processors['.vue'],
      rules: {
        ...pluginVue.configs.base.rules,
        'vue/attribute-hyphenation': ['error', 'always', { ignore: [] }],
        'vue/attributes-order': 'off',
        'vue/block-order': [
          'error',
          { order: ['script', 'template', 'style'] },
        ],
        'vue/component-name-in-template-casing': ['error', 'PascalCase'],
        'vue/component-options-name-casing': ['error', 'PascalCase'],
        'vue/custom-event-name-casing': ['error', 'camelCase'],
        'vue/define-macros-order': [
          'error',
          {
            order: [
              'defineOptions',
              'defineProps',
              'defineEmits',
              'defineSlots',
            ],
          },
        ],
        'vue/dot-location': ['error', 'property'],
        'vue/dot-notation': ['error', { allowKeywords: true }],
        // 'smart' allows == for null checks (value == null), which is idiomatic in Vue templates
        'vue/eqeqeq': ['error', 'smart'],
        'vue/html-closing-bracket-newline': 'off',
        'vue/html-indent': 'off',
        'vue/html-quotes': ['error', 'double'],
        'vue/html-self-closing': [
          'error',
          {
            html: { component: 'always', normal: 'never', void: 'always' },
            math: 'always',
            svg: 'always',
          },
        ],
        'vue/max-attributes-per-line': 'off',
        'vue/multi-word-component-names': 'off',
        'vue/multiline-html-element-content-newline': 'error',
        'vue/no-empty-pattern': 'error',
        'vue/no-extra-parens': ['error', 'functions'],
        'vue/no-irregular-whitespace': 'error',
        'vue/no-loss-of-precision': 'error',
        'vue/no-reserved-component-names': 'off',
        'vue/no-restricted-syntax': [
          'error',
          'DebuggerStatement',
          'LabeledStatement',
          'WithStatement',
          'TSEnumDeclaration[const=true]',
          'TSExportAssignment',
        ],
        'vue/no-restricted-v-bind': ['error', '/^v-/'],
        'vue/no-sparse-arrays': 'error',
        'vue/no-unused-refs': 'error',
        'vue/no-useless-v-bind': 'error',
        'vue/object-shorthand': [
          'error',
          'always',
          { avoidQuotes: true, ignoreConstructors: false },
        ],
        'vue/one-component-per-file': 'error',
        'vue/prefer-import-from-vue': 'error',
        'vue/prefer-separate-static-class': 'error',
        'vue/prefer-template': 'error',
        'vue/prop-name-casing': ['error', 'camelCase'],
        'vue/require-default-prop': 'error',
        'vue/require-explicit-emits': 'error',
        'vue/require-prop-types': 'off',
        'vue/singleline-html-element-content-newline': 'off',
        'vue/space-infix-ops': 'error',
        'vue/space-unary-ops': ['error', { nonwords: false, words: true }],
        'vue/v-on-event-hyphenation': [
          'error',
          'always',
          { autofix: true, ignore: [] },
        ],
      },
    },
  ];
}
