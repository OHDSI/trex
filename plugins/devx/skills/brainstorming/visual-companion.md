# Visual Companion Guide (trex-dx variant)

Visual brainstorming for showing mockups, diagrams, and options to the user. In trex-dx, the running app's dev-server proxy already serves the project filesystem, so we don't run a separate companion server — we write self-contained HTML files into the project's `prototypes/<screen-name>/index.html` and the user views them via the **Prototypes** dropdown in the right-hand Preview panel.

## When to Use

Decide per-question, not per-session. The test: **would the user understand this better by seeing it than reading it?**

**Use a visual screen** when the content itself is visual:

- **UI mockups** — wireframes, layouts, navigation structures, component designs
- **Architecture diagrams** — system components, data flow, relationship maps
- **Side-by-side visual comparisons** — comparing two layouts, two color schemes, two design directions
- **Design polish** — when the question is about look and feel, spacing, visual hierarchy
- **Spatial relationships** — state machines, flowcharts, entity relationships rendered as diagrams

**Stay in chat** when the content is text or tabular:

- **Requirements and scope questions** — "what does X mean?", "which features are in scope?"
- **Conceptual A/B/C choices** — picking between approaches described in words
- **Tradeoff lists** — pros/cons, comparison tables
- **Technical decisions** — API design, data modeling, architectural approach selection
- **Clarifying questions** — anything where the answer is words, not a visual preference

A question *about* a UI topic is not automatically a visual question. "What kind of wizard do you want?" is conceptual — stay in chat. "Which of these wizard layouts feels right?" is visual — push a screen.

## How It Works

For each visual question, the assistant writes one self-contained HTML file to:

```
<app workspace>/prototypes/<screen-name>/index.html
```

The trex-dx Preview panel's **Prototypes** dropdown lists every `prototypes/*/index.html` in the workspace. Selecting one swaps the iframe `src` to that file (via the existing app proxy). No extra server, no extra port. The user picks a screen-name → views it → tells the assistant in chat which option they liked.

There is no server-side click-capture in this setup — treat the chat message as the full user response.

## Writing a Screen

Use the Write tool to produce a complete HTML document. The simplest reliable approach is to read the frame template from `scripts/frame-template.html` once and replace the `<!-- CONTENT -->` placeholder with your screen content.

The frame template provides:
- OS-aware light/dark theming via `prefers-color-scheme`
- Fixed header, scrollable main area, footer indicator bar
- A self-contained `toggleSelect(this)` JS helper (visual highlight only — no network)
- CSS helpers for common patterns (see "CSS Classes Available" below)

**Naming:**
- Use semantic screen names: `platform`, `visual-style`, `homepage-layout`. The dropdown lists them as you write them.
- Each question gets its own screen — `prototypes/visual-style/index.html`, `prototypes/homepage-layout/index.html`, etc. Don't reuse one file across questions; you want history in the dropdown.
- If you're iterating on the same question, use a versioned name: `homepage-layout-v2`.

## The Loop

1. **Write the screen.** Use the Write tool to put a complete HTML document at `prototypes/<screen-name>/index.html`. Start from `scripts/frame-template.html`: read it, substitute the `<!-- CONTENT -->` block with your content fragment, write the result.

2. **Tell the user in chat (one short line):**
   > Pushed `<screen-name>` — open the **Prototypes** dropdown in the Preview panel and pick it. Let me know which option works for you.

3. **End your turn.** Wait for the user's reply.

4. **On the next turn**, read the user's chat message as the answer. There is no events file to read in trex-dx mode.

5. **Iterate or advance:** if feedback means rework, write `prototypes/<screen-name>-v2/index.html` (do not overwrite — keep history available in the dropdown). When the question is settled, move to the next screen.

6. **No cleanup needed.** The files live in `prototypes/` in the project; they're persistent and can be revisited. If you want them out of version control, add `prototypes/` to `.gitignore`.

## Writing Content Fragments

Drop your content into the `<!-- CONTENT -->` slot of the frame template. No `<html>`, no `<head>`, no extra CSS or `<script>` tags needed — the template supplies all of that.

**Minimal example (after substitution into the template):**

```html
<h2>Which layout works better?</h2>
<p class="subtitle">Consider readability and visual hierarchy</p>

<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>Single Column</h3>
      <p>Clean, focused reading experience</p>
    </div>
  </div>
  <div class="option" data-choice="b" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>Two Column</h3>
      <p>Sidebar navigation with main content</p>
    </div>
  </div>
</div>
```

## CSS Classes Available

The frame template provides these CSS classes for your content:

### Options (A/B/C choices)

```html
<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>Title</h3>
      <p>Description</p>
    </div>
  </div>
</div>
```

**Multi-select:** Add `data-multiselect` to the container to let users select multiple options. Each click toggles the item. The indicator bar shows what's currently selected.

```html
<div class="options" data-multiselect>
  <!-- same option markup — users can select/deselect multiple -->
</div>
```

### Cards (visual designs)

```html
<div class="cards">
  <div class="card" data-choice="design1" onclick="toggleSelect(this)">
    <div class="card-image"><!-- mockup content --></div>
    <div class="card-body">
      <h3>Name</h3>
      <p>Description</p>
    </div>
  </div>
</div>
```

### Mockup container

```html
<div class="mockup">
  <div class="mockup-header">filename.html — preview</div>
  <div class="mockup-body">
    <!-- your mockup -->
  </div>
</div>
```

### Split view (side-by-side)

```html
<div class="split">
  <div><!-- left --></div>
  <div><!-- right --></div>
</div>
```

### Pros / Cons

```html
<div class="pros-cons">
  <div class="pros">
    <h4>Pros</h4>
    <ul><li>Fast</li><li>Simple</li></ul>
  </div>
  <div class="cons">
    <h4>Cons</h4>
    <ul><li>Limited features</li></ul>
  </div>
</div>
```

### Mock elements (wireframe building blocks)

- `.mock-nav` — colored top nav bar
- `.mock-sidebar` — neutral sidebar block
- `.mock-content` — content well
- `.mock-button` — accent-colored button block
- `.mock-input` — input box block
- `.placeholder` — dashed-border "image goes here" tile

### Typography / structure

- `h2`, `h3`, `.subtitle`, `.label`, `.section` — heading/section helpers

## Design Tips

- One question per screen — don't combine "what platform?" and "what layout?" into one file.
- Realistic content, not lorem ipsum.
- Use the `.subtitle` class for the secondary line under the heading.
- Match the upstream brainstorming-skill voice: terse, no marketing copy.
- For comparison screens, lean on `.split` or `.cards`, not `.options`.

## File Naming

- `prototypes/<screen-name>/index.html`
- Slug-style names (`homepage-layout`, not `Homepage Layout`).
- Iteration suffixes (`-v2`, `-v3`) — don't overwrite previous versions; the dropdown is the user's history.

## Cleaning Up

Nothing to stop, no server to kill. If a project needs the screens gone, `rm -rf prototypes/`. If they should never have been committed, add `prototypes/` to `.gitignore`.

## Reference

- Frame template (read this, don't modify casually): `scripts/frame-template.html`
