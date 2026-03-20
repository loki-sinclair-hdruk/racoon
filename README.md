# 🦝 Racoon

**Extensible codebase quality scanner.** Scores projects across 8 engineering dimensions and tells you exactly what lifts your score and what holds it back.

```
  ████████████████████████░░░░░░░░░░░░░░░◆  62/100  ceiling: 84/100  D

  What lifts your score
  ▲ [Security] No hardcoded secrets detected
  ▲ [Maintainability] 94% of source files are TypeScript

  Documented gaps — what holds you back
  ✖ [Test Coverage] 0 test files for 47 source files (−100 pts)
  ▼ [Architecture] Both app/ and pages/ directories found — mixed routing (−50 pts)
  ▼ [Documentation] No README.md found (−100 pts)

  Closing identified gaps could raise your score by up to +22 pts → 84/100
```

---

## Dimensions

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| Readability | 10% | How easy the code is to read at a glance |
| Maintainability | 15% | How safely the code can be changed and debugged |
| Extensibility | 10% | How well the codebase accommodates new features |
| Test Coverage | 15% | Breadth and quality of automated tests |
| Security | 20% | Resistance to common vulnerabilities and secret exposure |
| Performance | 10% | Code patterns that influence runtime efficiency |
| Documentation | 10% | READMEs, inline docs, and developer-facing guidance |
| Architecture | 10% | Separation of concerns, layering, and conventions |

Weights are configurable per-project via `.racoon.json`.

---

## Supported stacks (MVP)

| Stack | Detection |
|-------|-----------|
| **PHP / Laravel** | `composer.json`, `artisan`, `app/Http/Controllers/` |
| **Next.js / React** | `package.json → next + react`, `next.config.*` |

Stacks are auto-detected. Multiple stacks may be active simultaneously (e.g. a monorepo).

---

## Installation

```bash
# Clone and build
git clone https://github.com/your-org/racoon.git
cd racoon
npm install
npm run build

# Run globally (optional)
npm link
```

> **Requirements:** Node.js 18+

---

## Usage

### Basic scan

```bash
racoon scan ./path/to/project
```

### Force a specific stack

```bash
racoon scan ./my-api --stack php-laravel
racoon scan ./my-frontend --stack nextjs-react

# Multiple stacks (monorepo)
racoon scan . --stack php-laravel,nextjs-react
```

### JSON output (for CI/CD)

```bash
racoon scan ./my-project --format json
racoon scan ./my-project --format json | jq '.overallScore'
```

### Fail under a threshold (CI/CD exit code)

```bash
racoon scan ./my-project --fail-under 70
# exits with code 1 if overall score < 70
```

### Skip specific checks

```bash
racoon scan ./my-project --skip php-laravel/n-plus-one,php-laravel/cache-usage
```

### Verbose mode

```bash
racoon scan ./my-project --verbose
```

---

## GitHub Actions

```yaml
- name: Scan codebase quality
  run: |
    npx racoon scan . --format json --fail-under 60
```

Or capture the full report as an artifact:

```yaml
- name: Racoon quality scan
  run: npx racoon scan . --format json > racoon-report.json

- name: Upload report
  uses: actions/upload-artifact@v4
  with:
    name: racoon-report
    path: racoon-report.json
```

---

## Per-project configuration

Place a `.racoon.json` file in the root of the project being scanned:

```json
{
  "dimensionWeights": {
    "security": 0.30,
    "test_coverage": 0.20,
    "readability": 0.10,
    "maintainability": 0.10,
    "extensibility": 0.10,
    "performance": 0.10,
    "documentation": 0.05,
    "architecture": 0.05
  },
  "skip": [
    "php-laravel/changelog",
    "nextjs-react/storybook"
  ],
  "outputFormat": "terminal"
}
```

---

## Baseline tracking

After each scan, Racoon writes a `.racoon-baseline.json` snapshot to the scanned project root. On subsequent scans, it diffs the new results against this snapshot and appends a delta section to the report:

```
  Changes since last scan  (21/03/2026, 09:14:32)
  Overall: 58 → 62  ▲ +4 pts

  Improvements (2)
  ▲ [Security]         Hardcoded Secrets           0 → 25  (+25)
  ▲ [Test Coverage]    Test File Ratio             40 → 55  (+15)

  Regressions (1)
  ✖ [Performance]      Next.js Image Optimisation  80 → 20  (−60)
```

Changes smaller than ±3 points are treated as noise and suppressed.

Commit `.racoon-baseline.json` to track score trends over time, or add it to `.gitignore` to keep it local.

---

## Checks reference

### PHP / Laravel (25 checks)

| Dimension | Check ID | What it looks for |
|-----------|----------|-------------------|
| Readability | `php-laravel/method-length` | Methods exceeding 30 lines |
| Readability | `php-laravel/naming-conventions` | PascalCase classes, camelCase methods |
| Maintainability | `php-laravel/controller-bloat` | Controller methods exceeding 30 code lines (comments/annotations stripped) — signals business logic in controller layer |
| Maintainability | `php-laravel/service-layer` | Service classes relative to controllers |
| Maintainability | `php-laravel/cyclomatic-complexity` | Decision points per function (proxy) |
| Extensibility | `php-laravel/interface-usage` | Interface / contract definitions |
| Extensibility | `php-laravel/repository-pattern` | Repository classes |
| Extensibility | `php-laravel/config-usage` | Hard-coded URLs and IPs outside `config/` |
| Test Coverage | `php-laravel/test-framework` | PHPUnit or Pest presence |
| Test Coverage | `php-laravel/test-file-ratio` | Critical-path files (controllers, services, jobs, etc.) with a corresponding test |
| Test Coverage | `php-laravel/assertion-density` | Average assertions per test file — flags placeholder/smoke tests |
| Test Coverage | `php-laravel/test-type-balance` | Feature vs Unit test mix |
| Security | `php-laravel/hardcoded-secrets` | Password/key/token literals in source |
| Security | `php-laravel/sql-injection` | Raw SQL with variable interpolation |
| Security | `php-laravel/env-exposure` | `.env` committed or unguarded in `.gitignore` |
| Security | `php-laravel/mass-assignment` | Eloquent models without `$fillable`/`$guarded` |
| Performance | `php-laravel/n-plus-one` | Query calls inside loops |
| Performance | `php-laravel/cache-usage` | `Cache::` / `Redis::` usage |
| Performance | `php-laravel/eager-loading` | `->with()` vs relationship definition ratio |
| Documentation | `php-laravel/readme` | README presence and key sections |
| Documentation | `php-laravel/phpdoc-coverage` | PHPDoc blocks on public methods |
| Documentation | `php-laravel/changelog` | CHANGELOG presence |
| Architecture | `php-laravel/mvc-structure` | Controllers, models, views, routes all present |
| Architecture | `php-laravel/middleware-usage` | Middleware classes and route usage |
| Architecture | `php-laravel/separation-of-concerns` | Direct DB call density in controllers |

### Next.js / React (25 checks)

| Dimension | Check ID | What it looks for |
|-----------|----------|-------------------|
| Readability | `nextjs-react/eslint-config` | ESLint config with optional strict preset |
| Readability | `nextjs-react/component-size` | Components exceeding 200 lines |
| Maintainability | `nextjs-react/typescript` | TS/TSX vs JS/JSX file ratio |
| Maintainability | `nextjs-react/custom-hooks` | Custom hook files relative to components |
| Maintainability | `nextjs-react/prop-types` | Exported components with typed props |
| Extensibility | `nextjs-react/file-structure` | Conventional dirs (features/, hooks/, types/, utils/) |
| Extensibility | `nextjs-react/env-var-usage` | `.env.example`, `.gitignore` coverage |
| Extensibility | `nextjs-react/api-abstraction` | API layer files vs raw fetch in components |
| Test Coverage | `nextjs-react/test-framework` | Jest/Vitest/Cypress/Playwright presence |
| Test Coverage | `nextjs-react/test-file-ratio` | Critical-path files (pages, app routes, components, hooks) with a corresponding test |
| Test Coverage | `nextjs-react/assertion-density` | Average assertions per test file — flags placeholder/smoke tests |
| Test Coverage | `nextjs-react/coverage-config` | Coverage script + threshold enforcement |
| Security | `nextjs-react/xss-risk` | `dangerouslySetInnerHTML` usage |
| Security | `nextjs-react/eval-usage` | `eval()` / `new Function()` calls |
| Security | `nextjs-react/hardcoded-secrets` | API key / token literals |
| Security | `nextjs-react/security-headers` | CSP, HSTS, X-Frame-Options in `next.config` |
| Performance | `nextjs-react/next-image` | `next/image` vs raw `<img>` ratio |
| Performance | `nextjs-react/code-splitting` | Dynamic imports and `React.lazy()` |
| Performance | `nextjs-react/memoization` | `React.memo`, `useMemo`, `useCallback` usage |
| Documentation | `nextjs-react/readme` | README presence and key sections |
| Documentation | `nextjs-react/jsdoc-coverage` | JSDoc on exported functions |
| Documentation | `nextjs-react/storybook` | `.storybook/` config and story files |
| Architecture | `nextjs-react/router-consistency` | App Router vs Pages Router (no mixing) |
| Architecture | `nextjs-react/api-routes` | API route file size |
| Architecture | `nextjs-react/server-client-separation` | `"use client"` / `"use server"` discipline |

---

## Extending Racoon

Adding support for a new stack (e.g. Django, Ruby on Rails) takes three steps:

### 1. Create your checks

```
src/plugins/django/checks/
  readability.ts
  security.ts
  ...
```

Each check implements the `Check` interface:

```typescript
import { Check, Dimension, Finding, ScanContext } from '../../../core/types.js';

export const myCheck: Check = {
  id: 'django/my-check',
  name: 'My Check',
  dimension: Dimension.Security,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    // context.files    — all project file paths
    // context.fileCache — lazy-populated content cache
    // context.projectRoot — absolute path
    return {
      message: 'Everything looks fine',
      score: 100,
      maxScore: 100,
      severity: 'info',
    };
  },
};
```

### 2. Register your plugin

```typescript
// src/plugins/django/index.ts
import { Plugin, Stack } from '../../core/types.js';
import { PluginRegistry } from '../../core/registry.js';
import { myCheck } from './checks/security.js';

PluginRegistry.register({
  id: 'django',
  stacks: [Stack.Django],          // add Django to the Stack enum in types.ts
  checks: [myCheck],
});
```

### 3. Import in the CLI

```typescript
// src/cli/index.ts
import '../plugins/django/index.js';
```

That's it. No core changes required.

---

## Score interpretation

| Score | Grade | Meaning |
|-------|-------|---------|
| 90–100 | A | Excellent — a well-maintained, production-grade codebase |
| 80–89 | B | Good — a few gaps but fundamentally solid |
| 70–79 | C | Acceptable — meaningful improvement areas exist |
| 60–69 | D | Needs work — several dimensions are under-invested |
| 40–59 | E | Significant gaps — reliability and security risk |
| 0–39 | F | Critical — foundational issues need urgent attention |

The **ceiling score** represents the realistic best-case score if every identified gap were resolved. A large gap between your current score and ceiling means the issues found are high-impact and worth prioritising.

---

## Development

```bash
npm run build      # compile TypeScript → dist/
npm run typecheck  # type-check without emitting
npm run dev        # run via ts-node (no build step)
```

---

## Roadmap

- [ ] HTML report output
- [ ] Additional stacks: Ruby on Rails, Django, Go
- [ ] Git diff mode (score only changed files)
- [ ] Trend tracking (score over time via CI artefacts)
- [ ] Custom check authoring via `.racoon.json`
