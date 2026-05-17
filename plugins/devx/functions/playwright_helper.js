#!/usr/bin/env node
/**
 * Playwright helper script for DevX QA/Design reviews.
 * Invoked via trex_devx_run_command with a JSON command as argv[1].
 *
 * Usage: node /path/to/playwright_helper.js '{"action":"navigate","params":{"url":"http://localhost:3001"}}'
 *
 * Playwright must be installed globally (npm install -g playwright) or available
 * via NODE_PATH. The Dockerfile handles this.
 *
 * Actions: navigate, click, fill, getText, screenshot, evaluate
 * Output: JSON on stdout: { ok: true, text?, screenshot?, url?, title?, error? }
 */

let chromium;
try {
  // Resolves via NODE_PATH=/usr/lib/node_modules (set in Dockerfile)
  // or from local node_modules
  chromium = require("playwright").chromium;
} catch {
  console.log(JSON.stringify({
    ok: false,
    error: "Playwright not installed. Ensure the Docker image includes: npm install -g playwright && npx playwright install chromium",
  }));
  process.exit(0);
}

async function main() {
  const cmd = JSON.parse(process.argv[2] || "{}");
  const { action, params = {} } = cmd;

  let browser;
  let page;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    page = await context.newPage();

    // If we have a URL from a previous navigation stored in params, navigate first
    if (params._currentUrl) {
      await page.goto(params._currentUrl, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
    }

    let result = { ok: true };

    switch (action) {
      case "navigate": {
        const response = await page.goto(params.url, {
          waitUntil: "networkidle",
          timeout: 15000,
        });
        const statusCode = response ? response.status() : null;
        const title = await page.title();
        const text = await getPageText(page);
        const links = await getLinks(page);
        const forms = await getForms(page);
        result = { ok: true, url: page.url(), title, statusCode, text, links, forms };
        break;
      }

      case "click": {
        const { selector } = params;
        try {
          if (selector.startsWith("text=") || selector.startsWith("role=")) {
            await page.locator(selector).first().click({ timeout: 5000 });
          } else {
            await page.click(selector, { timeout: 5000 });
          }
          await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
          const title = await page.title();
          const text = await getPageText(page);
          result = { ok: true, url: page.url(), title, text };
        } catch (err) {
          result = { ok: false, error: "Click failed: " + err.message };
        }
        break;
      }

      case "fill": {
        const { selector, value } = params;
        try {
          await page.fill(selector, value, { timeout: 5000 });
          result = { ok: true, message: "Filled " + selector + " with value" };
        } catch (err) {
          result = { ok: false, error: "Fill failed: " + err.message };
        }
        break;
      }

      case "getText": {
        const title = await page.title();
        const text = await getPageText(page);
        const links = await getLinks(page);
        const forms = await getForms(page);
        result = { ok: true, url: page.url(), title, text, links, forms };
        break;
      }

      case "screenshot": {
        const screenshotBuffer = await page.screenshot({
          fullPage: params.full_page || false,
          type: "png",
        });
        const base64 = screenshotBuffer.toString("base64");
        // Also capture page text and computed styles for design analysis
        // (since LLMs receive screenshots as text, not images)
        const text = await getPageText(page);
        const styles = await getComputedStyles(page);
        result = {
          ok: true,
          url: page.url(),
          title: await page.title(),
          screenshot: base64,
          text,
          styles,
        };
        break;
      }

      case "evaluate": {
        try {
          const evalResult = await page.evaluate(params.expression);
          result = {
            ok: true,
            value: typeof evalResult === "object"
              ? JSON.stringify(evalResult, null, 2)
              : String(evalResult),
          };
        } catch (err) {
          result = { ok: false, error: "Evaluate failed: " + err.message };
        }
        break;
      }

      default:
        result = { ok: false, error: "Unknown action: " + action };
    }

    console.log(JSON.stringify(result));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: err.message }));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function getPageText(page) {
  try {
    const text = await page.evaluate(() => {
      const result = [];
      const walk = (el) => {
        if (!el) return;
        const tag = el.tagName && el.tagName.toLowerCase();
        if (["script", "style", "noscript", "svg"].includes(tag)) return;
        try {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return;
        } catch { /* skip */ }

        const directText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .filter(Boolean)
          .join(" ");

        const prefix = ["h1","h2","h3","h4","h5","h6"].includes(tag) ? "[" + tag.toUpperCase() + "] " :
          tag === "a" ? "[LINK] " :
          tag === "button" ? "[BUTTON] " :
          tag === "input" ? "[INPUT type=" + (el.type || "text") + (el.placeholder ? ' placeholder="' + el.placeholder + '"' : "") + "] " :
          tag === "img" ? '[IMAGE alt="' + (el.alt || "") + '"] ' :
          tag === "select" ? "[SELECT] " :
          tag === "textarea" ? "[TEXTAREA] " :
          tag === "label" ? "[LABEL] " :
          tag === "nav" ? "[NAV] " :
          "";

        if (directText || prefix) {
          result.push(prefix + directText);
        }

        for (const child of el.children) {
          walk(child);
        }
      };
      walk(document.body);
      return result.join("\n").slice(0, 10000);
    });
    return text;
  } catch {
    return await page.textContent("body").catch(() => "").then((t) => (t || "").slice(0, 10000));
  }
}

async function getLinks(page) {
  try {
    return await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href]"))
        .filter((a) => a.offsetParent !== null)
        .slice(0, 30)
        .map((a) => ({ text: a.textContent.trim().slice(0, 80), href: a.href }));
    });
  } catch {
    return [];
  }
}

async function getForms(page) {
  try {
    return await page.evaluate(() => {
      return Array.from(document.querySelectorAll("input, select, textarea, button[type=submit]"))
        .filter((el) => el.offsetParent !== null)
        .slice(0, 20)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          type: el.type || undefined,
          name: el.name || undefined,
          id: el.id || undefined,
          placeholder: el.placeholder || undefined,
          value: el.value ? el.value.slice(0, 50) : undefined,
          label: el.labels && el.labels[0] ? el.labels[0].textContent.trim().slice(0, 50) : undefined,
        }));
    });
  } catch {
    return [];
  }
}

async function getComputedStyles(page) {
  try {
    return await page.evaluate(() => {
      const elements = [];
      const selectors = [
        "body", "header", "nav", "main", "footer",
        "h1", "h2", "h3", "p", "a", "button",
        "input", "form", ".container", "[class*=card]",
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el || el.offsetParent === null) continue;
        const s = window.getComputedStyle(el);
        elements.push({
          selector: sel,
          tag: el.tagName.toLowerCase(),
          fontSize: s.fontSize,
          fontFamily: s.fontFamily.slice(0, 60),
          color: s.color,
          backgroundColor: s.backgroundColor,
          padding: s.padding,
          margin: s.margin,
          display: s.display,
          width: s.width,
          height: s.height,
        });
      }
      return elements.slice(0, 15);
    });
  } catch {
    return [];
  }
}

main();
