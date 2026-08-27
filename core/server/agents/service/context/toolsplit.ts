/**
 * Core tools come first and never change within a session; activated tools are
 * appended after the cache breakpoint, so activation never invalidates the
 * cached TOOLS+SYSTEM prefix. A deferred tool absent from `activated` is
 * withheld entirely — it appears in neither returned group.
 */
export function partitionTools<T>(
  tools: Record<string, T>,
  activated: string[],
  deferred: string[],
): { core: [string, T][]; activated: [string, T][] } {
  const deferredSet = new Set(deferred);
  const activatedSet = new Set(activated);
  const core: [string, T][] = [];
  const act: [string, T][] = [];
  for (const [name, def] of Object.entries(tools)) {
    if (!deferredSet.has(name)) core.push([name, def]);
    else if (activatedSet.has(name)) act.push([name, def]);
  }
  return { core, activated: act };
}
