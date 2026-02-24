const allowedScopes = [
  "@sinopec-kb/client",
  "@sinopec-kb/server",
  "@sinopec-kb/eslint-config",
  "@sinopec-kb/prettier-config",
  "@sinopec-kb/commitlint-config",
  "project",
  "style",
  "lint",
  "ci",
  "dev",
  "deploy",
  "other",
];

/**
 * @type {import('@commitlint/types').UserConfig}
 */
const userConfig = {
  extends: ["@commitlint/config-conventional"],
  plugins: ["commitlint-plugin-function-rules"],
  rules: {
    /**
     * type[scope]: [function] description
     *
     * ^^^^^^^^^^^^^^ empty line.
     * - Something here
     */
    "body-leading-blank": [2, "always"],
    /**
     * type[scope]: [function] description
     *
     * - something here
     *
     * ^^^^^^^^^^^^^^
     */
    "footer-leading-blank": [1, "always"],
    /**
     * type[scope]: [function] description
     *      ^^^^^
     */
    "function-rules/scope-enum": [
      2, // level: error
      "always",
      (parsed) => {
        if (!parsed.scope || allowedScopes.includes(parsed.scope)) {
          return [true];
        }

        return [false, `scope must be one of ${allowedScopes.join(", ")}`];
      },
    ],
    /**
     * type[scope]: [function] description [No more than 108 characters]
     *      ^^^^^
     */
    "header-max-length": [2, "always", 108],

    "scope-enum": [0],
    "subject-case": [0],
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
    /**
     * type[scope]: [function] description
     * ^^^^
     */
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "perf",
        "style",
        "docs",
        "test",
        "refactor",
        "build",
        "ci",
        "chore",
        "revert",
        "types",
        "release",
      ],
    ],
  },
};

export default userConfig;
