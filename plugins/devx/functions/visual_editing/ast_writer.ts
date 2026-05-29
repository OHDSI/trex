// @ts-nocheck - Deno edge function
/**
 * AST-based code writer for visual editing.
 * Uses Babel to parse JSX/TSX, find elements by source location,
 * and apply modifications (class changes, text content, child insert/remove/move).
 */
import * as parser from "npm:@babel/parser@7";
import _traverse from "npm:@babel/traverse@7";
import _generate from "npm:@babel/generator@7";
import * as t from "npm:@babel/types@7";
import { deduplicateClasses } from "./tailwind_mapper.ts";

// Handle default export quirks with npm: specifiers
const traverse = (_traverse as any).default || _traverse;
const generate = (_generate as any).default || _generate;

export interface CodeEdit {
  /** 1-indexed line number from data-devx-id */
  line: number;
  /** 1-indexed column number from data-devx-id */
  col: number;
  /** Tailwind classes to merge into className */
  tailwindClasses?: string[];
  /** New text content to set */
  textContent?: string;
  /** Insert a child JSX element */
  insertChild?: { index: number; tagName: string; classes: string; text: string };
  /** Remove child at index */
  removeChild?: { index: number };
  /** Move child from one index to another */
  moveChild?: { fromIndex: number; toIndex: number };
}

/**
 * Parse source code into a Babel AST.
 */
function parseSource(source: string) {
  return parser.parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx", ["decorators", { decoratorsBeforeExport: true }], "dynamicImport"],
  });
}

/**
 * Find a JSXOpeningElement by source location (line:col, both 1-indexed).
 */
function matchesLocation(node: any, line: number, col: number): boolean {
  if (!node.loc) return false;
  return node.loc.start.line === line && node.loc.start.column + 1 === col;
}

/**
 * Find or create a className JSXAttribute on a JSXOpeningElement.
 * Returns the attribute node.
 */
function getOrCreateClassName(openingElement: any): any {
  for (const attr of openingElement.attributes) {
    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: "className" })) {
      return attr;
    }
  }
  // Create new className=""
  const attr = t.jsxAttribute(t.jsxIdentifier("className"), t.stringLiteral(""));
  openingElement.attributes.push(attr);
  return attr;
}

/**
 * Merge new Tailwind classes into a className attribute.
 * Handles StringLiteral and JSXExpressionContainer with cn()/clsx() calls.
 */
function mergeClassName(openingElement: any, newClasses: string[]): void {
  const attr = getOrCreateClassName(openingElement);
  const classStr = newClasses.join(" ");

  if (t.isStringLiteral(attr.value)) {
    // Simple case: className="existing classes"
    const merged = deduplicateClasses(attr.value.value, newClasses);
    attr.value = t.stringLiteral(merged);
  } else if (t.isJSXExpressionContainer(attr.value)) {
    const expr = attr.value.expression;
    // Check for cn(...) or clsx(...) calls
    if (t.isCallExpression(expr) && t.isIdentifier(expr.callee) &&
        (expr.callee.name === "cn" || expr.callee.name === "clsx" || expr.callee.name === "classNames" || expr.callee.name === "twMerge")) {
      // Append our classes as a string argument
      expr.arguments.push(t.stringLiteral(classStr));
    } else if (t.isTemplateLiteral(expr)) {
      // className={`existing ${dynamic}`} → append classes
      const lastQuasi = expr.quasis[expr.quasis.length - 1];
      if (lastQuasi) {
        lastQuasi.value.raw += " " + classStr;
        lastQuasi.value.cooked = (lastQuasi.value.cooked || "") + " " + classStr;
      }
    } else {
      // Unknown expression — wrap in cn(expr, "new-classes")
      attr.value = t.jsxExpressionContainer(
        t.callExpression(t.identifier("cn"), [expr, t.stringLiteral(classStr)])
      );
    }
  } else {
    // No value — set directly
    attr.value = t.stringLiteral(classStr);
  }
}

/**
 * Replace text children of a JSXElement.
 */
function replaceTextChildren(jsxElement: any, text: string): void {
  const children = jsxElement.children;
  // Find and replace JSXText children
  let replaced = false;
  for (let i = 0; i < children.length; i++) {
    if (t.isJSXText(children[i])) {
      children[i] = t.jsxText(text);
      replaced = true;
      break;
    }
  }
  if (!replaced && children.length === 0) {
    children.push(t.jsxText(text));
  }
}

/**
 * Get only JSXElement children (skip whitespace JSXText nodes).
 */
function getElementChildren(jsxElement: any): { node: any; index: number }[] {
  const result: { node: any; index: number }[] = [];
  for (let i = 0; i < jsxElement.children.length; i++) {
    const child = jsxElement.children[i];
    if (t.isJSXElement(child) || t.isJSXFragment(child)) {
      result.push({ node: child, index: i });
    }
  }
  return result;
}

/**
 * Create a new JSXElement from a tag name, classes, and text.
 */
function createJsxElement(tagName: string, classes: string, text: string): any {
  const attrs: any[] = [];
  if (classes) {
    attrs.push(t.jsxAttribute(t.jsxIdentifier("className"), t.stringLiteral(classes)));
  }
  const children: any[] = [];
  if (text) {
    children.push(t.jsxText(text));
  }
  const opening = t.jsxOpeningElement(t.jsxIdentifier(tagName), attrs, children.length === 0);
  const closing = children.length === 0 ? null : t.jsxClosingElement(t.jsxIdentifier(tagName));
  return t.jsxElement(opening, closing, children, children.length === 0);
}

/**
 * Apply a list of edits to source code and return the modified source.
 * Falls back to returning null if parsing fails.
 */
export function applyEdits(source: string, edits: CodeEdit[]): string | null {
  let ast: any;
  try {
    ast = parseSource(source);
  } catch {
    return null; // Parse failed — caller should fall back to regex
  }

  for (const edit of edits) {
    traverse(ast, {
      JSXElement(path: any) {
        const opening = path.node.openingElement;
        if (!matchesLocation(opening, edit.line, edit.col)) return;

        if (edit.tailwindClasses && edit.tailwindClasses.length > 0) {
          mergeClassName(opening, edit.tailwindClasses);
        }

        if (edit.textContent !== undefined) {
          replaceTextChildren(path.node, edit.textContent);
        }

        if (edit.insertChild) {
          const newEl = createJsxElement(
            edit.insertChild.tagName,
            edit.insertChild.classes,
            edit.insertChild.text,
          );
          const elementChildren = getElementChildren(path.node);
          const insertAt = edit.insertChild.index;
          if (insertAt >= elementChildren.length) {
            // Append at end
            path.node.children.push(t.jsxText("\n  "));
            path.node.children.push(newEl);
            path.node.children.push(t.jsxText("\n"));
          } else {
            // Insert before the element at insertAt
            const targetIdx = elementChildren[insertAt].index;
            path.node.children.splice(targetIdx, 0, newEl, t.jsxText("\n  "));
          }
          // Ensure element is not self-closing
          if (path.node.openingElement.selfClosing) {
            path.node.openingElement.selfClosing = false;
            path.node.closingElement = t.jsxClosingElement(
              t.cloneNode(path.node.openingElement.name)
            );
          }
        }

        if (edit.removeChild) {
          const elementChildren = getElementChildren(path.node);
          const removeIdx = edit.removeChild.index;
          if (removeIdx >= 0 && removeIdx < elementChildren.length) {
            const actualIdx = elementChildren[removeIdx].index;
            // Remove element and any trailing whitespace
            path.node.children.splice(actualIdx, actualIdx + 1 < path.node.children.length && t.isJSXText(path.node.children[actualIdx + 1]) ? 2 : 1);
          }
        }

        if (edit.moveChild) {
          const elementChildren = getElementChildren(path.node);
          const { fromIndex, toIndex } = edit.moveChild;
          if (fromIndex >= 0 && fromIndex < elementChildren.length && toIndex >= 0 && toIndex <= elementChildren.length) {
            // Extract the element node
            const fromActualIdx = elementChildren[fromIndex].index;
            const movedNode = path.node.children[fromActualIdx];
            // Remove from old position
            path.node.children.splice(fromActualIdx, 1);
            // Recalculate element children after removal
            const newElementChildren = getElementChildren(path.node);
            // Insert at new position
            if (toIndex >= newElementChildren.length) {
              path.node.children.push(movedNode);
            } else {
              const toActualIdx = newElementChildren[toIndex].index;
              path.node.children.splice(toActualIdx, 0, movedNode);
            }
          }
        }

        // Don't traverse deeper once we've found our target
        path.stop();
      },
    });
  }

  try {
    const output = generate(ast, {
      retainLines: true,
      retainFunctionParens: true,
    }, source);
    return output.code;
  } catch {
    return null;
  }
}
