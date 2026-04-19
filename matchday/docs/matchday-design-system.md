# Matchday — Design System

> **Status:** Draft · **Updated:** 2026-04-18 · **Owner:** Pap
> **Inspiration:** Airbnb (clean, friendly, trustworthy) · Google Blue primary
> **Implementation:** shadcn/ui + Tailwind CSS · Inter typeface · Dark + Light mode

---

## Brand Identity

### Logo
- **Direction:** Abstract geometric mark + "Matchday" wordmark
- **Mark concept:** Abstract tournament bracket shape — geometric, minimal, works at 32px (favicon) and large sizes
- **Primary color:** Google Blue `#4285F4`
- **Style:** Clean, modern, tech-forward, sports-adjacent (NOT sporty/aggressive)
- **Status:** Needs generation — 3 concepts pending (Bracket Flow, Converging Paths, M Bracket)

---

## Color Palette

### Core Tokens

| Token | Light Mode | Dark Mode | Usage |
|---|---|---|---|
| `primary` | `#4285F4` | `#4285F4` | CTAs, active states, links |
| `primary-hover` | `#3367D6` | `#5A9BFF` | Button hover |
| `primary-foreground` | `#FFFFFF` | `#FFFFFF` | Text on primary buttons |
| `background` | `#FFFFFF` | `#0F0F0F` | Page background |
| `card` | `#FFFFFF` | `#1A1A1A` | Card surfaces |
| `muted` | `#F5F5F5` | `#262626` | Secondary surfaces, empty states |
| `border` | `#E5E5E5` | `#333333` | Dividers, card borders |
| `foreground` | `#1A1A1A` | `#FAFAFA` | Primary text |
| `muted-foreground` | `#737373` | `#A3A3A3` | Secondary text, labels |
| `destructive` | `#DC2626` | `#EF4444` | Cancel, delete, errors |
| `success` | `#16A34A` | `#22C55E` | Confirmed, completed |
| `warning` | `#F59E0B` | `#FBBF24` | Waitlisted, conflicts |

### Status Colors

| Status | Color | Badge style |
|---|---|---|
| Draft | `muted` | Gray pill |
| Registration Open | `primary` | Blue pill |
| Registration Closed | `warning` | Amber pill |
| Published | `primary` | Blue pill |
| Live | `success` + pulse animation | Green pill with pulse |
| Completed | `muted-foreground` | Gray pill |
| Cancelled | `destructive` | Red pill |
| Upcoming (match) | `muted` | Gray |
| In Progress (match) | `success` + pulse | Green pulse |
| Completed (match) | Default + checkmark | Scores shown |
| Walkover | `muted-foreground` | "W/O" badge |
| Retired | `warning` | "RET" badge |
| Bye | `muted` | "BYE" badge |

---

## Typography

**Typeface:** Inter (open source, geometric, clean — similar feel to Airbnb's Cereal)

| Level | Size | Weight | Usage |
|---|---|---|---|
| Display | 36px / 2.25rem | 700 (Bold) | Landing page hero |
| H1 | 30px / 1.875rem | 700 (Bold) | Page titles |
| H2 | 24px / 1.5rem | 600 (Semi-bold) | Section headers |
| H3 | 20px / 1.25rem | 600 (Semi-bold) | Card titles, tab headers |
| Body | 16px / 1rem | 400 (Regular) | Default text |
| Body small | 14px / 0.875rem | 400 (Regular) | Secondary info, table cells |
| Caption | 12px / 0.75rem | 500 (Medium) | Badges, timestamps, labels |

---

## Spacing & Layout

| Pattern | Value | Notes |
|---|---|---|
| Border radius (cards) | `rounded-xl` (12px) | Airbnb-style soft corners |
| Border radius (buttons) | `rounded-lg` (8px) | Slightly tighter than cards |
| Border radius (badges/avatars) | `rounded-full` | Pill badges, circular avatars |
| Card shadow | `shadow-sm` default, `shadow-md` on hover | Subtle elevation, hover lift |
| Card padding | 24px | Generous white space |
| Section gap | 32px | Between content sections |
| Max content width | 1280px | Centered with `mx-auto` |
| Side padding (mobile) | 16px | Breathing room on small screens |
| Grid | 12-column desktop | Single column mobile |
| Mobile breakpoint | 768px | Below = mobile layout |

---

## Component Patterns (shadcn/ui)

### Cards
- White surface (`card` token), `rounded-xl`, subtle `border`, `shadow-sm`
- Hover: lifts to `shadow-md` with transition
- Padding: 24px
- No heavy borders — clean and light

### Buttons
- **Primary:** filled Google Blue, white text, `rounded-lg`
- **Secondary:** outlined with `border`, text in `foreground`, `rounded-lg`
- **Destructive:** filled `destructive`, white text
- **Ghost:** no background, text only, subtle hover background
- All buttons: `h-10 px-4` default, `h-12 px-6` for large CTAs

### Status Badges
- Pill-shaped (`rounded-full`, `px-3 py-1`)
- Small caps caption text (12px, medium weight)
- Colored per status table above
- "Live" badge has CSS pulse animation

### Navigation
- **Desktop:** top bar — logo left, nav links center, avatar dropdown right
- **Mobile:** logo left, hamburger right → slide-out drawer from right
- Sticky on scroll, `border-b` separator, `background` color with slight blur backdrop

### Forms
- Label above input, `text-sm font-medium` label
- Clear placeholder text in `muted-foreground`
- Inline validation (error message + red border on invalid)
- Full-width inputs on mobile, max-width on desktop
- Select dropdowns use shadcn/ui `Select` component

### Tables
- Clean rows, minimal borders (`border-b` only between rows)
- No zebra striping in light mode
- Subtle zebra in dark mode (`muted` background on odd rows)
- Header row: `font-medium`, `muted-foreground` text, `border-b-2`

### Empty States
- Centered layout
- Subtle illustration or icon (muted color, not heavy)
- Descriptive message in `muted-foreground`
- Primary CTA button below
- Airbnb-inspired — friendly, not clinical

### Loading
- **Skeleton screens** (NOT spinners) — Airbnb's signature
- Skeleton shapes match the content they replace (card shapes, text line shapes)
- Subtle shimmer animation
- Use for: tournament list, bracket, registration list, admin dashboard

### Modals / Dialogs
- Centered on desktop, slide-up from bottom on mobile
- `rounded-xl`, `shadow-lg`
- Dark overlay backdrop (`bg-black/50`)
- Close: X button top-right, Esc key, click outside

### Toast Notifications
- Bottom-right on desktop, bottom-center on mobile
- Auto-dismiss after 5 seconds (with progress bar)
- Subtle slide-in animation
- Variants: default (info), success (green), error (red), warning (amber)

---

## Bracket View Styling

| Element | Style |
|---|---|
| Match node | `card` surface, `rounded-lg`, `border` |
| Completed match | Shows per-set scores, checkmark icon, winner name bold |
| In-progress match | Green left border (`success` color), subtle pulse |
| Upcoming match | Default styling, team names shown if known, "TBD" if not |
| Walkover/Retired | Muted styling, "W/O" or "RET" badge |
| Bye | Dotted border, "BYE" text in `muted-foreground` |
| Connector lines | `border` color, 2px width, clean right-angle connections |
| Spectator mode | Bracket fills viewport, no nav, large text via `clamp()` |

---

## Scheduling Grid Styling

| Element | Style |
|---|---|
| Grid lines | `border` color, 1px |
| Time headers | `caption` text, `muted-foreground` |
| Court labels | `body-small` text, `font-medium` |
| Match blocks | `primary` background (Google Blue), white text, `rounded-md` |
| Blocked cells | Diagonal stripes pattern in `muted`, cannot accept drops |
| Conflict highlight | Red border + red background tint on conflicting matches |
| Drag preview | Semi-transparent match block following cursor |
| Drop target highlight | Blue dashed border on valid drop zones |

---

## Responsive Behavior

### Mobile-First Approach

| Component | Desktop | Mobile |
|---|---|---|
| Navigation | Horizontal nav bar | Hamburger → drawer |
| Tournament cards | Grid (2-3 per row) | Full-width stack |
| Bracket view | Horizontal scrollable bracket | Horizontal scrollable bracket (same, but touch-friendly) |
| Scheduling grid | Full grid visible | Horizontal scroll, courts stack vertically |
| Score entry form | Side-by-side team scores | Stacked team scores |
| Tables | Full table | Card list (each row becomes a card) |
| Modals | Centered dialog | Full-screen or slide-up sheet |
| Forms | Max-width centered | Full-width |

### Touch Targets
- Minimum 44x44px for all interactive elements (Apple HIG guideline)
- Extra padding on mobile for drag-drop targets in scheduling grid
- Swipe-friendly tournament card navigation

---

## Dark Mode

- Toggled via system preference or manual toggle in settings
- Uses `dark:` Tailwind variants
- All color tokens have dark mode equivalents (see Color Palette above)
- Images/logos: provide both light and dark variants, or use CSS `filter` for simple inversions
- Bracket connector lines: lighter in dark mode for contrast
- Skeleton screens: darker shimmer animation

---

*End of Matchday Design System*
