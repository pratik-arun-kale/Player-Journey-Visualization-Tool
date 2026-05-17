import React from 'react'
import type { InvalidFileReason } from '../replay/fileValidation'

interface Props {
  invalids: InvalidFileReason[]
}

export function UploadErrorBanner({ invalids }: Props) {
  if (!invalids || invalids.length === 0) return null

  const grouped = invalids.slice(0, 20) // limit display

  return (
    <div className="upload-error-banner" role="alert" aria-live="assertive">
      <div className="ueb-title">Unsupported files skipped</div>
      <div className="ueb-sub">{invalids.length} file{invalids.length > 1 ? 's' : ''} were not processed</div>
      <ul className="ueb-list">
        {grouped.map((i, idx) => (
          <li key={idx}><strong>{i.name}</strong>: {i.reason}</li>
        ))}
      </ul>
    </div>
  )
}
