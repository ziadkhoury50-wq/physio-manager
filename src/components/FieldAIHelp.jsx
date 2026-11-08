import { useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen } from 'lucide-react'
import { Dialog } from './UI'
import ClinicalAssistant from './ClinicalAssistant'
import './FieldAIHelp.css'

export default function FieldAIHelp({ patient, sessions, draft, update, mode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="field-ai-trigger"
        disabled={!patient}
        aria-label={
          mode === 'treatment'
            ? 'AI help for treatment performed'
            : 'AI help for assessment findings'
        }
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <BookOpen size={14} />
        AI help
      </button>
      {open &&
        patient &&
        createPortal(
          <Dialog
            className="ai-field-popup"
            title={mode === 'treatment' ? 'Exercise & treatment ideas' : 'Assessment help'}
            subtitle="Review the clinical context, explore suggestions, then choose what to add."
            onClose={() => setOpen(false)}
          >
            <ClinicalAssistant
              patient={patient}
              sessions={sessions}
              draft={draft}
              update={update}
              mode={mode}
              initiallyOpen
              insertionTarget={mode === 'treatment' ? 'treatment' : 'assessment'}
            />
          </Dialog>,
          document.body,
        )}
    </>
  )
}
