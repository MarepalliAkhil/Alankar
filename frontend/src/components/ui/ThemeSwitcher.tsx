import { THEMES, themeLabels, type ThemeName } from '../../design/themes';
import { FilterChips } from './FilterChips';

/** Pick a theme (used to preview themes; pages choose their own theme automatically). */
export function ThemeSwitcher({
  value,
  onChange,
  themes = THEMES,
  label = 'Theme',
}: {
  value: ThemeName;
  onChange: (value: ThemeName) => void;
  themes?: readonly ThemeName[];
  label?: string;
}) {
  return (
    <FilterChips
      label={label}
      options={themes.map((t) => ({ value: t, label: themeLabels[t] }))}
      value={value}
      onChange={onChange}
    />
  );
}
