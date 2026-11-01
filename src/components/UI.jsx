import { cloneElement, useId, useLayoutEffect, useRef } from 'react'
import { Activity, FileText, X } from 'lucide-react'
import { initials } from '../lib/dates'

export function Brand() {
  return (
    <a className="brand" href="#/calendar" aria-label="PhysioManager home">
      <span className="brand-mark">
        <Activity size={24} strokeWidth={2.2} />
      </span>
      <span>
        physio<span className="brand-light">manager</span>
        <small>CLINICAL WORKSPACE</small>
      </span>
    </a>
  )
}
export function IconButton({ label, children, ...props }) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}
export function Empty({ icon: Icon = FileText, title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={27} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  )
}
export function Avatar({ name, index = 0, large = false }) {
  return (
    <span className={`avatar tone-${index % 4} ${large ? 'large' : ''}`}>{initials(name)}</span>
  )
}
export function Field({ label, children, wide = false }) {
  const id = useId()
  return (
    <div className={`field ${wide ? 'wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  )
}
export function Dialog({ title, subtitle, onClose, children, wide = false }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const previous = document.activeElement
    const dialog = ref.current
    dialog.showModal()
    dialog.querySelector('input, [role="combobox"], textarea')?.focus()
    return () => {
      dialog.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog-wide' : ''}`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose()
        }
      }}
      aria-labelledby="dialog-title"
      aria-modal="true"
    >
      <div className="dialog-header">
        <div>
          <h2 id="dialog-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  )
}
