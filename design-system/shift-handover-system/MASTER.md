# Shift Handover System — UI design system

## Product and scope

An industrial logbook for a small GT1/GT2/ST operations team using desktop and
phone browsers. The overview prioritizes current conditions, important alerts
and unfinished work; entry, handover and history remain separate action pages.
This visual refresh preserves those routes, forms, permissions and workflows.

The direction is minimal, calm and readable: cool gray surfaces, indigo actions,
consistent spacing, clear typography and restrained interaction feedback.

## Design evidence

Applied [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/4f2dbb67e64969a9a30ab00742f2d55d66ddec2b/.claude/skills/ui-ux-pro-max/SKILL.md)
from its official source, pinned at `4f2dbb67e64969a9a30ab00742f2d55d66ddec2b`.
The skill was read and its bundled Python search was used for these concerns:

- `industrial operations handover dashboard --design-system --variance 3 --density 7`
- `internal operations dashboard --design-system --variance 3 --density 7`
- `hover reduced motion performance --domain ux`
- `memo rerender interactions --stack react`

The returned Minimalism/Swiss style fits the existing dashboard and has a low
effect cost. Reduced-motion, hover-versus-tap and visible-feedback results were
applicable. The React guidance supports measured optimization rather than blanket
memoization. The web quick reference was reviewed for contrast, input semantics,
keyboard use, focus, responsive layout and performance.

Both design-system searches returned a marketing hero/CTA layout. No verified
dashboard layout match was found, so that pattern was discarded. This document
is the project-specific synthesis of applicable guidance and user preferences,
not a persisted copy of that generated layout. The user-selected gray/indigo
direction overrides stock green/orange palette suggestions. Existing system
fonts are retained instead of downloading the suggested Fira font families.

## Shared tokens

`frontend/styles.css` is the implementation source. Components use semantic
tokens rather than defining new per-screen colors.

| Role | Light | Dark |
| --- | --- | --- |
| Page | `#e7ebf1` | `#111827` |
| Surface | `#f5f7fa` | `#1a2230` |
| Field | `#f8fafc` | `#202b3c` |
| Text | `#172033` | `#e5eaf2` |
| Secondary text | `#526176` | `#b4bfd0` |
| Accent | `#4f46e5` | `#a5b4fc` |
| Text on accent | `#ffffff` | `#172033` |
| Accent hover | `#4338ca` | `#c7d2fe` |
| Accent pressed | `#3730a3` | `#818cf8` |
| Control boundary | `#64748b` | `#94a3b8` |
| Focus | `#4f46e5` | `#a5b4fc` |

Green remains a semantic active/success/freshness signal, including the date dot.
Amber marks attention and important work; red marks errors. Status text remains
visible alongside color. Important-card borders remain amber during hover.
Indigo dark surfaces group the login story and shift controls.

Controls use 10px corners, cards 14px and panels 16px. Elevation uses small static
shadows. Keep meaningful text readable at normal and enlarged browser settings;
use tabular numbers for operational counts and data columns. Preserve existing
mobile field sizes, 44px touch targets and keyboard-safe dialogs/navigation.

## Interaction and motion

- Primary/secondary controls have explicit theme-aware hover and pressed colors.
  Existing semantic `disabled` states receive no hover motion.
- Hover styles require `(hover:hover) and (pointer:fine)`. Touch feedback uses
  pressed colors and a theme-aware native tap highlight; actions are available
  through ordinary click/tap and keyboard. Native highlight rendering is owned by
  the browser, so physical-device behavior must not be inferred from a headless
  held-touch screenshot alone.
- Only actionable observation cards lift 2px. Counters and equipment articles
  stay still. A small decorative chevron reinforces record drill-down.
- Button press displacement is 1px on a fine pointer. Movement requires
  `prefers-reduced-motion:no-preference`; color feedback remains available with
  reduced motion, without transitions. Positional transforms used to center
  password/theme controls are structural and remain intact.
- Feedback duration is 150ms; the existing incoming-page transition is 200ms.
  Both use a shared easing token. Navigation/data loading is immediate and does
  not wait for animation completion.
- Animate transform/opacity and small control-color changes. Keep shadows static;
  do not add layout-property animation, permanent layer hints, hover JavaScript,
  remote fonts, animation libraries or decorative blur.

## Validation

Retain existing tests for forms, drafts, theme prepaint, language controls,
contrast, responsive layouts and navigation. Add behavioral coverage for keyboard
activation, fine-pointer hover, static information cards, touch feedback and
reduced motion. Measure initial/revisit startup with routing disabled; any mocked
API navigation measurement must be labeled as client-only. Compare generated
payloads and verify the browser still reuses versioned assets on repeat visits.

Store dated screenshots and measurement results separately from this source of
design decisions. Generated `public/` output is rebuilt rather than edited.
