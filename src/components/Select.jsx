import { Children, Fragment, useCallback, useState } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'

const EMPTY = '__physio_empty__'

export default function Select({
  id,
  children,
  value = '',
  onChange,
  required = false,
  disabled = false,
  name,
}) {
  const [container, setContainer] = useState(null)
  const attachTrigger = useCallback((node) => {
    setContainer(node?.closest('dialog') || null)
  }, [])
  const options = Children.toArray(children).map((child) => ({
    value: String(child.props.value ?? child.props.children),
    label: child.props.children,
    disabled: child.props.disabled,
  }))
  const placeholder = options.find((option) => option.value === '')?.label || 'Please select'
  const items = options.filter((option) => !required || option.value !== '')
  const selectedValue = value || (required ? '' : EMPTY)
  return (
    <SelectPrimitive.Root
      value={selectedValue}
      onValueChange={(next) => onChange?.({ target: { value: next === EMPTY ? '' : next } })}
      required={required}
      disabled={disabled || !items.length}
      name={name}
    >
      <SelectPrimitive.Trigger ref={attachTrigger} id={id} className="select-trigger">
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="select-chevron">
          <ChevronDown size={17} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={container || undefined}>
        <SelectPrimitive.Content
          className="select-content"
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <SelectPrimitive.ScrollUpButton className="select-scroll">
            <ChevronUp size={16} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="select-viewport">
            {items.map((option, index) => (
              <Fragment key={option.value || EMPTY}>
                {index > 0 && <SelectPrimitive.Separator className="select-separator" />}
                <SelectPrimitive.Item
                  className="select-option"
                  value={option.value || EMPTY}
                  disabled={option.disabled}
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="select-check">
                    <Check size={16} />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              </Fragment>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select-scroll">
            <ChevronDown size={16} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
