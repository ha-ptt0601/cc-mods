export const STYLE_NAMES = ['ide', 'minimal', 'rich'] as const
export type StyleName = (typeof STYLE_NAMES)[number]

export type Settings = {
  style: StyleName
  layout: 'replace' | 'split'
  openWith: string
  follow: boolean
  icons: 'nerd' | 'unicode'
  showIgnored: boolean
}

/**
 * Whether `value` names one of the styles.
 */
export function isStyle(value: unknown): value is StyleName {
  return typeof value === 'string' && (STYLE_NAMES as readonly string[]).includes(value)
}

/**
 * The settings from the plugin's `userConfig` options, defaults filled in.
 */
export function settingsOf(options: Record<string, unknown> | undefined): Settings {
  const o = options ?? {}

  return {
    style: isStyle(o.style) ? o.style : 'ide',
    layout: o.previewLayout === 'split' ? 'split' : 'replace',
    openWith: typeof o.openWith === 'string' ? o.openWith : '',
    follow: o.followClaude !== 'off',
    icons: o.icons === 'nerd' ? 'nerd' : 'unicode',
    showIgnored: o.showIgnored === 'on',
  }
}

/**
 * The style after `style` in the ◐ button's cycle.
 */
export function nextStyle(style: StyleName): StyleName {
  return STYLE_NAMES[(STYLE_NAMES.indexOf(style) + 1) % STYLE_NAMES.length] ?? 'ide'
}

/**
 * The style to draw: the ◐ button's stored choice while /config still holds
 * the value it overrode, else /config's.
 *
 * @param config the style /config holds
 * @param stored what the button stored: `{ style, over }`
 */
export function effectiveStyle(config: StyleName, stored: unknown): StyleName {
  const o = stored && typeof stored === 'object' ? (stored as { style?: unknown; over?: unknown }) : undefined

  return o && o.over === config && isStyle(o.style) ? o.style : config
}
