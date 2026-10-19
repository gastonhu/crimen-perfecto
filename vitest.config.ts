import { configDefaults, defineConfig } from 'vitest/config';

// Los worktrees de otras sesiones viven en .claude/worktrees: sus tests no son de este checkout.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
});
