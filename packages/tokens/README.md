# @entire-vc/tokens

Design tokens for Entire VC brand family.

## Installation

```bash
pnpm add @entire-vc/tokens
```

## Usage

### 1. CSS Themes

Import a theme CSS file in your app:

```css
/* In your global CSS or app entry */
@import '@entire-vc/tokens/css/entire.css';
```

Available themes:
- `entire.css` - Base brand (neutral gray)
- `spark.css` - Spark brand (orange/fire) 🔥
- `playground.css` - Playground brand (blue/tech) 🌊
- `team-relay.css` - Team Relay (indigo/purple)

### 2. Tailwind Preset

Use the preset in your `tailwind.config.js`:

```js
const evcPreset = require('@entire-vc/tokens/tailwind');

module.exports = {
  presets: [evcPreset],
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  // your config...
};
```

### 3. TypeScript Tokens

Import tokens directly for programmatic use:

```ts
import { themes, fontFamily, spacing } from '@entire-vc/tokens';

// Access specific theme
const sparkPrimary = themes.spark.primary; // '#FF6A3D'

// Use typography
const fontStack = fontFamily.sans; // ['Inter', ...]
```

## Theme Switching

All themes use CSS variables. Switch themes by:

1. **Class-based**: Add `.dark` class to `<html>` for dark mode
2. **Theme-specific**: Use different CSS imports per project

```jsx
// React example with next-themes
import { ThemeProvider } from 'next-themes';

function App({ children }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system">
      {children}
    </ThemeProvider>
  );
}
```

## Color Reference

### Entire (Base)
| Token | Light | Dark |
|-------|-------|------|
| Primary | `#525769` | `#6B7280` |
| Secondary | `#DDE1E6` | `#374151` |

### Spark 🔥
| Token | Value |
|-------|-------|
| Primary | `#FF6A3D` (Orange) |
| Accent | `#FFC947` (Yellow) |
| Secondary | `#323643` (Dark) |

### Playground 🌊
| Token | Value |
|-------|-------|
| Primary | `#3D8BFF` (Blue) |
| Accent | `#33D6C9` (Cyan) |
| Secondary | `#AEB8C2` (Gray) |

### Team Relay
| Token | Value |
|-------|-------|
| Primary | `#6366F1` (Indigo) |
| Accent | `#8B5CF6` (Purple) |
| Secondary | `#E0E7FF` (Light Indigo) |
