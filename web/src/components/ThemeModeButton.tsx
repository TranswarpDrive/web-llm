import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNextThemeMode, useThemeMode, type ThemeMode } from '@/lib/theme';

const THEME_LABELS: Record<ThemeMode, string> = {
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
};

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

interface ThemeModeButtonProps {
  className?: string;
}

export function ThemeModeButton({ className }: ThemeModeButtonProps) {
  const { themeMode, cycleThemeMode } = useThemeMode();
  const Icon = THEME_ICONS[themeMode];
  const nextMode = getNextThemeMode(themeMode);
  const label = `主题：${THEME_LABELS[themeMode]}，点击切换${THEME_LABELS[nextMode]}`;

  return (
    <button
      type="button"
      onClick={cycleThemeMode}
      className={cn('ui-icon-button h-9 w-9 bg-card shadow-sm ring-1 ring-border', className)}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
