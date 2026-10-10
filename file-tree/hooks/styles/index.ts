import type { StyleName } from '../settings'
import type { Style } from '../segments'
import { ide } from './ide'
import { minimal } from './minimal'
import { rich } from './rich'

export const STYLES: Record<StyleName, Style> = { ide, minimal, rich }
