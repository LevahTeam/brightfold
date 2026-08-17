# QT Passport — UI Design System

**Version** 1.0 · **Date** 2026-08-14 · **Status** Ready for developer handoff
**Companion file** `/Users/samuelha/Desktop/Volunteer/design/tokens.css` (all values below exist as CSS custom properties there)

---

## 0. What this system is for

QT Passport replaces a paper + Google Sheets pipeline at a church's 4th–6th grade Sunday service. A teacher photographs a paper attendance sheet; the app extracts each kid's name, attendance, and QT pages (Bible reading pages completed), stores it, and prints point cards the kids physically hold.

Two very different audiences, and the system serves both without splitting into two languages:

| Audience | Surface | Priority |
| --- | --- | --- |
| One volunteer + one pastor, admin/data entry, **usually on a phone**, often mid-service | The web app | Speed, thumb reach, error recovery, legibility of dense numeric data |
| 4th–6th graders and their teachers | The **printed card** | Feels special, survives a backpack, reads at arm's length, cheap to print |

### Design principles

1. **Ceremonial, not childish.** The reference is a passport, a library card, a field journal — objects that confer status. No rounded cartoon mascots, no rainbow gradients, no confetti. A 6th grader is insulted by a design aimed at a 6-year-old.
2. **Paper first.** Surfaces are parchment with hairline rules and soft, warm shadows. Nothing floats on a Material-style z-axis; things rest on a desk.
3. **The stamp is the reward.** The passport-stamp badge showing total pages is the single loudest element on any card. Everything else is quieter than it.
4. **Data density is a feature, decoration is not.** The Records screen is a spreadsheet and should look like a well-set one — tabular numerals, tight rows, real gridlines.
5. **Never color-alone.** Here/Absent, edited cells, and low-confidence cells all carry a glyph or text label in addition to color.

---

## 1. Color

### 1.1 Primitive ramps

Every value is a token in `tokens.css`. Components must consume the **semantic aliases** in §1.3, never these ramps directly, or dark mode breaks.

#### Parchment — surfaces, page ground

| Token | Hex | Use |
| --- | --- | --- |
| `--parchment-50` | `#FDFBF6` | Card / raised paper |
| `--parchment-100` | `#F8F3E7` | Page ground |
| `--parchment-200` | `#F1E9D6` | Sunken wells, table header, zebra stripe |
| `--parchment-300` | `#E7DCC2` | Inset (stepper track), disabled fills |
| `--parchment-400` | `#D8C9A8` | Decorative hairlines, table gridlines |
| `--parchment-500` | `#C4B189` | Card edges, heavier rules |

#### Moss — primary brand green

| Token | Hex | Use |
| --- | --- | --- |
| `--moss-50` | `#F0F4EC` | Selected row, edited-cell wash |
| `--moss-100` | `#DEE7D6` | "Here" chip background |
| `--moss-200` | `#BFCFB0` | Subtle border on tinted surfaces |
| `--moss-300` | `#97AE83` | Dark-mode text green |
| `--moss-400` | `#6F8A5B` | Chip borders, dark-mode fills |
| `--moss-500` | `#55703F` | **Primary action fill** |
| `--moss-600` | `#445A33` | Primary hover; green text on parchment |
| `--moss-700` | `#35471F` | Primary active; deep green text, stamp ink |
| `--moss-800` | `#24301A` | — |
| `--moss-900` | `#16200F` | — |

#### Gold — ceremonial accent, stamps, seals

| Token | Hex | Use |
| --- | --- | --- |
| `--gold-50` | `#FDF6E3` | Stamp interior, accent wash |
| `--gold-100` | `#F8E9C2` | Accent chip fill |
| `--gold-200` | `#F0D492` | Accent fill (hover) |
| `--gold-300` | `#E3BC63` | **Accent fill** — always with ink-900 text |
| `--gold-400` | `#D0A23C` | Inner stamp ring |
| `--gold-500` | `#B4862A` | Metallic mid — **decorative / non-text only** |
| `--gold-600` | `#8A6217` | **Accent text** (AA on parchment) |
| `--gold-700` | `#6F4E15` | Print accent |
| `--gold-800` / `--gold-900` | `#4C350F` / `#2E2009` | Deep accents |

> **Gold rule:** `--gold-500` on parchment is 2.97:1 — it fails AA for text. Use it for rings, rules, and seals only. Gold *text* is always `--gold-600`. White is never placed on gold (3.29:1); gold fills take `--ink-900`.

#### Ink — warm near-black text ramp

| Token | Hex | On `--parchment-100` | Verdict |
| --- | --- | --- | --- |
| `--ink-950` | `#12100C` | 16.8:1 | Dark-mode text-on-light-fill |
| `--ink-900` | `#201B14` | **15.44:1** | Primary text — AAA |
| `--ink-800` | `#3A3128` | 10.9:1 | Headings on tinted fills |
| `--ink-700` | `#55493C` | **7.89:1** | Secondary text — AAA |
| `--ink-600` | `#6E6153` | **5.42:1** | Muted text / placeholders — AA. **Lowest value permitted for text under 24px.** |
| `--ink-500` | `#8A7C6C` | 3.66:1 | **Non-text only** — icons, borders, ≥24px display text |
| `--ink-400` | `#A99C8B` | 2.2:1 | Decorative rules only, never any text |

#### Brick (danger) and Amber (warning / low confidence)

| Token | Hex | Use |
| --- | --- | --- |
| `--brick-50` | `#FBEBE6` | Danger surface |
| `--brick-500` | `#A3341F` | Danger fill (white text, 6.84:1) |
| `--brick-600` | `#8C2B19` | Danger text on parchment (7.66:1), fill hover |
| `--brick-700` | `#6E2112` | Danger active |
| `--amber-50` | `#FBEFD2` | Low-confidence cell wash |
| `--amber-100` | `#F5E0AE` | Warning chip |
| `--amber-500` | `#C8890F` | Warning border / dashed cell outline |
| `--amber-600` | `#A66E0D` | Warning icon fill |
| `--amber-700` | `#8A5A0B` | Warning text (5.35:1 on parchment, 5.18:1 on amber-50) |

### 1.2 Contrast audit — light mode

All pairs below are measured with the WCAG 2.x relative-luminance formula. **Every text pair in the system meets AA (4.5:1); most exceed AAA (7:1).**

| Foreground | Background | Ratio | Requirement | Result |
| --- | --- | --- | --- | --- |
| `--ink-900` `#201B14` | page `#F8F3E7` | 15.44:1 | 4.5 | AAA |
| `--ink-900` | card `#FDFBF6` | 16.53:1 | 4.5 | AAA |
| `--ink-900` | table header `#F1E9D6` | 14.14:1 | 4.5 | AAA |
| `--ink-700` `#55493C` | page | 7.89:1 | 4.5 | AAA |
| `--ink-700` | inset `#E7DCC2` | 6.41:1 | 4.5 | AA |
| `--ink-600` `#6E6153` | page | 5.42:1 | 4.5 | AA |
| `--ink-600` | sunken `#F1E9D6` | 4.97:1 | 4.5 | AA |
| white | primary `#55703F` | 5.56:1 | 4.5 | AA |
| white | primary hover `#445A33` | 7.62:1 | 4.5 | AAA |
| `--moss-600` `#445A33` | page | 6.88:1 | 4.5 | AA |
| `--moss-700` `#35471F` | "Here" chip `#DEE7D6` | 7.97:1 | 4.5 | AAA |
| `--moss-700` | edited cell `#F0F4EC` | 9.10:1 | 4.5 | AAA |
| `--gold-600` `#8A6217` | page | 4.94:1 | 4.5 | AA |
| `--gold-600` | card | 5.29:1 | 4.5 | AA |
| `--ink-900` | gold fill `#E3BC63` | 9.48:1 | 4.5 | AAA |
| `--amber-700` `#8A5A0B` | low-conf cell `#FBEFD2` | 5.18:1 | 4.5 | AA |
| `--amber-700` | page | 5.35:1 | 4.5 | AA |
| `--brick-600` `#8C2B19` | page | 7.66:1 | 4.5 | AAA |
| `--brick-600` | danger surface `#FBEBE6` | 7.33:1 | 4.5 | AAA |
| white | danger fill `#A3341F` | 6.84:1 | 4.5 | AA |
| white | toast `#2B2A20` | 14.44:1 | 4.5 | AAA |
| focus ring `#2A5E3D` | page | 6.85:1 | 3.0 (non-text) | Pass |
| border-strong `#8F7C55` | card | 3.92:1 | 3.0 (UI component) | Pass |
| border-strong | page | 3.66:1 | 3.0 | Pass |
| `--moss-500` (control fill) | card | 5.38:1 | 3.0 | Pass |

**Non-conformant pairs, documented so nobody reaches for them:** `--gold-500` on parchment (2.97:1), white on `--gold-500` (3.29:1), `--ink-500` on parchment (3.66:1), `--parchment-400` on card (1.58:1). The first three are legal for non-text or ≥24px display text; `--parchment-400` is decorative gridline only and is never the sole indicator of anything.

### 1.3 Semantic tokens

Components reference only these. Full list in `tokens.css` §4; the load-bearing ones:

```
--surface-page   --surface-card   --surface-sunken   --surface-inset
--surface-hover  --surface-active --surface-selected --surface-overlay
--text-primary   --text-secondary --text-muted       --text-on-primary
--text-on-accent --text-link      --text-accent
--border-subtle  --border-default --border-strong    --border-focus  --border-accent
--color-primary  --color-primary-hover  --color-primary-active  --color-primary-subtle
--color-accent   --color-accent-strong  --color-accent-text
--status-here-*  --status-absent-*  --status-success-*  --status-warning-*  --status-danger-*
--cell-edited-*  --cell-lowconf-*   --cell-error-*     --cell-readonly-bg
--focus-ring-color --focus-ring-width --focus-ring-offset --focus-ring-halo
```

**Attendance semantics.** "Here" maps to moss, "Absent" maps to warm neutral ink — **not red**. A kid who missed a Sunday has not committed an error. Red is reserved for destructive actions and validation failures.

### 1.4 Dark mode

The app UI supports dark mode via `@media (prefers-color-scheme: dark)`, which overrides the **semantic layer only**. Printed cards never use it (§7).

Dark ground is warm walnut, not neutral grey — the parchment feeling survives the inversion.

| Role | Hex | Notes |
| --- | --- | --- |
| Page ground | `#17140F` | |
| Card | `#201C16` | |
| Raised / table header | `#2A241C` | |
| Subtle border | `#3F372C` | Decorative only |
| Strong border | `#7A6B57` | 3.28:1 vs card — passes non-text |
| Primary text | `#F0E9DA` | **15.19:1** on ground, 14.02:1 on card |
| Secondary text | `#C6BBA6` | 9.67:1 / 8.93:1 |
| Muted text | `#A69B87` | 5.60:1 on raised — AA |
| Link / primary text | `#A8C293` | 9.45:1 on ground, 8.72:1 on card |
| Accent text | `#E3BC63` | 10.18:1 on ground |
| Primary button fill | `#8FAF77` with `#12100C` text | 7.75:1 |
| Danger fill | `#B33F27` with white | 5.74:1 |
| Danger text | `#F0937B` on `#35180F` | 7.11:1 |
| Warning text | `#E5B96A` on `#33290F` | 7.84:1 |
| "Here" chip | `#A8C293` on `#26301F` | 7.08:1 |
| Focus ring | `#D8B25A` | 9.13:1 — gold, because green ring on dark green fill is invisible |

Dark mode also flattens all paper shadows to near-black alphas (warm brown shadows read as smudges on dark ground) and leans on borders for separation instead.

---

## 2. Typography

### 2.1 Faces

| Role | Stack | Weights to load |
| --- | --- | --- |
| **Display serif** | `'Lora', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Noto Serif KR', 'Apple SD Gothic Neo', 'Times New Roman', serif` | 400, 500, 600, 700 (+400 italic) |
| **UI / data sans** | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', Arial, sans-serif` | 400, 500, 600, 700 |
| **Hangul-led** (name fields) | `--font-korean-ui` / `--font-korean-display` | Noto Sans KR 400/500/700; Noto Serif KR 400/600 |
| Mono | system mono stack | — |

**Why Lora:** it is a Google-hosted, warm, sturdy old-style serif that holds up at 11px on a laser-printed card — unlike Cormorant/EB Garamond, whose thin strokes drop out at card sizes. It reads bookish and a little ceremonial without tipping into wedding-invitation.

**Why Inter:** genuine tabular numerals (`tnum`), a real 500 weight, and superb small-size legibility on phones — which is where the data entry happens.

**Loading.** Self-host Lora and Inter as WOFF2 with `font-display: swap` and `unicode-range` subsets. Latin faces are listed *first* in every stack so Latin text stays on brand and Hangul falls through to a Korean face. **Subset Noto Sans KR / Noto Serif KR to the actual glyph set in the roster** — a full KR face is 4–6 MB and must never ship whole. For print, the Korean face must be embedded/loaded before `window.print()` fires (§7.8).

### 2.2 Scale

| Token | rem / px | Line height | Tracking | Face | Use |
| --- | --- | --- | --- | --- | --- |
| `--text-2xs` | 0.6875 / 11 | 1.4 | `--tracking-wider` | UI | Stamp micro-labels, cut-guide legend |
| `--text-xs` | 0.75 / 12 | 1.5 | `--tracking-wide` when uppercase | UI | Table column headers, meta, badges |
| `--text-sm` | 0.875 / 14 | 1.5 | 0 | UI | Dense table body, secondary UI, helper text |
| `--text-base` | 1 / 16 | 1.5 | 0 | UI | Body, **all inputs** |
| `--text-lg` | 1.125 / 18 | 1.5 | 0 | UI or display | Lead paragraph, card titles |
| `--text-xl` | 1.375 / 22 | 1.35 | 0 | **Display** | Section headings (h3) |
| `--text-2xl` | 1.75 / 28 | 1.25 | 0 | **Display** | Page headings (h2) |
| `--text-3xl` | 2.125 / 34 | 1.15 | `--tracking-tight` | **Display** | Screen title (h1) |
| `--text-4xl` | 2.75 / 44 | 1.15 | `--tracking-tight` | **Display** | Login wordmark, stamp numeral |

**Assignment rule:** serif for headings, wordmarks, kid names, and stamp numerals. Sans for everything operational — labels, table data, buttons, form text. Never set a form label in the serif.

**Small-caps labels** (`.label-caps`): `--text-xs`, `text-transform: uppercase`, `--tracking-wide` (0.04em), `--weight-semibold`, `--text-muted`. Lora has no true small-caps; this is the sanctioned fake.

### 2.3 Tabular numerals — mandatory

Any element containing a number that lives in a column, changes in place, or is compared against another number:

```css
font-variant-numeric: tabular-nums lining-nums;
font-feature-settings: var(--numeric-tabular);
```

Applies to: Records table cells, review table cells, number stepper value, QT page totals, stamp numeral, dashboard counts, printed card history grid, printed totals. Without this, digits jitter as values change during data entry and the printed history grid loses column alignment.

Prose (empty-state copy, toasts, help text) uses `--numeric-proportional`.

### 2.4 Text rules

- Body copy max width `--layout-prose-max` (68ch).
- Minimum text size anywhere in the app: **12px**, and only for uppercase column headers/meta. Interactive text is never below 14px; inputs never below 16px (iOS zooms the viewport on focus below 16px).
- Korean names render at ~92% of the Latin size beside them optically; specify `font-size: 0.92em` on the `.name-kr` span when inline with a Latin name.
- Never justify. Never letterspace lowercase body text.

---

## 3. Space, radii, shadow, motion

### 3.1 Spacing — 4px base

`0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96` → `--space-0` … `--space-24`.

Conventions:
- Inside a control: `--space-2` / `--space-3`.
- Label → field: `--space-2` (8px). Field → helper text: `--space-1` (4px). Field group → next group: `--space-5` (20px).
- Card padding: `--space-5` mobile, `--space-6` desktop.
- Section stack: `--space-8` mobile, `--space-12` desktop.
- Page gutter: `--space-4` mobile, `--space-6` ≥768px, `--space-8` ≥1024px.
- Minimum gap between two touch targets: `--touch-gap-min` (8px).

### 3.2 Radii

| Token | px | Applied to |
| --- | --- | --- |
| `--radius-xs` | 2 | Table-cell edit outline |
| `--radius-sm` | 4 | Checkbox, small chip |
| `--radius-md` | 6 | Button, input, select |
| `--radius-lg` | 8 | Card, toast, dropdown |
| `--radius-xl` | 12 | Modal, photo dropzone |
| `--radius-2xl` | 16 | Login panel |
| `--radius-pill` | 999 | Segmented toggle, badge |
| `--radius-round` | 50% | Passport stamp |

Radii stay modest — over-rounding reads as a consumer app, not a document.

### 3.3 Shadows — paper, not elevation

All shadows are warm brown `rgba(58,45,26,α)` at low alpha with tight blur. There is no 5-step elevation ladder; there are four states an object can be in on a desk.

| Token | Value | Use |
| --- | --- | --- |
| `--shadow-hairline` | `0 0 0 1px rgba(58,45,26,.08)` | Flat separation without a visible border |
| `--shadow-raised` | `0 1px 1px /.05` + `0 1px 3px /.06` | Buttons, chips at rest |
| `--shadow-card` | `0 1px 2px /.06` + `0 6px 14px -10px /.18` | Cards, panels |
| `--shadow-popover` | `0 2px 4px /.08` + `0 14px 28px -14px /.22` | Dropdowns, toasts |
| `--shadow-modal` | `0 4px 8px /.10` + `0 28px 56px -24px /.30` | Modals |
| `--shadow-inset` | `inset 0 1px 2px /.07` | Stepper track, wells |
| `--shadow-sticky-x/y` | `6px 0 8px -8px /.28` | Sticky table column/header edge |

Cards do **not** lift on hover (no `translateY`). Hover changes background tint and border only. Lifting paper is a Material idiom and reads wrong here.

### 3.4 Motion

`--duration-instant 80ms` (state tint) · `--duration-fast 140ms` (hover/focus) · `--duration-normal 220ms` (toast, dropdown, modal) · `--duration-slow 360ms` (skeleton sheen, stamp reveal).
Easing: `--ease-standard` for exits, `--ease-out` for entrances, `--ease-in-out` for reversible.

Animate only `opacity`, `transform`, `background-color`, `border-color`, `box-shadow`. Never animate height/width/top/left.

**Reduced motion** — see §9.5.

---

## 4. Components

Visual specs only. No framework code; sizes are exact.

Shared conventions:
- Default control height `--control-h-md` **44px**; `--control-h-sm` 36px is desktop-only and never for a primary action; `--control-h-lg` 48px for thumb-first primary actions.
- Every interactive element gets the focus treatment in §9.1.
- Disabled: `opacity: .55`, `cursor: not-allowed`, `pointer-events: none` on the visual, but keep the element focusable if it needs to explain itself (prefer `aria-disabled` over `disabled` on form submits so screen-reader users can reach the error).

### 4.1 Buttons

Shared: `--font-ui`, `--text-sm` (14px) at 36px height / `--text-base` (16px) at 44 and 48px, `--weight-semibold`, `--radius-md`, padding-x `--space-4` (`--space-5` at lg), `inline-flex`, `gap: --space-2`, `border: 1px solid transparent`, `transition: background-color/border-color/box-shadow var(--duration-fast) var(--ease-standard)`. Icon-only buttons are square at the control height with a required `aria-label`.

| Variant | Rest | Hover | Active | Disabled |
| --- | --- | --- | --- | --- |
| **Primary** | bg `--color-primary` `#55703F`, text `--text-on-primary` white, `--shadow-raised` | bg `--color-primary-hover` `#445A33` | bg `--color-primary-active` `#35471F`, shadow none | bg `--color-primary`, opacity .55 |
| **Secondary** | bg `--surface-card`, text `--text-primary`, border `--border-strong` `#8F7C55`, `--shadow-raised` | bg `--surface-hover`, border `--border-focus` | bg `--surface-active`, shadow none | opacity .55 |
| **Ghost** | transparent, text `--color-primary-text` `#445A33`, no border/shadow | bg `--surface-hover` | bg `--surface-active` | opacity .55 |
| **Danger** | bg `--status-danger-fill` `#A3341F`, text white, `--shadow-raised` | bg `--status-danger-hover` `#8C2B19` | bg `--status-danger-active` `#6E2112` | opacity .55 |
| **Accent** (rare — "Print Cards" only) | bg `--color-accent` `#E3BC63`, text `--text-on-accent` `#201B14`, border `--color-accent-strong` `#B4862A` | bg `--color-accent-hover` `#F0D492` | bg `--gold-400` | opacity .55 |

**Loading state:** keep the button's rendered width, replace the label with a 16px spinner + `aria-busy="true"`, keep an `aria-live="polite"` status elsewhere. Never let the button change size.

**Mobile placement:** the primary action on a data-entry screen is a full-width 48px button in a sticky bottom bar (`position: sticky; bottom: 0`, bg `--surface-card`, top border `--border-subtle`, `--shadow-sticky-y` inverted, padding `--space-3` + `env(safe-area-inset-bottom)`).

### 4.2 Text input

- Height 44px (auto for textarea, min 88px), padding `0 --space-3`, `--text-base` **16px**, `--font-ui`, text `--text-primary`.
- bg `--input-bg`, border `1px solid --border-strong`, `--radius-md`, `--shadow-inset`.
- Placeholder `--input-placeholder` `#6E6153` (5.42:1 — a placeholder is still text).
- Hover: border `--ink-700`. Focus: border `--border-focus` + focus ring (§9.1), shadow-inset removed.
- Invalid: border `--status-danger-border` 2px (inset the padding by 1px to avoid reflow), message below at `--text-sm` `--status-danger-text` prefixed with a 14px alert glyph.
- Label above, `--text-sm`, `--weight-medium`, `--text-secondary`, margin-bottom `--space-2`. Helper text `--text-sm` `--text-muted`.
- Numeric inputs (QT pages): `inputmode="numeric"`, `pattern="[0-9]*"`, tabular numerals, `text-align: right`.

### 4.3 Select

Same box as text input. Native `<select>` on mobile — do not build a custom listbox; the OS picker is faster with one thumb and free in accessibility terms.
- `appearance: none`, custom chevron: 10×6px, `--ink-700`, positioned `right: --space-3`, `padding-right: --space-8`.
- Closed state matches input exactly. Placeholder option uses `--text-muted`.
- Desktop multi-select/combobox (class picker): `--shadow-popover`, `--radius-lg`, option height 40px, hover `--surface-hover`, selected `--surface-selected` + moss check glyph, max-height 320px.

### 4.4 Checkbox

- 20×20px box, `--radius-sm`, border `2px solid --border-strong`, bg `--input-bg`. **Hit area 44×44** via a padded label wrapper.
- Checked: bg `--color-primary`, border `--color-primary`, white 12×10px check stroke 2px.
- Indeterminate: bg `--color-primary`, white 10×2px bar.
- Label `--text-base`, gap `--space-3`, vertically centered, entire label clickable.
- Focus ring on the box, offset 2px.

### 4.5 Here / Absent attendance toggle — the single most-used control

A two-segment control, not a switch. A switch implies on/off default state; attendance is an explicit two-way choice, and an unset value must be visibly distinct from "Absent".

**Geometry:** `--radius-pill` container, `1px solid --border-strong`, bg `--surface-inset`, padding 2px, `display: inline-grid; grid-template-columns: 1fr 1fr`. Segment height 40px (44px total incl. padding), min-width 68px each, `--text-sm` `--weight-semibold`, `--font-ui`.

**States:**

| State | Here segment | Absent segment |
| --- | --- | --- |
| Unset (neither chosen) | text `--text-muted`, transparent bg | text `--text-muted`, transparent bg; container border becomes `2px dashed --border-strong` and the row shows an "unmarked" badge |
| Here selected | bg `--status-here-fill` `#55703F`, text white, `--radius-pill`, `--shadow-raised`, **leading check glyph ✓ 12px** | text `--text-muted` |
| Absent selected | text `--text-muted` | bg `--status-absent-fill` `#6E6153`, text `--parchment-50`, **leading dash glyph – 12px** |
| Focus | ring on the container, `--focus-ring-halo` | same |
| Disabled | opacity .55 | opacity .55 |

**Non-color redundancy (required):** the selected segment always carries both its text label ("Here" / "Absent") *and* its glyph (✓ / –). A user who cannot distinguish moss from taupe still reads the word and sees the filled pill's position.

**Semantics:** `role="radiogroup"` with two `role="radio"` children, `aria-checked`, arrow-key navigation, one tab stop. Group label = the kid's name (`aria-labelledby`).

**Compact variant** (Records table cells, desktop): 28px tall, glyph-only (✓ / –) with an `aria-label` and a `title`; expands to the full control in mobile edit mode.

### 4.6 Number stepper — QT pages

Because the pastor enters 30+ values with one thumb, this is a stepper with a real text field, not a spinner.

- Container: `inline-grid; grid-template-columns: 44px 1fr 44px`, height 44px, border `1px solid --border-strong`, `--radius-md`, overflow hidden, bg `--input-bg`.
- Buttons: 44×44 tap targets, bg `--surface-inset`, `--text-primary` glyph, hover `--surface-hover`, active `--surface-active`, `--shadow-inset` on the track. `–` on the left, `+` on the right, glyph 16px, `aria-label="Decrease QT pages" / "Increase QT pages"`.
- Field: center-aligned, `--text-base` **tabular numerals**, `--weight-semibold`, min-width 56px, editable, `inputmode="numeric"`, selects all on focus.
- Range 0–999. At 0 the `–` button is `aria-disabled` and .55 opacity. Long-press repeat: 500ms delay then 120ms interval, accelerating to 60ms after 10 ticks.
- Zero renders as `0` in `--text-muted`, never as an empty field — empty means "not entered yet" and shows a dashed border like the unset toggle.

### 4.7 Table / spreadsheet cells

Base table: `border-collapse: separate; border-spacing: 0`, `--font-ui`, `--text-sm` (14px), tabular numerals on all data cells.

| Part | Spec |
| --- | --- |
| Header cell | height 36px, bg `--surface-sunken`, `--text-xs` uppercase `--tracking-wide` `--weight-semibold` `--text-muted`, border-bottom `1px --border-default`, sticky top with `--shadow-sticky-y` when scrolled |
| Body cell | height `--table-row-h` 40px (48px in mobile edit mode), padding `0 --space-3`, border-bottom `1px --border-subtle`, `--text-primary` |
| Zebra row | `nth-child(even)` bg `--surface-stripe` at 50% opacity — subtle, since gridlines already exist |
| Row hover | bg `--surface-hover` |
| Row selected | bg `--surface-selected`, 3px inline-start bar `--color-primary` |
| Numeric cell | `text-align: right`, tabular numerals |
| Name cell | `text-align: left`, `--weight-medium`; Korean name below at `--text-xs` `--text-muted` |
| Sticky column | `position: sticky; inset-inline-start: 0`, bg must be opaque (`--surface-card`), `--shadow-sticky-x` on the last sticky column, `z-index: var(--z-sticky)` |
| Read-only cell | bg `--cell-readonly-bg`, text `--text-muted`, no focus ring, `aria-readonly` |
| Focused/editing cell | `outline: 2px solid --border-focus; outline-offset: -2px`, `--radius-xs`, bg `--surface-card` |

**Edited cell** (value changed from what OCR produced): bg `--cell-edited-bg` `#F0F4EC`, 3px inline-start bar `--cell-edited-marker` `#55703F`, and a 6px moss dot in the top-inline-end corner. Tooltip/`aria-description`: "Edited — was 3". An "Edited" count appears in the review toolbar.

**Low-confidence cell** (OCR below threshold): bg `--cell-lowconf-bg` `#FBEFD2`, `2px dashed --cell-lowconf-border` `#C8890F` inset by 1px, value in `--cell-lowconf-text` `#8A5A0B` `--weight-semibold`, plus a 12px `?` glyph in the top-inline-end corner. `aria-description="Low confidence, please check"`. Confirming or editing the cell clears the state to normal (or to Edited). A "Needs review: N" chip in the toolbar jumps between them with `n`/`Shift+n`.

**Error cell** (unparseable / out of range): bg `--cell-error-bg`, `2px solid --cell-error-border`, `!` glyph, and the row cannot be saved until resolved.

> Three cell states, three different signals: **solid moss bar = you changed it**, **dashed amber + ? = the machine is unsure**, **solid red + ! = it's invalid**. Border style and glyph differ, so the states are distinguishable without color.

### 4.8 Card

- bg `--surface-card`, `1px solid --border-default`, `--radius-lg`, `--shadow-card`, padding `--space-5` (mobile) / `--space-6` (≥768px).
- Optional **ceremonial top rule**: 3px (`--border-width-rule`) full-bleed bar at the top edge in `--color-accent-strong` `#B4862A`, used on the Dashboard class cards and the Print preview card only. Not on every card — it stops meaning anything if it's everywhere.
- Title `--text-lg` `--font-display` `--weight-600` `--text-primary`; meta `--text-sm` `--text-muted`.
- Interactive card: hover bg `--surface-hover` + border `--border-strong`; **no transform**. Focus ring on the card, offset 2px. Wrap the whole card in one link/button, don't nest interactive elements.

### 4.9 Badge / chip

- Height 24px, padding `0 --space-2`, `--radius-pill`, `--text-xs` `--weight-semibold`, `--font-ui`, 1px border, optional 12px leading glyph, gap `--space-1`.

| Badge | bg / border / text |
| --- | --- |
| Here | `--status-here-bg` / `--status-here-border` / `--status-here-text` + ✓ |
| Absent | `--status-absent-bg` / `--status-absent-border` / `--status-absent-text` + – |
| Needs review | `--status-warning-bg` / `--status-warning-border` / `--status-warning-text` + ? |
| Saved | `--status-success-bg` / `--status-success-border` / `--status-success-text` + ✓ |
| Draft | `--status-info-bg` / `--status-info-border` / `--status-info-text` |
| Error | `--status-danger-bg` / `--status-danger-border` / `--status-danger-text` + ! |
| Pages count | `--color-accent-subtle` / `--color-accent-strong` / `--color-accent-text`, tabular numerals |

### 4.10 Passport-stamp badge — the signature element

A circular rubber-stamp seal showing total QT pages. Appears on: each printed card (top-inline-end), the kid detail view, and the print preview.

**Geometry (screen, `--stamp-size` 88px):**
- Outer ring: 2px solid `--stamp-ring-outer` `#B4862A`, `--radius-round`.
- Inner ring: 1px solid `--stamp-ring-inner` `#D0A23C`, inset 5px.
- Interior fill `--stamp-bg` `#FDF6E3`.
- Rotation: `transform: rotate(-6deg)` — hand-stamped, not machine-placed. Deterministic per kid (`-8deg` to `-4deg` derived from an id hash) so the same kid's stamp is always the same, never random per render.
- Top arc text: "QT PASSPORT", `--text-2xs` 11px, `--font-ui`, `--weight-semibold`, `--tracking-wider` 0.14em, uppercase, `--stamp-ink`, set on an SVG `textPath` along a circle of radius 32px.
- Center numeral: total pages, `--font-display` Lora, `--weight-bold`, 28px at 88px size (scale 0.32 × diameter), tabular numerals, `--stamp-ink` `#35471F`.
- Below numeral: "PAGES", `--text-2xs`, uppercase, `--tracking-wide`, `--stamp-ink` at 80% opacity.
- Bottom arc: term label, e.g. "FALL 2026", `--text-2xs`, uppercase, `--tracking-wide`.

**Small variant `--stamp-size-sm` 56px:** drop the top arc and the bottom term; keep numeral (18px) + "PAGES" (9px).

**Milestone treatment:** at ≥100 total pages add a second outer ring (1px, inset -4px) and swap the numeral color to `--gold-700`. At ≥250, the arc text becomes "QT PASSPORT ★". No animation, no color explosion — a rank insignia, not a game reward.

**Reveal animation** (kid detail only): opacity 0→1 + `scale(1.06)→1` + rotate from `-14deg` to its resting angle, `--duration-slow` `--ease-out`. Disabled entirely under reduced motion (§9.5).

**Accessibility:** implemented as an SVG with `role="img"` and `aria-label="Total 84 QT pages, Fall 2026"`. The decorative arc text is `aria-hidden`.

**Implementation note:** build it as one inline SVG (viewBox `0 0 100 100`) using `currentColor` + the tokens, so the same markup scales to the 0.95in print size without a second asset.

### 4.11 Nav / header

- Height `--layout-header-h` 56px mobile / `--layout-header-h-lg` 64px ≥768px. `position: sticky; top: 0; z-index: var(--z-header)`.
- bg `--surface-card`, border-bottom `1px --border-subtle`; on scroll >4px add `--shadow-sticky-y`.
- Wordmark left: "QT Passport" in `--font-display` `--weight-600` `--text-lg`, with a 20px gold seal glyph before it. Optionally set "QT" in `--gold-600` and "Passport" in `--text-primary`.
- Desktop nav: horizontal links, `--text-sm` `--weight-medium` `--text-secondary`, 44px tall hit area, gap `--space-2`. Active: `--text-primary` `--weight-semibold` + 2px bottom bar `--color-primary` (bar is the redundancy for color).
- Mobile: bottom tab bar instead of a hamburger — 4 items (Dashboard, Log a Week, Records, Print), 56px tall + `env(safe-area-inset-bottom)`, icon 22px + label `--text-2xs`, active item `--color-primary-text` + filled icon variant. Bottom placement because everything happens one-handed.
- Right side: term/quarter selector (select, 36px) and account menu (36px avatar/initials circle, `--surface-inset`, `--text-secondary`).

### 4.12 Toast

- Anchored bottom-center mobile (above the tab bar, `--space-4` clearance), bottom-right desktop. Max-width 380px, min-height 48px.
- bg `--surface-inverse` `#2B2A20`, text `--text-inverse` (14.44:1), `--radius-lg`, `--shadow-popover`, padding `--space-3 --space-4`, `--text-sm`.
- Leading 16px status glyph: ✓ moss `#8FAF77` / ! amber `#E5B96A` / ✕ brick `#F0937B` — on the dark toast body, these are the light ramp values.
- Optional trailing action as a ghost button in `--gold-300`; close button 44×44 with `aria-label="Dismiss"`.
- Enter: opacity 0→1 + `translateY(8px)→0`, `--duration-normal --ease-out`. Exit `--duration-fast --ease-standard`.
- Auto-dismiss 5s (success) / 8s (with action); errors are **never** auto-dismissed. Pause on hover and focus.
- `role="status" aria-live="polite"`; errors `role="alert" aria-live="assertive"`. Max 3 stacked, gap `--space-2`.

### 4.13 Empty state

Centered column, max-width 380px, padding `--space-12` vertical.
- Illustration: a 72px line-art glyph in `--ink-500` at 40% opacity — an open passport / dotted stamp outline. Line weight 1.5px, no fills, no character illustrations.
- Title `--text-xl` `--font-display` `--text-primary`.
- Body `--text-base` `--text-muted`, max 2 lines.
- One primary action button (48px). Optional ghost secondary below.

Copy per screen: Dashboard "No classes yet — add your first class to start logging." · Records "Nothing logged for this term yet. Log a week to see it here." · Print "Pick a class to print cards for."

### 4.14 Loading skeleton

- bg `--surface-skeleton` `#E7DCC2`, `--radius-sm` (or `--radius-round` for avatars/stamps), sized to the real content's box.
- Sheen: 1.6s linear infinite, a 120px-wide `linear-gradient(90deg, transparent, var(--surface-skeleton-sheen), transparent)` swept via `transform: translateX()`. Never animate `background-position` on a large surface.
- Text skeleton lines: height 12px, gap `--space-2`, last line 60% width.
- Table skeleton: 6 rows at real row height with correct column widths so nothing shifts on load.
- Container `aria-busy="true"` + a visually-hidden "Loading…" live region. Skeletons themselves are `aria-hidden`.
- Under reduced motion the sheen stops; the skeleton renders as a static 60%-opacity block.

### 4.15 Modal

- Scrim `--surface-overlay` `rgba(32,27,20,.52)`, fades in `--duration-fast`.
- Panel: bg `--surface-card`, `--radius-xl`, `--shadow-modal`, `1px solid --border-default`, max-width 480px (`sm`) / 640px (`md`), width `calc(100% - var(--space-8))`.
- **Mobile ≤640px: bottom sheet.** Full width, `--radius-xl` on the top corners only, anchored to the bottom, max-height 90dvh, 36×4px `--border-subtle` grab handle centered at `--space-3` from the top, drag-to-dismiss.
- Header: title `--text-xl` `--font-display`, padding `--space-5`, border-bottom `1px --border-subtle`, 44×44 close button top-inline-end.
- Body: padding `--space-5`, scrolls independently.
- Footer: padding `--space-5`, border-top `1px --border-subtle`, buttons right-aligned desktop (`gap --space-3`, secondary then primary) and **stacked full-width on mobile with the primary on top**.
- Enter: scrim fade + panel `translateY(12px)→0` & `scale(.98)→1`, `--duration-normal --ease-out`; sheet slides from `translateY(100%)`.
- Focus trapped; focus moves to the panel (or first field) on open and returns to the trigger on close. `Esc` closes unless there are unsaved edits, in which case a confirm step runs. `role="dialog" aria-modal="true"` + `aria-labelledby`. Background gets `inert`.
- Destructive confirmations use the Danger button and name the object: "Delete Week 6 for 5th Grade B?" — never a bare "Are you sure?".

---

## 5. Page layouts

Shared shell: sticky header (§4.11) → `main` with max-width `--layout-content-max` 1120px centered, page gutters per §3.1 → mobile bottom tab bar. Page title `--text-3xl` display serif with `--space-6` below; optional 1px `--border-subtle` rule beneath the title block on data screens.

### 5.1 Login

Single centered panel, no app chrome, no nav.
- Full-viewport `--surface-page` with an optional very subtle parchment texture (see §8.4).
- Panel: max-width `--layout-login-max` 420px, centered with `min-height: 100dvh; display: grid; place-items: center`, padding `--space-6`. On mobile the panel is borderless on the page ground; ≥480px it becomes a card (`--surface-card`, `--radius-2xl`, `--shadow-card`, `1px --border-default`, padding `--space-8`).
- Stack: 56px gold seal mark → "QT Passport" `--text-4xl` `--font-display` `--tracking-tight` → subtitle `--text-base --text-muted` ("Fourth through sixth grade") → `--space-8` → email field → password field → 48px full-width primary "Sign in" → ghost "Trouble signing in?" link.
- Errors appear above the button in a `--status-danger-bg` box with `--status-danger-border` 1px, `--radius-md`, `--text-sm --status-danger-text`, `role="alert"`.
- `autocomplete="email"` / `"current-password"`, both fields 16px to prevent iOS zoom, submit on Enter. Only two people use this app; there is no sign-up link and no social auth.

### 5.2 Dashboard — grade / class list

- Header row: `h1` "Sunday, March 8" or term name, plus a term `<select>`; on desktop a primary "Log a Week" button sits right.
- **Summary strip:** 3 stat tiles (Weeks logged · Kids active · Total pages this term). Tile = card at `--space-4` padding, label `--text-xs` uppercase `--text-muted`, value `--text-2xl` `--font-display` tabular numerals. Grid: 1 col <480px, 3 cols ≥480px, gap `--space-3`.
- **Class cards:** grid `1fr` mobile, `repeat(2, 1fr)` ≥640px, `repeat(3, 1fr)` ≥1024px, gap `--space-4`. Each card carries the 3px gold top rule, class name `--text-lg` display serif, grade meta `--text-sm --text-muted`, a small stamp badge (56px) with class total pages, and a footer row: "Last logged: Week 5" + a Saved/Draft badge. Whole card is one link to the class record.
- Class with no data this week shows a "Not logged" `--status-warning-*` badge — the one place the dashboard nags.
- Mobile: cards stack; the "Log a Week" action lives in the bottom tab bar, not repeated on the page.

### 5.3 Log a Week — photo upload → editable review table

Three-step flow with a stepper header (`1 Photo · 2 Review · 3 Save`): 32px numbered circles, active `--color-primary` fill + white numeral, complete `--color-primary-subtle` fill + moss check, upcoming `--surface-inset` + `--text-muted`, connected by a 2px `--border-subtle` rule. Steps are also labeled in text, and the current step is announced via `aria-current="step"`.

**Step 1 — Capture.**
- Context row first: class `<select>` + week `<select>` (44px each, side by side ≥480px, stacked below). Pre-fill from last session.
- Dropzone: `--radius-xl`, `2px dashed --border-strong`, bg `--surface-sunken`, min-height 200px (240px desktop), centered content: 40px camera glyph `--ink-500`, "Take a photo of the sheet" `--text-lg`, helper `--text-sm --text-muted` ("Lay it flat, fill the frame, avoid shadows").
- Two buttons inside: primary 48px **"Take photo"** and secondary **"Choose file"**. Mobile order puts Take photo first. Drag-over state: border `--color-primary`, bg `--color-primary-subtle`.
- After capture: thumbnail preview at max 320px wide, `--radius-lg`, `1px --border-default`, with "Retake" (ghost) and "Looks good — extract" (primary) beneath. Show file size and a warning badge if >8 MB or if the image's shorter edge is <1000px ("This photo may be too small to read — retake?").
- Processing: replace the preview area with a skeleton table plus an indeterminate 4px progress bar in `--color-primary` and a live-region status ("Reading the sheet… found 18 names").

**Step 2 — Review table.** This is where all the real work happens.
- Toolbar above the table, sticky under the header: "18 rows · **3 need review**" (warning badge, clicking it jumps to the first low-confidence cell) · "5 edited" · a ghost "View photo" that opens the source image in a modal with pinch-zoom.
- Columns: Name (EN) · Name (KR) · Here/Absent toggle · QT pages stepper · a row-menu (⋯, 44×44).
- Desktop: the full table, 48px rows (edit mode row height), sticky header. Keyboard: `Tab`/`Shift+Tab` across cells, `↑/↓` between rows in the same column, `Enter` commits and moves down, `n` jumps to the next low-confidence cell.
- Mobile: **one card per kid**, not a table. Card = name block (EN `--text-lg` `--weight-semibold`; KR `--text-sm --text-muted` beneath) on the left, full Here/Absent toggle beneath, stepper beneath that, all at 44px+. Low-confidence fields keep the amber dashed treatment on the field itself. Roughly 30 kids → an unbroken scroll of ~30 cards; a sticky mini-progress bar ("12 of 18 reviewed") sits under the header.
- Unrecognized name → an error card with an editable text field and a "Match to existing kid" select of the class roster.
- Sticky bottom bar: "Save week" primary (48px full-width mobile) with a count ("Save 18 rows"), disabled while any error cell remains, with the reason stated next to it rather than as a tooltip.

**Step 3 — Saved.** Success panel with a check seal, a summary ("Week 6 saved · 18 rows · 142 pages"), and two actions: "Print cards for this class" (accent) and "Log another week" (secondary).

### 5.4 Records — wide spreadsheet

The reference is a well-set ledger.

- Controls row: class select · term select · a "Weeks 1–13 / show all" range control · Export CSV (secondary) · Print Cards (accent). Wraps to two rows on mobile; each control 44px.
- **Structure:** two sticky columns then repeating per-week column pairs.

| Sticky | Sticky | Week 1 | Week 2 | … | Totals |
| --- | --- | --- | --- | --- | --- |
| Name (EN) | Name (KR) | Att · QT | Att · QT | | Weeks · Pages |

- Widths: `--table-name-col-w` 148px, `--table-korean-col-w` 108px, `--table-att-col-w` 44px, `--table-qt-col-w` 56px, totals group 96px.
- Two header rows: row 1 = week group label ("Week 3" + date, `colspan=2`, centered, `--text-xs` uppercase, bg `--surface-sunken`, 1px inline-start border `--border-default` marking the group boundary); row 2 = "Att | QT" sub-labels. Both rows sticky (`top: 0` and `top: 36px`) with `--shadow-sticky-y` once scrolled.
- Sticky columns use `position: sticky; inset-inline-start: 0` and `left: 148px`, opaque `--surface-card` backgrounds, `z-index: var(--z-sticky)`; the second sticky column carries `--shadow-sticky-x`. The header/sticky-column intersection needs `z-index: calc(var(--z-sticky) + 1)`.
- Attendance cells: centered ✓ (`--status-here-text`) or – (`--text-muted`); empty (never logged) renders as a light `·` in `--ink-500`, so "absent" and "no data" are visibly different. QT cells: right-aligned tabular numerals; `0` in `--text-muted`.
- Every 4th week group gets a slightly stronger inline-start border (`--border-default` instead of `--border-subtle`) as a ruler for the eye.
- Totals group pinned at the inline end (`position: sticky; inset-inline-end: 0`), bg `--surface-sunken`, `--weight-semibold`, with `--shadow-sticky-x` mirrored.
- Row height 40px desktop; hover highlights the full row including sticky cells (needs a JS or `:has()` hover class since sticky cells have their own background).
- Container: `overflow: auto; overscroll-behavior-x: contain`, `--radius-lg`, `1px --border-default`, `max-height: calc(100dvh - 220px)` on desktop so header and controls stay visible.

**Mobile behavior for the wide table** (see also §8.2):
1. Default: keep the grid, sticky **Name (EN) only** at 116px (Korean name moves to a second line inside that cell at `--text-2xs`), horizontally scrollable with `scroll-snap-type: x proximity` and `scroll-snap-align: start` on each week group, so a swipe lands cleanly on a week boundary. A one-time coach hint ("Swipe to see more weeks →") appears under the header.
2. A segmented "Grid / Week" control offers a **Week view**: pick one week, get a vertical list of kids with Att + QT — no horizontal scroll at all. This is the recommended default on screens <480px.
3. Never collapse to a card-per-kid on Records; the whole point of this screen is cross-week comparison.

### 5.5 Print Cards

- Left (or top on mobile): options panel in a card — class select, term/week range, card layout radio (**Standard, 6 per page** / **Compact, 8 per page**), checkboxes for "Show Korean name", "Show week-by-week history", "Cut guides", "Blank cards for new kids (+2)".
- Right: **preview** — an actual US Letter page at `aspect-ratio: 8.5 / 11`, `--surface-card`, `--shadow-card`, scaled with `transform: scale()` to fit, rendering the real card components at print proportions. What is on screen is exactly what prints.
- Above the preview: "Page 1 of 3 · 17 cards" with prev/next page arrows (44×44).
- Primary action: accent **"Print"** button (48px) calling `window.print()`, plus a secondary "Download PDF" if the backend supports it. A helper line reads: "In the print dialog, choose Letter, portrait, margins: default, and turn **off** headers and footers."
- On mobile the preview sits above the options and is pinch-zoomable; the Print button is in a sticky bottom bar.
- Warn inline if the selected class has kids with no data ("3 kids have no logged weeks — their cards will print blank").

---

## 6. Mobile-first notes

The pastor photographs sheets on a phone, standing up, during or right after service. Design for that, not for a desk.

### 6.1 Breakpoints

`<480px` small phone (base) · `≥480px` large phone · `≥768px` tablet · `≥1024px` desktop · `≥1280px` wide. Write mobile styles first; every `@media` is `min-width`.

### 6.2 Touch targets

- **Minimum 44×44 CSS px** for every interactive element (`--touch-target-min`). Where the visual is smaller (checkbox 20px, compact toggle 28px, close glyph 16px), extend the hit area with padding or a `::after` overlay — never shrink the visual to match a smaller target.
- Primary/repeated actions: 48px (`--touch-target-primary`).
- Minimum 8px between adjacent targets (`--touch-gap-min`); 12px between a destructive and a non-destructive one.
- Destructive controls never sit within 12px of a frequently-tapped control, and never at the bottom-right thumb rest.
- Bottom 96px of the viewport is the primary-action zone; put "Save week", "Take photo", and "Print" there. Back/cancel go top-left.
- All inputs 16px font to prevent iOS focus zoom. Respect `env(safe-area-inset-bottom)` on every fixed bottom element.

### 6.3 Camera-capture flow

1. **Trigger:** `<input type="file" accept="image/*" capture="environment">` — opens the camera directly on iOS/Android with zero permission plumbing. Provide a separate "Choose file" input without `capture` so a photo taken earlier can be used. Do not build a custom `getUserMedia` viewfinder for v1: the OS camera has better focus, exposure, HDR, and the user already knows it.
2. **Before:** the dropzone states the three things that ruin OCR — flat, filled frame, no shadow — as text, plus a small 3-icon row. Landscape orientation is suggested for a landscape sheet.
3. **After capture, client-side, before upload:** downscale the longest edge to 2400px, re-encode JPEG q0.85, strip EXIF except orientation, and **honor EXIF orientation** when rendering. Target under ~1.5 MB so a church parking-lot connection can upload it.
4. **Preview & confirm:** thumbnail + "Retake" / "Looks good". Block upload with an inline warning if the shorter edge is under 1000px after downscale.
5. **Upload:** determinate progress bar when the size is known, with a Cancel; on failure keep the local image and offer "Retry" — the photo must never be lost to a network error.
6. **Extraction:** skeleton review table + live-region status. If OCR returns fewer than 60% of the expected roster, surface a "This didn't read well — retake?" panel instead of dumping a broken table.
7. **Throughout review:** the source photo stays one tap away ("View photo" → modal, pinch-zoom, double-tap to zoom), because the reviewer constantly cross-checks.
8. **Resilience:** persist the in-progress review to local storage on every change, keyed by class + week. A phone call mid-review must not cost 20 minutes of typing.

### 6.4 Other mobile rules

- No hover-only affordances anywhere; every hover state has a tap/focus equivalent.
- No custom scrollbars. `-webkit-overflow-scrolling: touch` on scroll containers, and `overscroll-behavior-x: contain` on the Records grid so a horizontal swipe never triggers browser back.
- Use `dvh`, not `vh`, for full-height layouts (mobile browser chrome).
- Keep the sticky bottom bar clear of the keyboard: on `focusin` in a scroll container, `scrollIntoView({block:'center'})` the active field.

---

## 7. Print stylesheet — point cards

This is the artifact the kids actually hold. It gets the most exacting spec in this document.

### 7.1 Page setup

```
@page { size: Letter portrait; margin: 0.375in; }
```

- The print stylesheet is **light-only**: `@media print` re-declares the light semantic layer (already done in `tokens.css` §7), so a pastor with dark mode on still gets black-on-white.
- Hide all app chrome: header, tab bar, nav, buttons, toolbars, toasts, options panel, scrollbars, links' `href` expansion. Practically: `body > * { display: none }` and show only the print root, or gate everything on a `.no-print` / `.print-only` pair.
- `background: #FFFFFF` everywhere. Remove every shadow, border-radius above 4px, and gradient.
- Force `color-adjust: exact` **only** on the two thin accent rules and the stamp rings. Everything critical must survive "background graphics off": all information is carried by text and 0.5–1pt strokes, never by a fill.

### 7.2 Sheet grid

| Mode | Card size | Grid | Per sheet |
| --- | --- | --- | --- |
| **Standard** (default) | 3.75in × 3.2in | 2 cols × 3 rows | 6 |
| **Compact** | 3.75in × 2.4in | 2 cols × 4 rows | 8 |

- Gutters: `--print-gutter-x` 0.25in, `--print-gutter-y` 0.2in. Standard math: `2 × 3.75 + 0.25 = 7.75in` wide, `3 × 3.2 + 2 × 0.2 = 10.0in` tall — inside the 7.75 × 10.25in usable area.
- Layout with CSS Grid on a `.print-sheet` element of fixed dimensions; `break-inside: avoid` on every card and `break-after: page` on each sheet. Do not rely on flow pagination for card positioning — it drifts across browsers.
- Cards fill row-major, alphabetically by English name. A class that doesn't fill the last sheet gets blank ruled cards (optional) rather than a ragged page.

### 7.3 Card internal layout (Standard, 3.75 × 3.2in, padding `--print-card-pad` 0.22in)

```
┌────────────────────────────────────────────────┐
│ ═══ 1pt gold rule, full bleed across top ═══   │
│ QT PASSPORT · FALL 2026            ╭────────╮  │  A. Header strip
│                                    │  ╭──╮  │  │
│ Daniel Kim                         │  │84│  │  │  B. Name block
│ 김다니엘                            │  ╰──╯  │  │  C. Stamp (top-inline-end)
│ 5TH GRADE · CLASS B                ╰────────╯  │
│ ─────────────── 0.5pt hairline ─────────────── │
│  WK   1  2  3  4  5  6  7  8  9 10 11 12 13    │  D. History grid
│  ATT  ✓  ✓  –  ✓  ✓  ✓  ✓  ·  ·  ·  ·  ·  ·    │
│  QT   6  8  0 12  9  7 10  ·  ·  ·  ·  ·  ·    │
│ ─────────────── 0.5pt hairline ─────────────── │
│  WEEKS HERE 6/7      TOTAL PAGES 52            │  E. Footer totals
│  Teacher ______________                        │
└────────────────────────────────────────────────┘
```

**A. Header strip** — 1pt (`--print-rule`) gold `--print-accent` `#6F4E15` rule across the full card width at the top edge, then "QT PASSPORT · FALL 2026" at 7pt uppercase, `--tracking-wider`, `--print-ink-soft`. Height ~0.28in.

**B. Name block** — starts 0.1in below the header.
- English name: `--font-display` Lora **14pt** semibold, `--print-ink`, single line, auto-shrink to 12pt then 10.5pt if it overflows the 2.4in available width (measure server-side or with a small script; never wrap a name).
- Korean name: `--font-korean-display` **10.5pt** regular, `--print-ink-soft`, on the next line, 0.03in below.
- Class line: 7.5pt uppercase, `--tracking-wide`, `--print-ink-faint`: "5TH GRADE · CLASS B".

**C. Passport stamp** — `--print-stamp-size` 0.95in circle, top-inline-end corner, 0.1in from the card padding box. Same inline SVG as §4.10 at print values: outer ring 1pt `--print-accent`, inner ring 0.5pt, **no interior fill** (ink economy — the fill is the paper), numeral in `--font-display` bold **20pt** `--print-moss`, "PAGES" 6.5pt, top arc "QT PASSPORT" 6pt. Keep the deterministic −6° rotation; it is the single thing that makes the card feel stamped rather than printed.

**D. History grid** — the week-by-week record.
- 3 rows: `WK` labels (6.5pt uppercase `--print-ink-faint`), `ATT`, `QT`.
- Up to 13 week columns at 0.2in each (13 × 0.2 = 2.6in) plus a 0.35in row-label column, inside the 3.31in content width. If the term exceeds 13 weeks, split into two stacked blocks of ≤13 (compact mode drops to a single 13-week block and shrinks the QT row).
- Cells: 8pt, **tabular numerals**, centered. `✓` = here (`--print-moss`), `–` = absent (`--print-ink-faint`), `·` = not yet logged (`--print-ink-faint`). Never a colored fill.
- 0.5pt hairline `--print-guide` above and below the grid; a 0.5pt vertical hairline every 4 weeks as a reading ruler.
- The current week's column gets a 0.5pt box outline — the "you are here" marker.

**E. Footer totals** — 0.5pt hairline, then a row: "WEEKS HERE 6/7" (7pt uppercase label + 10pt bold value) and "TOTAL PAGES 52" (label + **12pt bold** `--print-moss` value), space-between. Below it, a 6.5pt "Teacher ______" line with a 0.5pt dotted rule 1.2in long — teachers sign or initial it, which is what makes the card feel official in a kid's hand.

**Compact mode (2.4in)** drops the class line and the teacher line, shrinks the name to 12pt, the stamp to 0.8in, and the history grid rows to 7pt.

### 7.4 Cut guides

- Controlled by the "Cut guides" option → `.print-sheet--guides`.
- **Crop marks:** 0.5pt (`--print-hairline`) `--print-guide` `#B3B3B3` lines, 0.09in long, at all four corners of each card, offset 0.04in **outside** the card box so the mark is trimmed away. Corner marks only — a full box around each card reads as a border and looks like part of the design.
- **Gutter cut lines** (alternative, for guillotine cutting): 0.5pt dashed (`2pt 2pt`) `--print-guide` lines running the full sheet height/width down the center of each gutter. Offer via the same option; default is corner marks.
- Guides always print in grey, never black, so an untrimmed card still looks finished.
- A 6pt legend at the bottom-left of the sheet: "QT Passport · Fall 2026 · printed 2026-03-08 · page 1 of 3" in `--print-ink-faint`. This is the only sheet-level chrome allowed.

### 7.5 Ink economy

- Zero large fills. Total non-white coverage per card should stay under ~8%: rules, glyphs, text, and stamp outlines only.
- The stamp is outline-only. Do not print a gold disc.
- No zebra striping, no filled table headers, no shaded blocks anywhere in print.
- Gold is darkened to `--print-accent` `#6F4E15` (5.47:1 on white) because `#B4862A` prints as a washed yellow on a laser printer and is unreadable on a home inkjet at low toner.
- Body ink is `--print-ink` `#1A1A1A` rather than pure `#000` — 17:1 on white, slightly less toner, and warmer alongside the accents. Secondary `--print-ink-soft` `#55493C` = 8.73:1; faint `--print-ink-faint` `#8A7C6C` = 3.92:1 and is used **only** for the `·` placeholder and hairline labels, never for a name or number.
- Everything remains legible in grayscale: the moss and gold values differ in luminance from each other and from the body ink, so a black-and-white printer still yields a hierarchy.

### 7.6 Print contrast

| Element | Color | On white | Result |
| --- | --- | --- | --- |
| Name, numbers | `#1A1A1A` | 17.1:1 | AAA |
| Secondary / Korean name | `#55493C` | 8.73:1 | AAA |
| Total pages, ✓ marks | `#35471F` | 7.62:1 | AAA |
| Header strip, stamp rings | `#6F4E15` | 5.47:1 | AA |
| `·` placeholder, hairline labels | `#8A7C6C` | 3.92:1 | Non-text / ≥18pt only |
| Cut guides | `#B3B3B3` | 1.8:1 | Intentionally faint, non-informational |

### 7.7 Print of other screens

Records is likely to be printed too. Give it a minimal print treatment: landscape (`@page :has(.records-print) { size: Letter landscape }` or a body class toggling `@page` size), repeat the header row via `thead { display: table-header-group }`, `break-inside: avoid` on rows, drop sticky positioning (sticky + print is broken across engines — reset to `position: static`), hairline borders, no fills. Everything else in the app prints as "This page isn't designed for printing — use Print Cards", shown via a `.print-only` message.

### 7.8 Print QA checklist

1. Chrome, Safari, and Firefox on macOS; Chrome + Safari on iOS (the pastor may print from a phone to an AirPrint printer).
2. With and without "Print backgrounds" enabled — the card must be complete either way.
3. Margins set to Default and to None — the layout must not reflow past the 0.375in safe area.
4. Korean glyphs render, not tofu boxes: `document.fonts.ready` must resolve before `window.print()`.
5. Longest real name in the roster does not wrap or clip.
6. A kid with 0 pages and 0 weeks prints a valid, dignified card.
7. Cut marks land outside the card box and a trimmed card shows none of them.
8. Grayscale print still communicates Here vs Absent (glyph, not color).

---

## 8. Implementation notes

### 8.1 CSS architecture

- `tokens.css` first, then `base.css` (reset + element defaults), then component files, then page files. Plain CSS, no preprocessor needed.
- Components read semantic tokens only. A code review that finds `var(--moss-500)` inside a component file rejects it — that's a dark-mode bug waiting to happen.
- Set `font-variant-numeric: tabular-nums` on `table`, `.stepper input`, `.stamp`, and `.stat-value` at the base layer so nobody has to remember.

### 8.2 Records table technique

Use CSS `position: sticky` on `<th>`/`<td>`, not a JS-cloned column. Requirements: `border-collapse: separate` (sticky breaks with `collapse` in several engines), opaque cell backgrounds on sticky cells, explicit `z-index` layering (`sticky column < sticky header < intersection`), and borders applied via `box-shadow` on sticky cells because `border` collapses inconsistently under sticky.

### 8.3 Focus ring and the paper aesthetic

The 2px `#2A5E3D` ring plus a 4px 18%-alpha moss halo is the one place the UI is allowed to look slightly "digital". Do not soften it for aesthetics.

### 8.4 Optional parchment texture

If a texture is used on the page ground, it must be an inline SVG fractal-noise `background-image` at ≤3% opacity, no HTTP request, and it must be suppressed in `@media print` and under `@media (prefers-reduced-transparency: reduce)`. Never texture a surface that holds a data table — it destroys small-text legibility.

---

## 9. Accessibility

Target: **WCAG 2.2 Level AA**, with AAA text contrast wherever the palette allows (most pairs exceed 7:1).

### 9.1 Focus visible

```
:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);  /* 2px #2A5E3D */
  outline-offset: var(--focus-ring-offset);                        /* 2px */
  box-shadow: var(--focus-ring-halo);                              /* 0 0 0 4px rgba(85,112,63,.18) */
  border-radius: inherit;
}
```

- Light ring `#2A5E3D` = 6.85:1 vs the page ground; dark-mode ring `#D8B25A` = 9.13:1 vs dark ground. Both exceed the 3:1 requirement for focus indicators (WCAG 2.4.11).
- Never `outline: none` without an equivalent replacement. Inside table cells where an offset ring would be clipped, use `outline-offset: -2px` instead of removing it.
- On the moss primary button, the ring's offset gap uses `--focus-ring-offset-color` so the dark green ring stays visible against the dark green fill.
- Focus order follows visual order. Skip link ("Skip to main content") is the first focusable element: visually hidden until focused, then pinned top-left at `--space-4` as a `--surface-card` chip.
- Modal focus is trapped and restored to the trigger on close (§4.15).

### 9.2 Touch targets

44×44 CSS px minimum everywhere (WCAG 2.5.8 AA is 24×24; we exceed it deliberately because this app is operated one-handed under time pressure). 48px for primary actions. 8px minimum spacing. See §6.2.

### 9.3 Never color alone

| Meaning | Color | Redundant cue |
| --- | --- | --- |
| Here | moss fill | ✓ glyph **and** the word "Here" **and** the pill's position |
| Absent | ink fill | – glyph **and** the word "Absent" |
| Not logged | none | `·` placeholder glyph (visually distinct from `–`) |
| Edited cell | moss wash | 3px solid inline-start bar + corner dot + `aria-description` |
| Low-confidence cell | amber wash | **2px dashed** border + `?` glyph + "N need review" count |
| Error cell | brick wash | **2px solid** border + `!` glyph + blocking message |
| Active nav item | moss text | 2px underline bar (desktop) / filled icon (mobile) |
| Required field | — | "Required" in the label, not an asterisk alone |

Cell states are distinguished by **border style** (none / dashed / solid) as well as hue, so they survive both grayscale printing and every form of color vision deficiency.

### 9.4 Semantics and assistive tech

- Real `<table>` with `<caption>`, `<th scope="col">`, and `<th scope="row">` on the name column for Records — a div grid strands screen-reader users in a 30-column sheet.
- Attendance toggle: `radiogroup`/`radio` with `aria-checked`, group labeled by the kid's name.
- Stepper: `<input type="text" inputmode="numeric" role="spinbutton">` with `aria-valuenow/min/max` and `aria-label="QT pages for Daniel Kim"`.
- Live regions: OCR progress and row counts `aria-live="polite"`; save failures `role="alert"`.
- The stamp is `role="img"` with a full text label; its arc text is `aria-hidden`.
- All icon-only controls have `aria-label`. Decorative glyphs are `aria-hidden="true"`.
- Page `<h1>` per screen, heading levels never skipped, `lang="ko"` on Korean name spans so screen readers switch voice.
- Zoom: layout must survive 200% browser zoom and 320px width without horizontal scrolling — except the Records grid, which is exempt as a data table (WCAG 1.4.10 allows two-dimensional data to scroll) and provides the Week view (§5.4) as the non-scrolling equivalent.

### 9.5 Reduced motion

```
@media (prefers-reduced-motion: reduce) { /* durations collapse to 0.01ms in tokens.css */ }
```

Beyond token collapse, components must explicitly:
- Stop the skeleton sheen (static 60%-opacity block instead).
- Skip the stamp reveal — render at final state, no rotation animation.
- Replace toast slide-in with an instant appearance (keep the auto-dismiss timing).
- Remove modal/sheet transforms; scrim and panel appear immediately.
- Disable smooth scrolling (`scroll-behavior: auto`) and scroll-snap animation on the Records grid.
- Long-press stepper repeat is a functional behavior, not decoration — it stays.

Never reduce motion by simply speeding animations up; remove the movement.

---

## 10. Handoff checklist

- [ ] `tokens.css` loaded globally before any component CSS
- [ ] Lora + Inter self-hosted WOFF2, `font-display: swap`; Noto Sans KR / Noto Serif KR **subset** to the roster's glyphs
- [ ] `document.fonts.ready` awaited before `window.print()`
- [ ] Tabular numerals verified on: Records cells, review cells, stepper, stamp, stat tiles, printed history grid
- [ ] Every interactive element ≥44×44; audited on a real phone, not a desktop emulator
- [ ] Here/Absent renders correctly in grayscale and with a color-blindness simulator
- [ ] Dark mode audited on every screen (the print preview must stay light)
- [ ] Print QA run through the §7.8 checklist on real paper
- [ ] Keyboard-only pass across Log a Week and Records
- [ ] VoiceOver pass on the review flow (iOS Safari) and NVDA/Chrome on Records
- [ ] Review state persists to local storage and survives a backgrounded phone

---
**Design system**: QT Passport v1.0
**Contrast**: all text pairs verified against WCAG 2.x AA; ratios stated in §1.2, §1.4, §7.6
**Implementation**: ready for developer handoff — no follow-up design decisions required
