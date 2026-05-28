/* =============================================================================
   collapsible-stepper.js
   -----------------------------------------------------------------------------
   Universal collapsible stepper pattern — JavaScript controller.
   Vanilla JS, no dependencies, no transpilation required (ES5-compatible).
   =============================================================================

   PUBLIC API
   ----------

     new CollapsibleStepper(rootElement, options?)
        Construct a controller for a single .cstepper element.

        rootElement : HTMLElement   The .cstepper root.
        options     : Object?
          .triggerArea     : 'container' | 'header'
                             Where clicks toggle the state.
                             Default: 'container' (entire pattern is clickable).
          .initialExpanded : boolean
                             Whether to start in the expanded state.
                             Default: false (or read from data-state attribute).

     instance.expand()      Animate to expanded state.
     instance.collapse()    Animate to compact state.
     instance.toggle()      Toggle between states.
     instance.isExpanded()  Returns current state as a boolean.
     instance.relayout()    Force a re-measure (e.g. after content changes).
     instance.destroy()     Detach listeners and the ResizeObserver.

   AUTO-INITIALIZATION
   -------------------
   Every element with a [data-stepper] attribute is automatically constructed
   on DOMContentLoaded. Look up the instance via element._cstepperInstance.

   EVENTS
   ------
   The root element dispatches a 'cstepper:change' CustomEvent whenever the
   state transition completes:

     element.addEventListener('cstepper:change', function (e) {
       console.log(e.detail.expanded); // true | false
     });

   HOW IT WORKS
   ------------

   1. State transitions use a four-phase choreography orchestrated by
      setTimeout. Timings here must match the CSS --cstepper-dur-* values
      (see TIMING constant below).

   2. Unified layout function — see _measureAndLayout() below. Given the
      current container width, step count, and rendered label widths, it
      computes ALL dynamic layout values in a single pass and writes them
      back as inline custom properties / classes. Triggered on construction
      and on every width change via ResizeObserver.

      Outputs written to the root element:
        --cstepper-circle-size       indicator radius (inline CSS variable)
        --cstepper-circle-font-size  number font size (inline CSS variable)
        --cstepper-h-spacing         horizontal step-to-step distance (compact)
        --cstepper-step-N-y          vertical Y position of step N (expanded)
        --cstepper-expanded-height   total content height in expanded state
        .is-zickzack / .is-no-zickzack   label-collision-driven row state

   3. Trigger area: a single click listener is attached to either the root
      or the header button. Keyboard activation of the header button still
      bubbles up, so 'container' mode also handles keyboard input.

   4. Reduced motion: when matchMedia('(prefers-reduced-motion: reduce)')
      reports true, the controller skips the choreography and switches state
      instantly.

   ============================================================================= */

(function (global) {
  'use strict';

  /* ---------------------------------------------------------------------------
     TIMING — keep in sync with CSS --cstepper-dur-* tokens.
     If you change one, change the other.
     --------------------------------------------------------------------------- */
  var TIMING = {
    FADE_OUT_END: 200,    // labels finish fading out
    STACK_END:    640,    // steps 2..N have collapsed behind step 1
    LABELS_IN:   1080,    // long labels / secondary start fading in
    DONE:        1300     // animation fully complete, accept input again
  };

  /* ---------------------------------------------------------------------------
     LAYOUT CONSTANTS used by the unified layout function.

     TARGET_CIRCLE_SIZES — the "design choice" circle radius for each step
     count. These match the CSS [data-step-count] fallback values, so the
     visual is identical whether JS runs or not at the default container
     width. At narrower widths JS may shrink the circle further (but never
     below MIN_CIRCLE).

     FONT_RATIO — font-size is computed as ratio · circle-size so the number
     inside the circle stays visually balanced when the circle shrinks.
     --------------------------------------------------------------------------- */
  var TARGET_CIRCLE_SIZES = { 1: 44, 2: 44, 3: 44, 4: 40, 5: 36, 6: 32 };
  var MIN_CIRCLE = 24;          // absolute lower bound, narrowest viewport case
  var FONT_RATIO = 0.4;
  var MIN_FONT = 11;            // absolute lower bound on the number font

  var STEP_GAP = 16;            // pixels between a detail's bottom and the next step
  var BOTTOM_PAD = 8;           // breathing room below the last detail
  var DEFAULT_MIN_SPREAD = 88;  // fallback for --cstepper-spread-v-min
  var DEFAULT_ANCHOR_X = 12;    // fallback for --cstepper-anchor-x
  var DEFAULT_H_MIN_GAP = 8;    // fallback for --cstepper-h-min-gap
  var DEFAULT_LABEL_MIN_GAP = 4;// fallback for --cstepper-label-min-gap

  function prefersReducedMotion() {
    return !!(window.matchMedia &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ===========================================================================
     CollapsibleStepper constructor
     =========================================================================== */
  function CollapsibleStepper(root, options) {
    if (!root) {
      throw new Error('CollapsibleStepper: root element is required');
    }
    options = options || {};

    this.root = root;
    this.toggleEl = root.querySelector('.cstepper__toggle');
    if (!this.toggleEl) {
      throw new Error('CollapsibleStepper: .cstepper__toggle not found inside root');
    }

    this._busy = false;
    this._expanded = false;
    this._timers = [];
    this._prevWidth = 0;
    this._destroyed = false;

    /* --- Trigger area --- */
    // Priority: explicit option > data-trigger attribute > 'container' default.
    this.triggerArea = options.triggerArea
                    || root.dataset.trigger
                    || 'container';
    // Reflect onto the DOM so the CSS can adjust cursor styles.
    root.dataset.trigger = this.triggerArea;

    /* --- Step count auto-detection --- */
    // If the author hasn't set data-step-count, count the .cstepper__step-icon
    // children. Explicit is preferred (CSS [data-step-count] rules only fire
    // on the explicit attribute), but this fallback prevents misconfiguration.
    if (!root.dataset.stepCount) {
      var count = root.querySelectorAll('.cstepper__step-icon').length;
      if (count > 0) {
        root.dataset.stepCount = String(count);
      }
    }

    /* --- Click handler binding --- */
    this._onTriggerClick = onTriggerClick.bind(this);
    this._triggerEl = (this.triggerArea === 'container') ? this.root : this.toggleEl;
    this._triggerEl.addEventListener('click', this._onTriggerClick);

    /* --- ResizeObserver for dynamic layout --- */
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(onResize.bind(this));
      this._ro.observe(this.root);
    } else {
      // Fallback: measure once after the next paint. Without RO we won't
      // re-measure on viewport changes, but a single pass is usually enough
      // for static content.
      var self = this;
      requestAnimationFrame(function () {
        if (!self._destroyed) self._measureAndLayout();
      });
    }

    /* --- Font-load re-measurement --- */
    // Web fonts load asynchronously. After fallback fonts render, label
    // widths may differ from final widths once the real font is applied.
    // We re-measure once fonts.ready resolves to catch this.
    var self2 = this;
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(function () {
        if (!self2._destroyed) self2._measureAndLayout();
      });
    }

    /* --- Initial state --- */
    var startExpanded = options.initialExpanded === true
                     || root.dataset.state === 'expanded';
    this._setStateImmediate(startExpanded);
  }

  /* ---------------------------------------------------------------------------
     Event handlers
     --------------------------------------------------------------------------- */
  function onTriggerClick(/* event */) {
    // Plain delegation — toggle() handles the busy-guard internally.
    this.toggle();
  }

  function onResize(entries) {
    // Re-layout only when width changes (height changes are our own work).
    // The 0.5px tolerance prevents subpixel jitter from causing thrashing.
    for (var i = 0; i < entries.length; i++) {
      var newWidth = entries[i].contentRect.width;
      if (Math.abs(newWidth - this._prevWidth) > 0.5) {
        this._prevWidth = newWidth;
        this._measureAndLayout();
      }
    }
  }

  /* ---------------------------------------------------------------------------
     Internal helpers
     --------------------------------------------------------------------------- */

  CollapsibleStepper.prototype._setStateImmediate = function (expanded) {
    // Skip the choreography — used on construct and for reduced-motion users.
    this._expanded = expanded;
    this.root.dataset.state = expanded ? 'expanded' : 'compact';
    this.root.classList.toggle('is-vertical', expanded);
    this.toggleEl.setAttribute('aria-expanded', String(expanded));
  };

  CollapsibleStepper.prototype._clearTimers = function () {
    for (var i = 0; i < this._timers.length; i++) {
      clearTimeout(this._timers[i]);
    }
    this._timers.length = 0;
  };

  CollapsibleStepper.prototype._emitChange = function () {
    // Bubble so consumers can listen on ancestors (e.g. a parent bottom sheet
    // that resizes itself when the stepper expands).
    var evt;
    try {
      evt = new CustomEvent('cstepper:change', {
        detail: { expanded: this._expanded },
        bubbles: true
      });
    } catch (e) {
      // IE 11 fallback (very unlikely needed in 2026, but cheap to include).
      evt = document.createEvent('CustomEvent');
      evt.initCustomEvent('cstepper:change', true, false, { expanded: this._expanded });
    }
    this.root.dispatchEvent(evt);
  };

  /* ===========================================================================
     UNIFIED LAYOUT FUNCTION
     -----------------------------------------------------------------------------
     Single source of truth for all dynamic layout values.

     Inputs (read from DOM / computed styles):
       - container content width  (getBoundingClientRect on .cstepper__content)
       - step count               (count of .cstepper__step-icon children)
       - rendered label widths    (offsetWidth of each .cstepper__label-short)
       - detail block heights     (scrollHeight of each .cstepper__detail)
       - tokens: --cstepper-anchor-x, --cstepper-h-min-gap,
                 --cstepper-label-min-gap, --cstepper-spread-v-min

     Outputs (written as inline custom properties / classes on the root):
       Compact mode:
         --cstepper-circle-size
         --cstepper-circle-font-size
         --cstepper-h-spacing
         .is-zickzack / .is-no-zickzack  (mutually exclusive)
       Expanded mode:
         --cstepper-step-1-y .. --cstepper-step-N-y
         --cstepper-expanded-height

     Algorithm:
       1. Read tokens and content width.
       2. Compute compact circle size:
            target = TARGET_CIRCLE_SIZES[stepCount]
            maxFitting = (innerWidth − (n−1)·minGap) / n
            circle = clamp(MIN_CIRCLE, min(target, floor(maxFitting)), target)
       3. Font size: round(circle · FONT_RATIO), clamped to MIN_FONT
       4. h-spacing: (innerWidth − circle) / (n − 1)
       5. Zickzack decision: measure each label's offsetWidth, compute step
          centers, check if any neighbouring pair would overlap given
          labelMinGap padding. Set class accordingly.
       6. Step Y positions: cumulative sum of max(minSpread, prevDetail.h + gap)
       7. Total expanded height: lastY + lastDetail.h + bottomPad

     Called on:
       - First ResizeObserver fire (immediately after observe())
       - Every container width change (>0.5px)
       - document.fonts.ready
       - Public relayout()
     =========================================================================== */
  CollapsibleStepper.prototype._measureAndLayout = function () {
    if (this._destroyed) return;

    var stepIcons = this.root.querySelectorAll('.cstepper__step-icon');
    var details   = this.root.querySelectorAll('.cstepper__detail');
    var n = stepIcons.length;
    if (n === 0) return;

    var styles  = getComputedStyle(this.root);
    var anchorX     = parseFloat(styles.getPropertyValue('--cstepper-anchor-x'))      || DEFAULT_ANCHOR_X;
    var minGap      = parseFloat(styles.getPropertyValue('--cstepper-h-min-gap'))     || DEFAULT_H_MIN_GAP;
    var labelMinGap = parseFloat(styles.getPropertyValue('--cstepper-label-min-gap')) || DEFAULT_LABEL_MIN_GAP;
    var minSpread   = parseFloat(styles.getPropertyValue('--cstepper-spread-v-min'))  || DEFAULT_MIN_SPREAD;

    // --- Compact horizontal layout (circle size + spacing + font) ---------
    var content = this.root.querySelector('.cstepper__content');
    if (!content) return;
    var contentW = content.getBoundingClientRect().width;
    if (contentW <= 0) return;   // element not laid out yet

    var innerW = contentW - 2 * anchorX;
    var target = TARGET_CIRCLE_SIZES[n] || MIN_CIRCLE;

    // Largest circle that still leaves at least minGap between adjacent
    // indicators:  n·circle + (n-1)·minGap <= innerW
    //   →  circle <= (innerW − (n-1)·minGap) / n
    // We floor() so we never overflow by a sub-pixel rounding error.
    var maxFitting = (innerW - (n - 1) * minGap) / n;
    var circle = Math.min(target, Math.floor(maxFitting));
    circle = Math.max(circle, MIN_CIRCLE);

    // Font size scales with circle size so the digit stays balanced.
    var fontSize = Math.max(MIN_FONT, Math.round(circle * FONT_RATIO));

    // Horizontal step-to-step distance (between step left edges).
    // For a single step, no spacing is needed.
    var hSpacing = n > 1 ? (innerW - circle) / (n - 1) : 0;

    this.root.style.setProperty('--cstepper-circle-size',      circle   + 'px');
    this.root.style.setProperty('--cstepper-circle-font-size', fontSize + 'px');
    this.root.style.setProperty('--cstepper-h-spacing',        hSpacing + 'px');

    // --- Zickzack decision: measure labels, check for collision -----------
    // Walk each adjacent pair of labels. If their bounding boxes (centered
    // on the step) overlap (with labelMinGap padding), we need two rows.
    var needsZickzack = false;
    if (n >= 2) {
      // Pre-measure all label widths in one pass to minimise layout thrash.
      var widths = [];
      for (var k = 0; k < n; k++) {
        var labelEl = stepIcons[k].querySelector('.cstepper__label-short');
        // offsetWidth works on the absolutely-positioned element with
        // white-space:nowrap — gives the natural rendered text width.
        // Returns 0 if the element is missing.
        widths.push(labelEl ? labelEl.offsetWidth : 0);
      }
      for (var z = 1; z < n; z++) {
        // Step center = anchorX + (stepIndex)·hSpacing + circle/2
        // (stepIndex is 0-based; we compare step z with step z-1.)
        var centerPrev = anchorX + (z - 1) * hSpacing + circle / 2;
        var centerCurr = anchorX +  z      * hSpacing + circle / 2;
        var rightEdgePrev = centerPrev + widths[z - 1] / 2 + labelMinGap;
        var leftEdgeCurr  = centerCurr - widths[z]     / 2 - labelMinGap;
        if (rightEdgePrev > leftEdgeCurr) {
          needsZickzack = true;
          break;
        }
      }
    }
    // Mutually exclusive classes — explicit ON / OFF so CSS specificity
    // is unambiguous regardless of the [data-step-count] fallback rules.
    this.root.classList.toggle('is-zickzack',    needsZickzack);
    this.root.classList.toggle('is-no-zickzack', !needsZickzack);

    // --- Vertical layout (expanded mode) ----------------------------------
    // Step 1 sits at y = 0. Each subsequent step sits below the previous
    // one's detail block (or at minSpread if the detail is short).
    var positions = [0];
    for (var i = 1; i < n; i++) {
      var prevDetail = details[i - 1];
      // scrollHeight reflects the natural content height even though the
      // detail element is absolutely positioned with opacity:0 in compact mode.
      var prevHeight = prevDetail ? prevDetail.scrollHeight : 0;
      var spacing = Math.max(minSpread, prevHeight + STEP_GAP);
      positions.push(positions[i - 1] + spacing);
    }
    for (var j = 0; j < positions.length; j++) {
      this.root.style.setProperty(
        '--cstepper-step-' + (j + 1) + '-y',
        positions[j] + 'px'
      );
    }

    // Total expanded height = last step's Y + that step's content height
    // + a small bottom padding.
    var lastDetail = details[details.length - 1];
    var lastHeight = lastDetail ? lastDetail.scrollHeight : circle;
    var total = positions[positions.length - 1] + lastHeight + BOTTOM_PAD;
    this.root.style.setProperty('--cstepper-expanded-height', total + 'px');
  };

  /* ---------------------------------------------------------------------------
     Choreographed transition. Should only be called by toggle/expand/collapse,
     which set _busy = true before calling.
     --------------------------------------------------------------------------- */
  CollapsibleStepper.prototype._animateTo = function (target) {
    var self = this;

    if (prefersReducedMotion()) {
      // Skip the four-phase choreography entirely.
      this._setStateImmediate(target);
      this._busy = false;
      this._emitChange();
      return;
    }

    this._clearTimers();
    this.root.classList.add('is-labels-hidden');

    if (target === true) {
      /* ---- compact → expanded ---- */
      this._timers.push(setTimeout(function () {
        self.root.classList.add('is-stacking');
        self.root.dataset.state = 'expanded';
      }, TIMING.FADE_OUT_END));

      this._timers.push(setTimeout(function () {
        self.root.classList.remove('is-stacking');
        self.root.classList.add('is-vertical');
      }, TIMING.STACK_END));

      this._timers.push(setTimeout(function () {
        self.root.classList.remove('is-labels-hidden');
      }, TIMING.LABELS_IN));

      this._timers.push(setTimeout(function () {
        self._busy = false;
        self._expanded = true;
        self.toggleEl.setAttribute('aria-expanded', 'true');
        self._emitChange();
      }, TIMING.DONE));
    } else {
      /* ---- expanded → compact ---- */
      this._timers.push(setTimeout(function () {
        self.root.classList.remove('is-vertical');
        self.root.classList.add('is-stacking');
        self.root.dataset.state = 'compact';
      }, TIMING.FADE_OUT_END));

      this._timers.push(setTimeout(function () {
        self.root.classList.remove('is-stacking');
      }, TIMING.STACK_END));

      this._timers.push(setTimeout(function () {
        self.root.classList.remove('is-labels-hidden');
      }, TIMING.LABELS_IN));

      this._timers.push(setTimeout(function () {
        self._busy = false;
        self._expanded = false;
        self.toggleEl.setAttribute('aria-expanded', 'false');
        self._emitChange();
      }, TIMING.DONE));
    }
  };

  /* ---------------------------------------------------------------------------
     Public API
     --------------------------------------------------------------------------- */

  CollapsibleStepper.prototype.expand = function () {
    if (this._busy || this._expanded || this._destroyed) return;
    this._busy = true;
    this._animateTo(true);
  };

  CollapsibleStepper.prototype.collapse = function () {
    if (this._busy || !this._expanded || this._destroyed) return;
    this._busy = true;
    this._animateTo(false);
  };

  CollapsibleStepper.prototype.toggle = function () {
    if (this._busy || this._destroyed) return;
    this._busy = true;
    this._animateTo(!this._expanded);
  };

  CollapsibleStepper.prototype.isExpanded = function () {
    return this._expanded;
  };

  CollapsibleStepper.prototype.relayout = function () {
    // Public hook for consumers who programmatically change the content
    // of detail blocks and want the dynamic layout to update.
    this._measureAndLayout();
  };

  CollapsibleStepper.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    this._clearTimers();
    if (this._triggerEl) {
      this._triggerEl.removeEventListener('click', this._onTriggerClick);
    }
    if (this._ro) {
      this._ro.disconnect();
    }
    if (this.root && this.root._cstepperInstance === this) {
      this.root._cstepperInstance = null;
    }
    this.root = null;
    this.toggleEl = null;
    this._triggerEl = null;
  };

  /* ---------------------------------------------------------------------------
     Auto-initialization
     --------------------------------------------------------------------------- */
  function autoInit(scope) {
    var roots = (scope || document).querySelectorAll('[data-stepper]');
    for (var i = 0; i < roots.length; i++) {
      if (!roots[i]._cstepperInstance) {
        roots[i]._cstepperInstance = new CollapsibleStepper(roots[i]);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { autoInit(); });
  } else {
    autoInit();
  }

  /* ---------------------------------------------------------------------------
     Exports
     --------------------------------------------------------------------------- */
  global.CollapsibleStepper = CollapsibleStepper;
  // Scope-bare convenience initializer so consumers can re-scan a subtree
  // after mounting stepper markup (e.g. in SPA route changes).
  global.CollapsibleStepper.init = autoInit;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CollapsibleStepper;
  }
})(typeof window !== 'undefined' ? window : this);
