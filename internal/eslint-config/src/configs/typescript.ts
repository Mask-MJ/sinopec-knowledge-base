import type { Linter } from 'eslint';

import tseslint from 'typescript-eslint';

const TS_JS_FILES = ['**/*.?([cm])[jt]s?(x)'];

/** Extract and merge all rules from one or more eslint config objects. */
function extractRules(
  source: Linter.Config | Linter.Config[],
): Linter.RulesRecord {
  const configs = Array.isArray(source) ? source : [source];
  const merged: Record<string, Linter.RuleEntry> = {};
  for (const config of configs) {
    if (config.rules) {
      for (const [key, value] of Object.entries(config.rules)) {
        if (value !== undefined) {
          merged[key] = value as Linter.RuleEntry;
        }
      }
    }
  }
  return merged;
}

export function typescript(): Linter.Config[] {
  return [
    {
      files: TS_JS_FILES,
      plugins: {
        '@typescript-eslint': tseslint.plugin as unknown as Record<
          string,
          unknown
        >,
      },
      languageOptions: {
        parser: tseslint.parser as Linter.Parser,
        parserOptions: {
          createDefaultProgram: false,
          ecmaFeatures: { jsx: true },
          ecmaVersion: 'latest',
          extraFileExtensions: ['.vue'],
          projectService: true,
          sourceType: 'module',
        },
      },
      rules: {
        // --- Base: strictTypeChecked rules (extracted and scoped to TS/JS files) ---
        ...extractRules(tseslint.configs.eslintRecommended as Linter.Config),
        ...extractRules(tseslint.configs.strictTypeChecked as Linter.Config[]),

        // --- Project overrides ---
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-check': false,
            'ts-expect-error': 'allow-with-description',
            'ts-ignore': 'allow-with-description',
            'ts-nocheck': 'allow-with-description',
          },
        ],
        '@typescript-eslint/consistent-type-definitions': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-empty-function': [
          'error',
          { allow: ['arrowFunctions', 'functions', 'methods'] },
        ],
        '@typescript-eslint/no-extraneous-class': 'off',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/no-namespace': 'off',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/no-unused-expressions': 'off',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/no-use-before-define': 'off',

        // Gradual tightening: off → warn (promote to error once warnings are cleared)
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unsafe-argument': 'warn',
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-call': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
        '@typescript-eslint/no-unsafe-return': 'warn',
        '@typescript-eslint/require-await': 'warn',

        // New strictTypeChecked rules — warn initially, promote to error later
        '@typescript-eslint/no-unnecessary-condition': 'warn',
        '@typescript-eslint/no-redundant-type-constituents': 'warn',
        '@typescript-eslint/restrict-template-expressions': 'warn',
        '@typescript-eslint/return-await': 'warn',
        '@typescript-eslint/no-confusing-void-expression': 'warn',
        '@typescript-eslint/no-unnecessary-type-parameters': 'warn',
        '@typescript-eslint/unified-signatures': 'warn',
        '@typescript-eslint/prefer-reduce-type-parameter': 'warn',
        '@typescript-eslint/no-unsafe-function-type': 'warn',
        '@typescript-eslint/no-misused-spread': 'warn',
        '@typescript-eslint/use-unknown-in-catch-callback-variable': 'warn',
        '@typescript-eslint/unbound-method': 'warn',
      },
    },

    // Disable type-checked rules for plain JS files (config files, scripts, etc.)
    {
      files: ['**/*.{js,mjs,cjs}'],
      ...(tseslint.configs.disableTypeChecked as Linter.Config),
    },
  ];
}
