import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Palette } from 'lucide-react'
import { presetData, themes } from '../theme'

interface Props {
  themeId: string
  onChange: (id: string) => void
}

function Item({ id, current, onChange }: { id: string; current: string; onChange: (id: string) => void }) {
  const theme = themes.get(id)
  return (
    <DropdownMenu.RadioItem className="menu-item" value={id} onSelect={() => onChange(id)}>
      <span className="menu-indicator">
        <DropdownMenu.ItemIndicator>
          <Check size={13} strokeWidth={2.2} />
        </DropdownMenu.ItemIndicator>
      </span>
      <span className="menu-swatch" style={{ background: theme?.colors?.background ?? theme?.variants?.dark?.background }} />
      <span className="menu-label">{theme?.name ?? id}</span>
      {current === id ? <span className="menu-current">当前</span> : null}
    </DropdownMenu.RadioItem>
  )
}

export function ThemePresetMenu({ themeId, onChange }: Props) {
  const current = themes.get(themeId)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="toolbar-button" title="Color Presets">
          <Palette size={15} />
          <span className="toolbar-button-label">{current?.name ?? '配色'}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu-content" sideOffset={6} align="end">
          <DropdownMenu.RadioGroup value={themeId} onValueChange={onChange}>
            <DropdownMenu.Label className="menu-label-header">Color Presets</DropdownMenu.Label>
            {presetData.menu.radio.map((id) => (
              <Item key={id} id={id} current={themeId} onChange={onChange} />
            ))}
            {presetData.menu.separatorAfterRadio ? <DropdownMenu.Separator className="menu-separator" /> : null}
            {presetData.menu.list.map((id) => (
              <Item key={id} id={id} current={themeId} onChange={onChange} />
            ))}
            <DropdownMenu.Separator className="menu-separator" />
            {presetData.menu.custom.map((id) => (
              <Item key={id} id={id} current={themeId} onChange={onChange} />
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="menu-separator" />
          <DropdownMenu.Item className="menu-item is-muted" disabled>
            Import .itermcolors…（即将支持）
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
