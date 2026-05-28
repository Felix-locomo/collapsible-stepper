# Collapsible Stepper

A space-efficient stepper pattern that shows steps as a compact horizontal row by default and expands into detailed vertical instructions on tap. Vanilla HTML, CSS, and JavaScript — no dependencies, no build step.

---

## What it's for

Stepper indicators aren't always easy to render compactly. Sometimes a single short label per step doesn't carry enough information, and the user benefits from a fuller explanation before committing to or following a process. Traditional **vertical steppers** solve this by listing every step with full text — but they eat significant vertical space. Traditional **horizontal stepper indicators** are compact but can't show much detail.

The Collapsible Stepper combines both modes in one component:

- **Compact (default)** — a single horizontal row of numbered indicators with short labels. Fits in roughly the height of a paragraph.
- **Expanded (on tap)** — the same indicators unfold vertically, each with a long label and an explanatory paragraph.

The user gets quick orientation by default and a closer look on demand. Step 1 stays anchored in the same position across both modes, so the transition feels grounded rather than disorienting.

```
Compact                          Expanded
┌─────────────────────────┐      ┌─────────────────────────┐
│ How it works         ⌄  │      │ How it works         ⌃  │
│                         │      │                         │
│  ①    ②    ③            │  ─►  │  ①  Prepare             │
│  Pr   Re   Co           │      │     Gather your info    │
└─────────────────────────┘      │     before starting.    │
                                 │                         │
                                 │  ②  Review              │
                                 │     Double-check that   │
                                 │     everything is right.│
                                 │                         │
                                 │  ③  Complete            │
                                 │     Submit and you're   │
                                 │     done.               │
                                 └─────────────────────────┘
```

### Where it works well

- Mobile **bottom sheets**, where every pixel of vertical space matters
- **Onboarding cards** inside a sidebar or compact panel
- **Multi-step form summaries** that need to fit above the fold
- **"How it works" sections** on marketing pages
- **Help panels** embedded in narrow widgets
- **Settings wizards** and configuration flows
- **FAQ-style step-by-step guides** where the reader may want to scan or dive in

Anywhere space is constrained but the user might still want a detailed look — this pattern earns its place.

---

## Quick start

Drop two files into your project and write the markup:

```html
<link rel="stylesheet" href="stepper.css">

<div class="cstepper" data-stepper data-step-count="3">
  <button type="button" class="cstepper__toggle" aria-expanded="false">
    <span class="cstepper__headline">How it works</span>
    <svg class="cstepper__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>

  <div class="cstepper__content">
    <!-- Step indicators (short labels below circles) -->
    <div class="cstepper__step-icon" data-step="1">
      <div class="cstepper__circle">1</div>
      <div class="cstepper__label-short">Prepare</div>
    </div>
    <div class="cstepper__step-icon" data-step="2">
      <div class="cstepper__circle">2</div>
      <div class="cstepper__label-short">Review</div>
    </div>
    <div class="cstepper__step-icon" data-step="3">
      <div class="cstepper__circle">3</div>
      <div class="cstepper__label-short">Complete</div>
    </div>

    <!-- Detail blocks (long labels + secondary text, shown in expanded state) -->
    <div class="cstepper__detail" data-step="1">
      <p class="cstepper__label-long">Prepare</p>
      <p class="cstepper__secondary">Gather your information before starting.</p>
    </div>
    <div class="cstepper__detail" data-step="2">
      <p class="cstepper__label-long">Review</p>
      <p class="cstepper__secondary">Double-check that everything is right.</p>
    </div>
    <div class="cstepper__detail" data-step="3">
      <p class="cstepper__label-long">Complete</p>
      <p class="cstepper__secondary">Submit and you're done.</p>
    </div>
  </div>
</div>

<script src="stepper.js"></script>
```

That's it. The `data-stepper` attribute triggers auto-initialization on `DOMContentLoaded`. Tap anywhere on the card to expand or collapse.

---

## Dynamic adaptations

The component measures itself and adjusts automatically. You don't configure any of these — they happen on construction and on every container width change (via `ResizeObserver`). All adaptations are computed in a single unified `_measureAndLayout()` pass.

### Circle size adapts to available width

Each step count has a target circle size (44 px for 1–3 steps, down to 32 px for 6 steps). If the container is narrower than the target size needs, the controller shrinks circles further — down to a 24 px floor — instead of letting them overlap. This keeps the pattern usable from roughly 280 px viewport width upward.

### Horizontal spacing follows step count

Step indicators are evenly distributed across the inner content area. When the container resizes, spacing recomputes so the rightmost indicator keeps the same distance from the right edge as the leftmost from the left. The number font inside each circle scales with the circle size for visual balance.

### Zickzack labels — only when actually needed

The controller measures the rendered width of every short label (via `offsetWidth`) and computes whether neighbouring labels would horizontally collide given the current step centers and minimum gap. If they would, even-numbered step labels (2, 4, 6) drop into a second row. If they wouldn't, all labels stay in a single row.

This means short labels with high step counts (e.g. `A B C D E F`) stay in one row, and long labels with low step counts (e.g. `Initialization`, `Confirmation`, `Finalization`) get the two-row treatment. The decision is label-driven, not step-count-driven.

### Vertical spacing in expanded mode

Each detail block can have an arbitrary length. The controller measures the `scrollHeight` of each `.cstepper__detail` and stacks the steps with a gap between them, never closer than `--cstepper-spread-v-min`. The container height grows to fit. Long descriptions on Step 1 no longer overlap Step 2; short ones don't leave awkward gaps.

### Font-load re-measurement

Web fonts load asynchronously, and label widths in the fallback font often differ from the final widths. The controller listens for `document.fonts.ready` and re-runs all measurements once fonts are loaded, so the zickzack decision and spacing are based on the final rendered text.

### Reduced motion

When the user has `prefers-reduced-motion: reduce` set, the choreography is skipped entirely and the state change is instant. All transitions in the CSS are reduced to `0.01ms` under the same media query.

### Trigger area

The pattern can be configured to be entirely clickable (the default) or only clickable through its header. Set `data-trigger="header"` on the root, or pass `{ triggerArea: 'header' }` to the constructor.

---

## Customization

All visual parameters are exposed as CSS custom properties on the `.cstepper` selector. Override them in your own stylesheet — globally, per-instance with a class, or inline via `style`:

```css
.my-themed-stepper {
  --cstepper-headline-color: #1e3a8a;
  --cstepper-step1-gradient: linear-gradient(180deg, #3b82f6, #1d4ed8);
  --cstepper-radius: 24px;
}
```

### Container

| Variable | Default | Purpose |
|----------|---------|---------|
| `--cstepper-bg` | `rgba(255,255,255,0.6)` | Container background |
| `--cstepper-border-color` | `#F2F0EC` | Border color |
| `--cstepper-border-width` | `2px` | Border thickness |
| `--cstepper-radius` | `16px` | Corner radius |
| `--cstepper-pad-x` | `20px` | Horizontal padding |
| `--cstepper-pad-y` | `16px` | Vertical padding |

### Typography

| Variable | Default | Purpose |
|----------|---------|---------|
| `--cstepper-headline-font` | `Roboto Slab, Roboto, Georgia, serif` | Headline font stack |
| `--cstepper-headline-size` | `16px` | Headline size |
| `--cstepper-headline-weight` | `500` | Headline weight |
| `--cstepper-headline-color` | `#1a1a1a` | Headline color |
| `--cstepper-label-font` | `Roboto, sans-serif` | Label font stack |
| `--cstepper-label-size` | `14px` | Label size |
| `--cstepper-label-weight` | `500` | Label weight |
| `--cstepper-label-color` | `#1a1a1a` | Label color |
| `--cstepper-secondary-size` | `14px` | Secondary text size |
| `--cstepper-secondary-weight` | `400` | Secondary text weight |
| `--cstepper-secondary-color` | `#5f5f5f` | Secondary text color |
| `--cstepper-secondary-line-height` | `1.45` | Secondary line height |

### Step indicators

| Variable | Default | Purpose |
|----------|---------|---------|
| `--cstepper-circle-size` | `44px` | Indicator diameter (auto-set by JS at runtime) |
| `--cstepper-circle-font-size` | `16px` | Number inside indicator (auto-set by JS) |
| `--cstepper-circle-font-weight` | `500` | Number weight |
| `--cstepper-circle-text-color` | `#ffffff` | Number color |
| `--cstepper-step1-gradient` | green→lime | Background for step 1 |
| `--cstepper-step2-gradient` | lime→green | Background for step 2 |
| `--cstepper-step3-gradient` | green→teal | Background for step 3 |
| `--cstepper-step4-gradient` | teal→teal | Background for step 4 |
| `--cstepper-step5-gradient` | teal→cyan | Background for step 5 |
| `--cstepper-step6-gradient` | cyan→teal | Background for step 6 |

### Layout

| Variable | Default | Purpose |
|----------|---------|---------|
| `--cstepper-anchor-x` | `12px` | Step 1's locked X position |
| `--cstepper-anchor-y` | `0px` | Step 1's locked Y position |
| `--cstepper-h-min-gap` | `8px` | Min horizontal gap between circles; JS shrinks circles below their target size to honour this |
| `--cstepper-label-min-gap` | `4px` | Min horizontal gap between labels; JS triggers zickzack if this would be violated |
| `--cstepper-label-row-offset` | `22px` | Vertical drop for zickzack lower row |
| `--cstepper-label-gap` | `16px` | Gap between indicator and detail text in expanded state |
| `--cstepper-spread-v-min` | `88px` | Floor for vertical distance between steps in expanded mode |

### Motion

Keep these in sync with the `TIMING` constants at the top of `stepper.js` if you change them. The choreography depends on the CSS and JS values matching.

| Variable | Default | Purpose |
|----------|---------|---------|
| `--cstepper-dur-fade` | `200ms` | Label fade in/out |
| `--cstepper-dur-move` | `440ms` | Indicator position transition |
| `--cstepper-dur-height` | `600ms` | Container height transition |
| `--cstepper-dur-chevron` | `300ms` | Chevron rotation |
| `--cstepper-ease` | `cubic-bezier(0.65, 0, 0.35, 1)` | Easing function |

---

## JavaScript API

The component auto-initializes on `DOMContentLoaded` for every element with the `data-stepper` attribute. You can also instantiate manually:

```js
const root = document.querySelector('.cstepper');
const stepper = new CollapsibleStepper(root, {
  triggerArea: 'container',   // 'container' (default) or 'header'
  initialExpanded: false      // start in expanded state?
});
```

### Methods

```js
stepper.expand();        // animate to expanded state
stepper.collapse();      // animate to compact state
stepper.toggle();        // toggle current state
stepper.isExpanded();    // returns true | false
stepper.relayout();      // force a re-measure (e.g. after content changes)
stepper.destroy();       // detach event listeners and the ResizeObserver
```

The `relayout()` method is the public hook for consumers who change the content of detail blocks at runtime (e.g. swap in localised text) and want the dynamic vertical layout to recompute.

### Events

The root element dispatches a `cstepper:change` `CustomEvent` (bubbling) when a state transition completes:

```js
root.addEventListener('cstepper:change', (e) => {
  console.log(e.detail.expanded); // true after expanding, false after collapsing
});
```

Because the event bubbles, you can listen on an ancestor — for example, a parent bottom sheet that resizes itself when the stepper inside it expands.

### Options

#### `triggerArea`

Where clicks toggle the state.

- `'container'` (default) — the entire pattern is clickable. Good for self-contained widgets where the stepper is the only interactive element on the card.
- `'header'` — only the header (button row) is clickable. Good when the stepper is nested inside other clickable content, or when the body of the card needs to receive its own clicks.

You can also set this declaratively via `data-trigger="header"` on the root element. The JS-passed option takes precedence over the attribute.

#### `initialExpanded`

If `true`, the component starts in expanded state. Defaults to `false`. You can also set `data-state="expanded"` on the root for the same effect.

### Re-scanning the DOM (SPAs)

After mounting new stepper markup at runtime — for example on an SPA route change — re-scan the subtree:

```js
CollapsibleStepper.init(scope);  // scope defaults to document
```

The function is idempotent: it only initializes elements that don't already have a `_cstepperInstance`. The instance is stored on the root element so you can also retrieve it later:

```js
const stepper = document.querySelector('.cstepper')._cstepperInstance;
```

---

## Markup reference

The component uses BEM naming and a small fixed set of classes. The structure is:

```
.cstepper                                  root
├── .cstepper__toggle                      header button (always)
│   ├── .cstepper__headline                title text
│   └── .cstepper__chevron                 chevron icon (rotates on expand)
└── .cstepper__content                     animated content area
    ├── .cstepper__step-icon[data-step="N"]
    │   ├── .cstepper__circle              numbered circle
    │   └── .cstepper__label-short         short label (compact state)
    └── .cstepper__detail[data-step="N"]
        ├── .cstepper__label-long          long label (expanded state)
        └── .cstepper__secondary           explanation paragraph
```

The `data-step` attribute on step icons and detail blocks must be a 1-indexed integer matching the step number. The `data-step-count` attribute on the root tells the CSS how many steps there are; if omitted, the JS auto-detects from the count of `.cstepper__step-icon` children.

State-driven classes that the JS toggles at runtime:

| Class | Meaning |
|-------|---------|
| `data-state="compact"` / `="expanded"` | Current mode |
| `is-stacking` | Mid-animation: steps 2..N collapsing onto Step 1 |
| `is-vertical` | Expanded layout active |
| `is-labels-hidden` | Mid-animation: labels faded out |
| `is-zickzack` | Two-row label layout active |
| `is-no-zickzack` | Single-row label layout confirmed by measurement |

---

## Browser support

- Modern evergreen browsers (Chrome, Edge, Firefox, Safari)
- `ResizeObserver` is required for live re-measurement on container width changes (Chrome 64+, Firefox 69+, Safari 13.1+); if absent, a single initial measurement is performed via `requestAnimationFrame`
- Source code is ES5-compatible — no transpilation needed for older runtimes

---

## Limitations

- Labels in the same zickzack row can still overlap if both are extremely long (e.g. 6 steps where every label is a long multi-word phrase). Recommended: 2–3 word labels.
- Supports 1–6 steps out of the box. To extend, add gradients and position rules for steps 7+ in `stepper.css`, and extend `TARGET_CIRCLE_SIZES` in `stepper.js`.
- All steps share the same label and detail markup pattern — there's no "vertical-only" or "compact-only" step variant.

---

## License

MIT.

---

## CDN Usage

https://cdn.jsdelivr.net/gh/Felix-locomo/collapsible-stepper@v1.0.0/stepper.css
https://cdn.jsdelivr.net/gh/Felix-locomo/collapsible-stepper@v1.0.0/stepper.js

