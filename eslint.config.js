// ESLint v9 flat config
import js from '@eslint/js'
import pluginImport from 'eslint-plugin-import'
import pluginPrettier from 'eslint-plugin-prettier'
import pluginSimpleImportSort from 'eslint-plugin-simple-import-sort'

export default [
  {
    ignores: [
      'node_modules',
      'session',
      'backup',
      'options/image',
      'options/sticker',
      'options/receipts',
    ],
  },
  js.configs.recommended,
  {
    plugins: {
      import: pluginImport,
      prettier: pluginPrettier,
      'simple-import-sort': pluginSimpleImportSort,
    },
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Temporarily disable no-undef to unblock auto-fixes on legacy globals
      'no-undef': 'off',
      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',
      'import/order': 'off',
      'import/no-unresolved': 'off',
      'prettier/prettier': 'warn',
    },
  },
]
