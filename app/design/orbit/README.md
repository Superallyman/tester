# Orbit

A small UI kit: Mission-style restraint (monochrome, light numerals, tracked uppercase labels, tight corners) made
of Glass (frosted translucent surfaces with a specular top edge). Colour is kept for state and shows as a glow.

One CSS file, no build step, no JavaScript, any framework. `example.html` is a starter page that uses only
`orbit.css` (open it in a browser). The live showcase with copyable snippets is the
`/design` page of the app this came from.

## Add it to an app

1. **Copy `orbit.css`** into the app and load it once, globally:
   - Next.js / React: `import "./orbit.css";` in the root layout (or the one page that uses it)
   - Vite / CRA: `import "./orbit.css";` in `main.tsx`
   - Plain HTML: `<link rel="stylesheet" href="/orbit.css">`
2. **Add the `orbit` class** to the part of the page that should use it. Nothing outside it changes, so an
   existing app can adopt Orbit one screen at a time:
   ```html
   <body class="orbit orbit-backdrop">            <!-- whole app, with the horizon backdrop -->
   <section class="orbit"> … </section>           <!-- or just one area -->
   ```
3. **(Optional) the font.** Orbit asks for Barlow, then Inter, then the system font. To get Barlow:
   ```html
   <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@200;300;400;500;600&display=swap">
   ```
   or in Next.js: `const barlow = Barlow({ subsets: ["latin"], weight: ["200","300","400","500","600"], variable: "--orbit-font" })`
   and add `barlow.variable` next to `orbit`.
4. **Use the classes** (React: `className`):
   ```html
   <div class="orbit-card orbit-stack">
     <p class="orbit-label">Account</p>
     <h2 class="orbit-h2">Profile</h2>
     <input class="orbit-input" placeholder="Email">
     <button class="orbit-btn orbit-btn--primary">Save changes</button>
   </div>
   ```

## Dark mode

Set `data-theme` on the element with the `orbit` class:

| `data-theme` | Result |
|---|---|
| *(not set)* | Follows the host app: dark when an ancestor has the `dark` class or `data-theme="dark"` (next-themes, Tailwind `darkMode: "class"`, most theme switchers) |
| `light` / `dark` | Forced |
| `system` | Follows the operating system |

## Make it yours

Override any token on `.orbit` (or a more specific wrapper). The `/design` page builds this block for you:

```css
.orbit {
  --orbit-accent: #e31937;   /* focus rings, selection, progress, accent buttons */
  --orbit-radius: 4px;       /* every corner scales from this */
  --orbit-blur: 24px;        /* frost strength */
  --orbit-font: "Inter", system-ui, sans-serif;
}
```

Other tokens: `--orbit-accent-ink`, `--orbit-good`, `--orbit-bad`, `--orbit-warn`, `--orbit-ink`, `--orbit-ink-soft`,
`--orbit-primary-bg`, `--orbit-primary-fg`, `--orbit-glass-*`, `--orbit-track`, `--orbit-backdrop` (the gradient) and
`--orbit-backdrop-base` (the colour under it).

## Classes

| Class | Use |
|---|---|
| `orbit-title` `orbit-h2` `orbit-body` `orbit-muted` `orbit-label` `orbit-stat` | Type scale |
| `orbit-card` `orbit-glass` | Frosted surfaces |
| `orbit-btn` + `--primary` `--accent` `--danger` `--ghost` `--icon` | Buttons; `disabled` or `aria-disabled="true"` dims them |
| `orbit-segment` (buttons inside with `aria-pressed` / `aria-selected`) | Segmented control, tabs |
| `orbit-chip` (`aria-pressed="true"` or `.is-on`, `.is-excluded`) | Filter chips |
| `orbit-input` (also on `select` / `textarea`), `orbit-field` | Fields; `aria-invalid="true"` shows an error |
| `orbit-switch` on `<button role="switch" aria-checked>` | Toggle |
| `orbit-option` (`aria-checked`/`aria-pressed`/`.is-selected`, `.is-right`, `.is-wrong`, `.is-missed`) | Selectable rows, quiz answers |
| `orbit-badge` (`--good`, `--bad`), `orbit-alert` (`--good`, `--bad`, `--warn`) | Status |
| `orbit-progress` (+ `--good`) with a `<span style="width: 60%">` inside | Progress |
| `orbit-nav` with `aria-current="page"` on the active link | Navigation bar |
| `orbit-row` `orbit-stack` `orbit-divider` | Layout helpers |
| `orbit-backdrop` | The horizon / starfield background behind the glass |

State is carried by standard attributes (`aria-pressed`, `aria-checked`, `aria-selected`, `aria-current`,
`aria-invalid`, `disabled`) wherever one exists, so the markup is accessible by default.

## Browser support

Frosted glass uses `backdrop-filter` (all current browsers). Where it's missing, surfaces fall back to their
translucent fill, still readable. Colour mixing uses `color-mix()` (Chrome 111, Safari 16.2, Firefox 113).
