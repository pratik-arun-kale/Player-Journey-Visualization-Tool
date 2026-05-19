import React, { useRef, useState, useCallback } from 'react'
import { validateReplayFiles } from '../replay/fileValidation'
import { UploadErrorBanner } from './UploadErrorBanner'

interface Props {
  onFiles: (files: File[]) => void
}

// Recursively read all files from a DataTransferItem (handles folders)
async function readEntryFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file(
        (f) => resolve([f]),
        () => resolve([])
      )
    })
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const allEntries: FileSystemEntry[] = []
    // createReader only returns up to 100 entries per call — loop until done
    await new Promise<void>((resolve) => {
      const readBatch = () => {
        reader.readEntries((batch) => {
          if (batch.length === 0) { resolve(); return }
          allEntries.push(...batch)
          readBatch()
        }, () => resolve())
      }
      readBatch()
    })
    const nested = await Promise.all(allEntries.map(readEntryFiles))
    return nested.flat()
  }
  return []
}

export function UploadZone({ onFiles }: Props) {
  const inputRef      = useRef<HTMLInputElement>(null)
  const folderRef     = useRef<HTMLInputElement>(null)
  const [drag, setDrag]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [loaded, setLoaded]     = useState(0)
  const [invalids, setInvalids] = useState<any[]>([])
  const [successFlash, setSuccessFlash] = useState(false)
  const [isHelperOpen, setIsHelperOpen] = useState(false)

  const NOTEBOOK_URL = 'https://colab.research.google.com/drive/1-Vxbe1GsLACg7VR8lOc92WGLIi1Ic31s#scrollTo=main'

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)

    // Use items API to support folders
    const items = Array.from(e.dataTransfer.items)
    if (!items.length) return

    setLoading(true)
    setLoaded(0)
    setInvalids([])

    const entries = items
      .filter(i => i.kind === 'file')
      .map(i => i.webkitGetAsEntry())
      .filter(Boolean) as FileSystemEntry[]

    const allFiles: File[] = []
    for (const entry of entries) {
      const files = await readEntryFiles(entry)
      allFiles.push(...files)
    }
    // validate
    const { valid, invalid } = await validateReplayFiles(allFiles)
    setLoaded(valid.length)
    setInvalids(invalid)
    setLoading(false)
    if (valid.length) {
      onFiles(valid)
      setSuccessFlash(true)
      setIsHelperOpen(false)
      setTimeout(() => setSuccessFlash(false), 1600)
    }
  }, [onFiles])

  const handleInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const all = Array.from(e.target.files)
    setLoading(true)
    setInvalids([])
    const { valid, invalid } = await validateReplayFiles(all)
    setLoaded(valid.length)
    setInvalids(invalid)
    setLoading(false)
    if (valid.length) {
      onFiles(valid)
      setSuccessFlash(true)
      setIsHelperOpen(false)
      setTimeout(() => setSuccessFlash(false), 1600)
    }
    e.target.value = '' // reset so same folder can be re-selected
  }, [onFiles])

  return (
    <>
      <div className={`upload-preprocess-card ${isHelperOpen ? 'open' : 'collapsed'}`}>
        <button
          type="button"
          className="preprocess-header"
          onClick={() => setIsHelperOpen(open => !open)}
          aria-expanded={isHelperOpen}
        >
          <span className="preprocess-arrow">▶</span>
          <span>Process Raw Telemetry Data</span>
          <span className="preprocess-hint">Click to {isHelperOpen ? 'collapse' : 'expand'}</span>
        </button>

        <div className="upload-preprocess-body">
          <div className="upload-preprocess-copy">
            <div className="upload-preprocess-headline">
              <span>Have raw <strong>.parquet</strong> gameplay files?</span>
              <button
                type="button"
                className="preprocess-tooltip"
                title="Parquet telemetry files are large and optimized for analytics pipelines. The notebook converts them into lightweight replay-ready JSON for fast browser visualization."
              >
                Why preprocessing?
              </button>
            </div>
            <p>Use the preprocessing notebook to:</p>
            <ul>
              <li>upload parquet files</li>
              <li>extract gameplay telemetry</li>
              <li>generate optimized replay JSON</li>
            </ul>
            <div className="upload-flow-line">Parquet Files → Processing Notebook → Replay JSON → Upload Here</div>
          </div>
          <a
            className="upload-preprocess-cta"
            href={NOTEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Processing Notebook
          </a>
        </div>
      </div>

      <div
        className={`upload-zone ${drag ? 'drag-over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
      >
      <div className="up-icon">{loading ? '⏳' : successFlash ? '✔' : loaded > 0 ? '✓' : '⬆'}</div>
      <div className="up-text">
        {loading
          ? <strong>Reading folder…</strong>
          : loaded > 0
            ? <strong style={{ color: 'var(--green)' }}>{loaded} files loaded</strong>
            : <strong>Drop folder or files here</strong>
        }
          <span>matches.json + February_10…14 folders</span>
          <div className="upload-warning">Only .json replay files are supported</div>
      </div>

      {/* Two buttons: pick files OR pick folder */}
      <div className="upload-btns">
        <button
          className="up-btn"
          onClick={() => inputRef.current?.click()}
          title="Select individual JSON files"
        >
          FILES
        </button>
        <button
          className="up-btn"
          onClick={() => folderRef.current?.click()}
          title="Select an entire folder (e.g. February_10)"
        >
          FOLDER
        </button>
      </div>

      {/* File picker */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
      {/* Folder picker — webkitdirectory reads entire folder tree */}
      <input
        ref={folderRef}
        type="file"
        // @ts-expect-error webkitdirectory is not in TS types but works in all modern browsers
        webkitdirectory=""
        multiple
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
      {/* Error banner (shows unsupported/skipped files) */}
      <UploadErrorBanner invalids={invalids} />
    </div>
    </>
  )
}
