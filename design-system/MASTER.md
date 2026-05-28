# FinState Design System

## Direction

FinState is a personal finance operations cockpit. The interface should feel precise, calm, and modern, with a futuristic layer created through crisp glass surfaces, dense data layout, and high-contrast financial signals.

## Product Pattern

- Primary experience: statement intake on the left, reconciliation workspace on the right.
- First screen goal: upload a supported bank or card statement and immediately understand what the system will validate.
- Dashboard goal: make balance confidence, cash movement, category totals, and transaction edits scan in that order.

## Visual System

- Base: near-white canvas with graphite text for trustworthy financial clarity.
- Surfaces: glass cards using translucent white, thin borders, and soft shadows.
- Accent set: electric blue for primary action, emerald for positive and balanced states, amber for warnings, coral for errors.
- Corners: 8px maximum on cards and controls.
- Motion: subtle 150-240ms color, border, and shadow transitions only. Respect reduced motion.

## Typography

- Preferred type: IBM Plex Sans.
- Fallback: Arial, Helvetica, sans-serif.
- Use compact headings inside panels. Reserve large text for the main workspace title only.

## UX Rules

- Show supported statement profiles before upload.
- Keep the upload action visually dominant.
- Use status chips for confidence and processing stage.
- Put reconciliation metrics before tables.
- Keep category editing inline so users do not lose ledger context.
- Tables must remain horizontally scrollable on small screens.

## Avoid

- Decorative continuous animation.
- Emoji icons.
- Low-contrast glass surfaces.
- Marketing hero layout.
- Nested cards.
