# CityCatalyst Design System Specification

This document defines the visual identity, typography, button system, color tokens, and CSS theme used across the NBS Project Builder platform. All styling originates from **CityCatalyst**, Open Earth Foundation's climate data platform. Any standalone app (e.g. the NBS Map Visualizer) built from the `NBS_MAP_VISUALIZER_SPEC.md` MUST use this design system to stay visually consistent with the main platform.

---

## 1. Design System Origin

The NBS platform inherits its visual identity from **CityCatalyst** (`citycatalyst.openearth.dev`), which establishes:

- **Primary brand color**: `#001fa8` (also `#001EA7` in Chakra tokens) — a deep blue used for all primary actions, active states, focus rings, and sidebar highlights
- **Font**: **Poppins** (Google Fonts) — weights 300 through 700
- **Dark mode**: The map visualizer and Site Explorer are designed for dark mode (CartoDB Dark Matter basemap). Dark mode is toggled by adding `class="dark"` to the `<html>` element. The standalone map visualizer should add the `dark` class by default on initialization
- **Component library**: Two separate UI libraries work together (see Section 3)

---

## 2. Font Setup

### Google Fonts Import (in CSS)

```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
```

### CSS Variable (for Tailwind/shadcn)

```css
:root {
  --font-sans: Poppins, system-ui, sans-serif;
  --font-serif: Georgia, serif;
  --font-mono: Menlo, monospace;
}
```

### Chakra Token (for @oef/components)

```typescript
fonts: {
  heading: { value: 'var(--font-poppins)' },
  body: { value: 'var(--font-opensans)' },
}
```

Note: The Chakra heading font references `--font-poppins`. In practice, `@oef/components` typography renders with the Poppins font loaded via Google Fonts.

### Tailwind Config

```typescript
fontFamily: {
  sans: ['var(--font-sans)'],
  serif: ['var(--font-serif)'],
  mono: ['var(--font-mono)'],
},
```

Usage: All Tailwind text inherits Poppins via `font-sans` by default. The `body` tag applies `@apply font-sans antialiased`.

---

## 3. Two-Library Component Pattern

The platform uses **two separate UI systems** that are visually coordinated but operate on different token mechanisms:

### Important: Two Token Systems

| System | Token Mechanism | Used By |
|--------|----------------|---------|
| **Tailwind CSS variables** | CSS custom properties (`:root` / `.dark`) consumed by Tailwind classes | shadcn/ui components, all Tailwind utility classes |
| **Chakra UI tokens** | JavaScript theme object passed to `ChakraProvider` | `@oef/components` typography and `CCTerraButton` |

These are NOT the same system. They are visually aligned (same brand blue, same font) but technically independent. The Tailwind CSS vars drive shadcn/ui components, while Chakra tokens drive `@oef/components`. Both must be configured in the app.

---

### `@oef/components` (v1.1.0) — CityCatalyst Branded Components

**npm package**: `@oef/components`
**Peer dependencies**: `@chakra-ui/react` (>=3.8.0), `@emotion/react` (>=11.14.0), `react` (>=18.0.0), `react-dom` (>=18.0.0)

This package provides CityCatalyst's branded typography and button components, built on Chakra UI. Use these for:
- Page headers and titles
- Navigation text
- Login/auth pages
- City cards and information displays
- Any UI that should match CityCatalyst's visual identity exactly

#### Chakra Provider Setup (Required)

To use `@oef/components`, the app must wrap its root in a `ChakraProvider` with the CityCatalyst theme:

```tsx
// main.tsx
import { ChakraProvider, createSystem, defaultConfig } from '@chakra-ui/react';
import { appTheme } from './app-theme';

const root = createRoot(document.getElementById('root')!);
root.render(
  <ChakraProvider value={appTheme}>
    <App />
  </ChakraProvider>
);
```

The full Chakra theme is defined in `app-theme.ts` (see Section 4A).

#### Exported Typography Components

| Category | Components | Chakra Base |
|----------|-----------|-------------|
| Display | `DisplayLarge`, `DisplayMedium`, `DisplaySmall` | `HeadingProps` |
| Headline | `HeadlineLarge`, `HeadlineMedium`, `HeadlineSmall` | `HeadingProps` |
| Title | `TitleLarge`, `TitleMedium`, `TitleSmall` | `HeadingProps` |
| Body | `BodyXLarge`, `BodyLarge`, `BodyMedium`, `BodySmall` | `TextProps` |
| Label | `LabelLarge`, `LabelMedium`, `LabelSmall` | `TextProps` |
| Button Text | `ButtonMedium`, `ButtonSmall` | `TextProps` |
| Overline | `Overline` | `TextProps` |

#### Typography Size Scale

| Component | Font Size |
|-----------|-----------|
| `DisplayLarge` | 57px |
| `DisplayMedium` | 45px |
| `DisplaySmall` | 36px |
| `HeadlineLarge` | 32px |
| `HeadlineMedium` | 28px |
| `HeadlineSmall` | 24px |
| `TitleLarge` | 22px |
| `TitleMedium` | 16px |
| `TitleSmall` | 14px |
| `BodyXLarge` | 22px |
| `BodyLarge` | 16px |
| `BodyMedium` | 14px |
| `BodySmall` | 12px |
| `LabelLarge` | 14px |
| `LabelMedium` | 12px |
| `LabelSmall` | 11px |
| `ButtonMedium` | 14px |
| `ButtonSmall` | 12px |
| `Overline` | 10px |

#### Typography Props
- All components accept a `color` prop using Chakra semantic tokens (e.g. `'content.tertiary'`, `'content.secondary'`)
- Body/Headline components accept a `text` prop as an alternative to `children`
- All extend standard Chakra `HeadingProps` or `TextProps`

#### Exported Button

| Component | Variants | Props |
|-----------|----------|-------|
| `CCTerraButton` | `"filled"`, `"outlined"`, `"text"` | `variant`, `status` (`"default"` \| `"active"`), `isError`, `leftIcon`, `rightIcon` |

#### Usage Examples (from our codebase)

```tsx
import { CCTerraButton } from '@oef/components';
import { TitleMedium, BodySmall, LabelSmall } from '@oef/components';
import { DisplayLarge } from '@oef/components';
import { HeadlineLarge, BodyMedium } from '@oef/components';

// Page header
<DisplayLarge>Porto Alegre</DisplayLarge>

// Section title
<HeadlineLarge>Selected Actions</HeadlineLarge>

// Card title + description
<TitleMedium>{inventory.year}</TitleMedium>
<BodySmall color='content.tertiary'>Description text</BodySmall>

// Branded button
<CCTerraButton variant="filled" onClick={handleLogin}>
  Log In
</CCTerraButton>
```

---

### shadcn/ui — Form Controls & Map UI

**Setup**: Individual component files in `components/ui/`, NOT an npm package
**Base**: Radix UI primitives + Tailwind CSS + `class-variance-authority`
**Token system**: Consumes CSS custom properties defined in `:root` and `.dark` (Section 4B)

Use shadcn/ui for:
- Buttons (general actions, map controls, layer toggles)
- Form inputs, selects, switches
- Cards, tooltips, dialogs, accordions
- Badges, progress bars, skeletons
- Toast notifications

**Required shadcn/ui components:**
`button`, `badge`, `card`, `tooltip`, `tabs`, `dialog`, `select`, `input`, `label`, `switch`, `accordion`, `scroll-area`, `separator`, `toast`, `toaster`, `skeleton`, `spinner`, `progress`

---

### When to Use Which

| Use Case | Library |
|----------|---------|
| Page title / heading | `@oef/components` (`DisplayLarge`, `HeadlineLarge`, etc.) |
| Body text in branded sections | `@oef/components` (`BodyMedium`, `BodySmall`) |
| Primary branded button (login, main CTA) | `@oef/components` (`CCTerraButton`) |
| Map control button | shadcn/ui (`Button`) |
| Form input / select / toggle | shadcn/ui |
| Card panel / tooltip / dialog | shadcn/ui |
| Badge / label in map UI | shadcn/ui (`Badge`) |
| Small label text in cards | `@oef/components` (`LabelSmall`, `LabelMedium`) |

---

## 4A. Chakra UI Theme (for `@oef/components`)

This theme is passed to `ChakraProvider` and defines the token system used by `@oef/components` typography and buttons. The default theme is `blue_theme`.

```typescript
// app-theme.ts
import { createSystem, defaultConfig } from '@chakra-ui/react';

export const appTheme = createSystem(defaultConfig, {
  globalCss: {
    html: { colorPalette: 'brand' },
    body: { bg: 'background.backgroundLight' },
  },
  theme: {
    tokens: {
      colors: {
        brand: {
          primary: { value: '#001EA7' },
          secondary: { value: '#2351DC' },
          50: { value: '#f5f7fd' },
          100: { value: '#d8e0f9' },
          200: { value: '#b5c5f3' },
          300: { value: '#8ba4ed' },
          400: { value: '#7391e9' },
          500: { value: '#2351DC' },
          600: { value: '#345fdf' },
          700: { value: '#1f48c4' },
          800: { value: '#1a3da6' },
          900: { value: '#001EA7' },
        },
        content: {
          primary: { value: '#00001F' },
          secondary: { value: '#232640' },
          tertiary: { value: '#7A7B9A' },
          link: { value: '#2351DC' },
          alternative: { value: '#001EA7' },
        },
        semantic: {
          success: { value: '#24BE00' },
          successOverlay: { value: '#EFFDE5' },
          warning: { value: '#C98300' },
          warningOverlay: { value: '#FEF8E1' },
          danger: { value: '#F23D33' },
          dangerOverlay: { value: '#FFEAEE' },
          info: { value: '#2351DC' },
        },
        base: {
          light: { value: '#FFFFFF' },
          dark: { value: '#00001F' },
        },
        border: {
          neutral: { value: '#D7D8FA' },
          overlay: { value: '#E6E7FF' },
        },
        background: {
          default: { value: '#FFFFFF' },
          neutral: { value: '#E8EAFB' },
          alternative: { value: '#EFFDE5' },
          overlay: { value: '#C5CBF5' },
          backgroundLight: { value: '#FAFAFA' },
        },
        interactive: {
          secondary: { value: '#2351DC' },
        },
      },
      fonts: {
        heading: { value: 'var(--font-poppins)' },
        body: { value: 'var(--font-opensans)' },
      },
      fontSizes: {
        display: { lg: { value: '57px' }, md: { value: '45px' }, sm: { value: '36px' } },
        headline: { lg: { value: '32px' }, md: { value: '28px' }, sm: { value: '24px' } },
        title: { lg: { value: '22px' }, md: { value: '16px' }, sm: { value: '14px' } },
        body: { xl: { value: '22px' }, lg: { value: '16px' }, md: { value: '14px' }, sm: { value: '12px' } },
        label: { lg: { value: '14px' }, md: { value: '12px' }, sm: { value: '11px' } },
        button: { md: { value: '14px' }, sm: { value: '12px' } },
        overline: { value: '10px' },
      },
      fontWeights: {
        light: { value: 300 },
        regular: { value: 400 },
        medium: { value: 500 },
        semibold: { value: 600 },
        bold: { value: 700 },
      },
      shadows: {
        '1dp': { value: '0px 1px 2px -1px #0000001A, 0px 1px 3px 0px #00001F1A' },
        '2dp': { value: '0px 2px 4px -2px #0000001A, 0px 4px 6px -1px #0000001A' },
        '4dp': { value: '0px 4px 6px -4px #0000001A, 0px 10px 15px -3px #0000001A' },
        '8dp': { value: '0px 8px 10px -6px #0000001A, 0px 20px 25px -5px #0000001A' },
      },
      radii: {
        minimal: { value: '4px' },
        rounded: { value: '8px' },
        'rounded-xl': { value: '16px' },
      },
      spacing: {
        xs: { value: '4px' },
        s: { value: '8px' },
        m: { value: '16px' },
        l: { value: '24px' },
        xl: { value: '32px' },
      },
    },
    semanticTokens: {
      colors: {
        brand: {
          solid: { value: '{colors.brand.500}' },
          contrast: { value: '{colors.brand.100}' },
          fg: { value: '{colors.brand.700}' },
          muted: { value: '{colors.brand.100}' },
          subtle: { value: '{colors.brand.200}' },
        },
        content: {
          alternative: { value: { base: '{colors.content.alternative}' } },
          link: { value: { base: '{colors.content.link}' } },
          tertiary: { value: { base: '{colors.content.tertiary}' } },
          secondary: { value: { base: '{colors.content.secondary}' } },
          primary: { value: { base: '{colors.content.primary}' } },
        },
      },
    },
  },
});
```

---

## 4B. Tailwind CSS Variables (for shadcn/ui)

These CSS custom properties drive all shadcn/ui components and Tailwind utility classes. They are defined in `index.css`.

### Light Mode (`:root`)

```css
:root {
  --background: hsl(210 40% 96%);
  --foreground: hsl(222.2 84% 4.9%);
  --card: hsl(0 0% 100%);
  --card-foreground: hsl(222.2 84% 4.9%);
  --popover: hsl(0 0% 100%);
  --popover-foreground: hsl(222.2 84% 4.9%);
  --primary: hsl(224, 100%, 33%);           /* #001fa8 — CityCatalyst blue */
  --primary-foreground: hsl(210 40% 98%);
  --secondary: hsl(215 28% 17%);
  --secondary-foreground: hsl(210 40% 98%);
  --muted: hsl(210 40% 96%);
  --muted-foreground: hsl(215.4 16.3% 46.9%);
  --accent: hsl(210 40% 96%);
  --accent-foreground: hsl(222.2 47.4% 11.2%);
  --destructive: hsl(0, 84%, 60%);          /* #ef4444 — Red */
  --destructive-foreground: hsl(210 40% 98%);
  --success: hsl(132, 76%, 36%);            /* #16a34a — Green */
  --success-foreground: hsl(0 0% 100%);
  --border: hsl(214.3 31.8% 91.4%);
  --input: hsl(214.3 31.8% 91.4%);
  --ring: hsl(224, 100%, 33%);
  --chart-1: hsl(224, 100%, 33%);
  --chart-2: hsl(159.7826 100% 36.0784%);
  --chart-3: hsl(42.029 92.8251% 56.2745%);
  --chart-4: hsl(147.1429 78.5047% 41.9608%);
  --chart-5: hsl(341.4894 75.2% 50.9804%);
  --sidebar: hsl(180 6.6667% 97.0588%);
  --sidebar-foreground: hsl(210 25% 7.8431%);
  --sidebar-primary: hsl(224, 100%, 33%);
  --sidebar-primary-foreground: hsl(0 0% 100%);
  --sidebar-accent: hsl(210 40% 96%);
  --sidebar-accent-foreground: hsl(222.2 47.4% 11.2%);
  --sidebar-border: hsl(214.3 31.8% 91.4%);
  --sidebar-ring: hsl(224, 100%, 33%);
  --font-sans: Poppins, system-ui, sans-serif;
  --font-serif: Georgia, serif;
  --font-mono: Menlo, monospace;
  --radius: 0.5rem;
}
```

### Dark Mode (`.dark`)

```css
.dark {
  --background: hsl(0 0% 0%);
  --foreground: hsl(200 6.6667% 91.1765%);
  --card: hsl(228 9.8039% 10%);
  --card-foreground: hsl(0 0% 85.098%);
  --popover: hsl(0 0% 0%);
  --popover-foreground: hsl(200 6.6667% 91.1765%);
  --primary: hsl(224, 100%, 33%);           /* Same blue in both modes */
  --primary-foreground: hsl(0 0% 100%);
  --secondary: hsl(195 15.3846% 94.902%);
  --secondary-foreground: hsl(210 25% 7.8431%);
  --muted: hsl(0 0% 9.4118%);
  --muted-foreground: hsl(210 3.3898% 46.2745%);
  --accent: hsl(228 9.8039% 10%);
  --accent-foreground: hsl(200 6.6667% 91.1765%);
  --destructive: hsl(0, 84%, 60%);
  --destructive-foreground: hsl(0 0% 100%);
  --success: hsl(132, 76%, 36%);
  --success-foreground: hsl(0 0% 100%);
  --border: hsl(210 5.2632% 14.902%);
  --input: hsl(207.6923 27.6596% 18.4314%);
  --ring: hsl(224, 100%, 33%);
  --chart-1: hsl(224, 100%, 33%);
  --chart-2: hsl(159.7826 100% 36.0784%);
  --chart-3: hsl(42.029 92.8251% 56.2745%);
  --chart-4: hsl(147.1429 78.5047% 41.9608%);
  --chart-5: hsl(341.4894 75.2% 50.9804%);
  --sidebar: hsl(228 9.8039% 10%);
  --sidebar-foreground: hsl(0 0% 85.098%);
  --sidebar-primary: hsl(224, 100%, 33%);
  --sidebar-primary-foreground: hsl(0 0% 100%);
  --sidebar-accent: hsl(228 9.8039% 10%);
  --sidebar-accent-foreground: hsl(200 6.6667% 91.1765%);
  --sidebar-border: hsl(210 5.2632% 14.902%);
  --sidebar-ring: hsl(224, 100%, 33%);
  --font-sans: Poppins, system-ui, sans-serif;
  --font-serif: Georgia, serif;
  --font-mono: Menlo, monospace;
  --radius: 0.5rem;
}
```

**Key design decision**: `--primary` is the same `hsl(224, 100%, 33%)` in both light and dark mode. The CityCatalyst blue is a constant across themes.

> **Note — Sidebar token mismatch**: The Tailwind config maps `sidebar.DEFAULT` to `var(--sidebar-background)`, but the CSS defines `--sidebar` (not `--sidebar-background`). If you use the sidebar Tailwind classes, either rename the CSS variable to `--sidebar-background` or update the Tailwind mapping to `var(--sidebar)`.

---

## 5. Button Styling System

### Variant Colors (shadcn/ui Button)

| Variant | Background | Text | Use For |
|---------|-----------|------|---------|
| `default` | `#001fa8` (primary blue) | White | Main action buttons |
| `success` | `#16a34a` (green) | White | Positive/save actions |
| `destructive` | `#ef4444` (red) | White | Dangerous actions |
| `outline` | Transparent + border | Foreground | Secondary actions |
| `secondary` | Dark gray | White | Alternative actions |
| `ghost` | Transparent | Foreground | Subtle/inline actions |
| `link` | None | Primary | Text-style links |

### Usage (shadcn/ui Button)

```tsx
<Button>Primary Action</Button>
<Button variant="success">Save Changes</Button>
<Button variant="outline">Cancel</Button>
<Button variant="destructive">Delete</Button>
```

### Usage (CCTerraButton — branded, Chakra-based)

```tsx
<CCTerraButton variant="filled">Log In to CityCatalyst</CCTerraButton>
<CCTerraButton variant="outlined">Secondary Action</CCTerraButton>
<CCTerraButton variant="text">Text Link</CCTerraButton>
```

---

## 6. Tailwind CSS Configuration

### Full `tailwind.config.ts`

```typescript
import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./client/index.html', './client/src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        success: {
          DEFAULT: 'var(--success)',
          foreground: 'var(--success-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        chart: {
          '1': 'var(--chart-1)',
          '2': 'var(--chart-2)',
          '3': 'var(--chart-3)',
          '4': 'var(--chart-4)',
          '5': 'var(--chart-5)',
        },
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          foreground: 'var(--sidebar-foreground)',
          primary: 'var(--sidebar-primary)',
          'primary-foreground': 'var(--sidebar-primary-foreground)',
          accent: 'var(--sidebar-accent)',
          'accent-foreground': 'var(--sidebar-accent-foreground)',
          border: 'var(--sidebar-border)',
          ring: 'var(--sidebar-ring)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        mono: ['var(--font-mono)'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
} satisfies Config;
```

> **Note**: The sidebar `DEFAULT` here uses `var(--sidebar)` — corrected from the original `var(--sidebar-background)` to match the actual CSS variable name.

---

## 7. Base CSS Layer & Global Styles

```css
@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply font-sans antialiased bg-background text-foreground;
  }
}
```

### Custom Scrollbar

```css
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: var(--muted);
}
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--muted-foreground);
}
```

### Fade-In Animation

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.5s ease-out;
}
```

---

## 8. Map-Specific CSS

These styles are required for any page using Leaflet maps:

```css
.leaflet-container {
  height: 100%;
  width: 100%;
  border-radius: var(--radius);
  z-index: 0;
}

.leaflet-top,
.leaflet-bottom {
  z-index: 999 !important;
}

.site-explorer-panel {
  pointer-events: auto !important;
  isolation: isolate;
  contain: layout style;
}

.site-explorer-panel * {
  pointer-events: auto;
}

.site-explorer-panel [data-radix-scroll-area-viewport] {
  overscroll-behavior: contain;
  pointer-events: auto !important;
  overflow-y: auto !important;
  max-height: 100%;
}

.site-explorer-panel button,
.site-explorer-panel [role="button"] {
  pointer-events: auto !important;
  position: relative;
  z-index: 1;
  cursor: pointer;
}

.site-explorer-panel:hover ~ .leaflet-container,
.site-explorer-panel:focus-within ~ .leaflet-container {
  pointer-events: none;
}
```

**Why**: Leaflet captures all pointer events on the map container. These overrides ensure that UI panels overlaid on the map (evidence drawer, zone panels) remain interactive. The `isolation: isolate` and `contain: layout style` prevent Leaflet's z-index stacking from interfering.

---

## 9. CityCatalyst Tab Component

A branded "Return to CityCatalyst" tab pinned to the bottom-left corner:

```tsx
export function CityCatalystTab() {
  return (
    <div className='fixed bottom-0 left-0 z-50'>
      <div
        className='rounded-tr-2xl px-6 py-4 shadow-lg'
        style={{ backgroundColor: '#3B63C4', fontFamily: 'Poppins, sans-serif' }}
      >
        <div className='flex items-center gap-3'>
          <a
            href='https://citycatalyst.openearth.dev'
            className='w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center p-1 hover:bg-white/30 transition-colors'
          >
            {/* CityCatalyst icon */}
          </a>
          <div className='text-white'>
            <div className='text-sm font-medium'>
              <a href='https://citycatalyst.openearth.dev' className='hover:underline font-semibold'>
                Go back to CityCatalyst
              </a>
            </div>
            <div className='text-xs opacity-90'>
              Exit module and return to the main platform
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Color: `#3B63C4` — a lighter CityCatalyst accent blue used specifically for this tab.

---

## 10. Icon Library

**Package**: `lucide-react`

Used throughout for action icons and visual cues. Common icons in the map UI:

```tsx
import {
  Layers, MapPin, AlertTriangle, Droplets, Thermometer,
  Mountain, TreePine, Building2, Users, ChevronDown, ChevronUp,
  Eye, EyeOff, Info, X, Search, Plus, Minus, LocateFixed,
  ZoomIn, ZoomOut, Download, Settings, Filter
} from 'lucide-react';
```

---

## 11. `cn()` Utility

The `clsx` + `tailwind-merge` utility used everywhere for conditional class names:

```typescript
// lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 12. Dark Mode Implementation

```typescript
// Tailwind config
darkMode: ['class']

// Toggle: add/remove 'dark' class on document.documentElement
document.documentElement.classList.add('dark');    // enable
document.documentElement.classList.remove('dark'); // disable
```

**For the map visualizer**: Dark mode should be ON by default. Add this in your app initialization:

```tsx
// In main.tsx or App.tsx, before rendering
useEffect(() => {
  document.documentElement.classList.add('dark');
}, []);
```

This is recommended because the map uses CartoDB Dark Matter basemap and the dark UI panels look best against it. The main NBS platform does not enforce dark mode globally — each module decides.

Always use explicit light/dark variants in Tailwind:
```tsx
className="bg-white dark:bg-black text-black dark:text-white"
className="bg-card dark:bg-card border-border"  // uses CSS variables, auto-switches
```

---

## 13. npm Dependencies Summary

| Package | Version | Purpose |
|---------|---------|---------|
| `@oef/components` | 1.1.0 | CityCatalyst typography + CCTerraButton |
| `@chakra-ui/react` | >=3.8.0 | Peer dep for @oef/components |
| `@emotion/react` | >=11.14.0 | Peer dep for @oef/components |
| `react` | >=18.0.0 | Peer dep for @oef/components |
| `react-dom` | >=18.0.0 | Peer dep for @oef/components |
| `tailwindcss` | ^3.4 | Utility-first CSS |
| `tailwindcss-animate` | latest | Animation utilities for shadcn/ui |
| `@tailwindcss/typography` | latest | Prose styling |
| `class-variance-authority` | latest | Variant management for shadcn/ui |
| `clsx` | latest | Conditional class names |
| `tailwind-merge` | latest | Tailwind class deduplication |
| `lucide-react` | latest | Icons |
| `@radix-ui/react-*` | latest | Primitives for shadcn/ui components |
