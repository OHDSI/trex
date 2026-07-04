// Batch B (task-v2-brief.md): thin wrapper over the legacy devx webCrawlTool.
// Internals live in functions/tools/web_crawl.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { webCrawlTool } from "../../functions/tools/web_crawl.ts";

export default wrap({
  description: webCrawlTool.description,
  schema: webCrawlTool.parameters,
  execute: webCrawlTool.execute,
  modifiesState: webCrawlTool.modifiesState,
  defaultConsent: webCrawlTool.defaultConsent,
});
