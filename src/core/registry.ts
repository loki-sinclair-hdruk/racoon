import { Plugin, Stack } from './types.js';

/**
 * Central plugin registry.
 *
 * Plugins self-register by calling PluginRegistry.register() at import time.
 * The scanner queries the registry for all plugins applicable to the detected
 * stacks, then collects their checks.
 *
 * Usage:
 *   // In a plugin's index.ts:
 *   PluginRegistry.register(myPlugin);
 *
 *   // In the scanner:
 *   const checks = PluginRegistry.checksFor([Stack.PhpLaravel]);
 */
export class PluginRegistry {
  private static plugins: Map<string, Plugin> = new Map();

  static register(plugin: Plugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin "${plugin.id}" is already registered.`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  static getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /** Returns all checks from plugins that match any of the given stacks. */
  static checksFor(stacks: Stack[]) {
    const stackSet = new Set(stacks);
    return this.getAll()
      .filter((p) => p.stacks.some((s) => stackSet.has(s)))
      .flatMap((p) => p.checks);
  }

  /** Visible for testing. */
  static reset(): void {
    this.plugins.clear();
  }
}
