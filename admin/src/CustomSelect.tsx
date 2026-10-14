import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

export interface CustomSelectOption {
  value: string
  label: string
}

export function CustomSelect({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  value: string
  options: CustomSelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus()
  }, [activeIndex, open])

  const openAt = (index: number) => {
    setActiveIndex(index)
    setOpen(true)
  }

  const selectOption = (option: CustomSelectOption) => {
    onChange(option.value)
    setOpen(false)
    rootRef.current?.querySelector('button')?.focus()
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openAt(selectedIndex)
    } else if (event.key === 'Home') {
      event.preventDefault()
      openAt(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      openAt(options.length - 1)
    }
  }

  const handleOptionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index + direction + options.length) % options.length)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      rootRef.current?.querySelector('button')?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className="custom-select" ref={rootRef}>
      <button
        type="button"
        className="custom-select-trigger text"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled || options.length === 0}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selected?.label ?? 'Choose an option'}</span>
        <span className={`custom-select-chevron${open ? ' is-open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element }}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={option.value === value}
              className="custom-select-option"
              onClick={() => selectOption(option)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              <span>{option.label}</span>
              {option.value === value && <span className="custom-select-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
