# Home Finances Glass Design System

## Direction

Home Finances is a private finance reconciliation cockpit, not a marketing site. The interface must feel calm, precise, and premium while staying dense enough for repeated review work. The visual language is sophisticated glass: layered translucent surfaces, graphite text, blue action accents, clear financial signals, and no decorative clutter.

## Principles

- Review first, manage second. Primary screens expose enough information to reconcile a month; low-frequency management actions live in expansion panels and overflow affordances.
- Glass is functional depth. Use it to separate canvas, panels, records, and popovers without making the interface low contrast.
- Finance signals stay consistent everywhere: incoming is emerald, outgoing is coral, warnings are amber, primary action is blue.
- Components must map cleanly to web CSS, Apple SwiftUI, and Android Jetpack Compose tokens.
- Motion supports orientation only. Use 150-240ms transitions for color, border, opacity, and shadow. Avoid decorative loops.

## Web CSS Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--font-sans` | `"Plus Jakarta Sans", Arial, Helvetica, sans-serif` | All UI text |
| `--color-ink` | `#09090b` | Primary text |
| `--color-muted` | `#525866` | Secondary text |
| `--color-canvas` | `#f7f9fc` | App background |
| `--color-panel` | `rgba(255, 255, 255, 0.78)` | Large glass panels |
| `--surface-glass` | `linear-gradient(145deg, rgba(255,255,255,0.82), rgba(255,255,255,0.58))` | Cards and controls |
| `--surface-solid` | `#ffffff` | Inputs and dense table surfaces |
| `--line-glass` | `rgba(24, 24, 27, 0.12)` | Borders |
| `--shadow-glass` | `0 24px 80px rgba(15, 23, 42, 0.10)` | Panels |
| `--shadow-control` | `0 10px 28px rgba(37, 99, 235, 0.18)` | Primary action |
| `--blur-glass` | `18px` | Backdrop blur |
| `--focus-ring` | `0 0 0 3px rgba(37, 99, 235, 0.22)` | Keyboard focus |
| `--radius-panel` | `8px` | Panels and repeated records |
| `--radius-control` | `6px` | Inputs and buttons |

## Apple Token Mapping

| Web Token | SwiftUI Token |
| --- | --- |
| `--color-ink` | `Color.primary` with custom graphite asset |
| `--color-muted` | `Color.secondary` with contrast check |
| `--surface-glass` | `.ultraThinMaterial` over `Color("Canvas")` |
| `--line-glass` | `Color.primary.opacity(0.12)` |
| `--shadow-glass` | `.shadow(color: .black.opacity(0.10), radius: 32, y: 18)` |
| `--radius-panel` | `.clipShape(RoundedRectangle(cornerRadius: 8))` |

## Android Token Mapping

| Web Token | Jetpack Compose Token |
| --- | --- |
| `--color-ink` | `MaterialTheme.colorScheme.onSurface` |
| `--color-muted` | `MaterialTheme.colorScheme.onSurfaceVariant` |
| `--surface-glass` | `Surface` with translucent container color and blur backdrop where available |
| `--line-glass` | `BorderStroke(1.dp, outlineVariant.copy(alpha = 0.12f))` |
| `--shadow-glass` | `Modifier.shadow(24.dp, RoundedCornerShape(8.dp))` |
| `--radius-control` | `RoundedCornerShape(6.dp)` |

## Component Rules

- App shell: max width 1320px, two-column desktop layout, single-column mobile below 900px.
- Header: large page title only at top level. Panel headings stay compact.
- Import panel: keep upload and account fields visible. Supported sources and coverage notes remain secondary sections.
- Month selector: always visible at the top of the workspace. Disabled state must still explain no months exist.
- Records: collapsed row shows Date, Description, Direction, Amount, Category. Expand reveals source identity, running balance, tags, edit, and delete.
- Add transaction: icon-first action. On mobile, label is visually hidden and icon target remains 42px.
- Danger actions: coral border/text, confirmation before submit.
- Forms: labels always visible, inputs full width, no placeholder-only fields.

## Accessibility Rules

- Text contrast must meet 4.5:1 on glass surfaces.
- Focus states use `--focus-ring` and must appear on buttons, selects, inputs, summary controls, and links.
- Hover must not shift layout. Use color, border, and shadow changes only.
- Respect `prefers-reduced-motion`.
- All interactive records use semantic `details` and `summary`.
- Mobile viewport 375px must have no horizontal page scroll. Dense internal tables may scroll inside their own container.

## Responsive QA

- 375px: login, upload, month selector, add transaction, expanded record actions.
- 768px: one-column workspace, readable metric cards, no clipped buttons.
- 1024px: two-column workspace may return if content has enough width.
- 1440px: header, import panel, and dashboard remain visually connected within max-width.

## Avoid

- Dark mode by default.
- Decorative blobs, bokeh, or one-note purple/blue gradients.
- Emoji icons.
- Nested page cards.
- Table-first layouts for mobile review.
- Hiding finance data behind management controls.
