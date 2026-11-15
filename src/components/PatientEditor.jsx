import { useEffect, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import './PatientEditor.css'

export default function PatientEditor({ title, subtitle, onClose, children }) {
  const heading = useRef(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [])
  return (
    <section className="patient-editor-page" aria-label="Patient details editor">
      <header className="patient-editor-heading">
        <div>
          <span className="eyebrow">PATIENT RECORD</span>
          <h1 tabIndex={-1} ref={heading}>
            {title}
          </h1>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="button secondary" onClick={onClose}>
          <ArrowLeft size={16} /> Back
        </button>
      </header>
      {children}
    </section>
  )
}
