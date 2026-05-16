import React, { useRef, useState, useCallback } from 'react'

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

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)

    // Use items API to support folders
    const items = Array.from(e.dataTransfer.items)
    if (!items.length) return

    setLoading(true)
    setLoaded(0)

    const entries = items
      .filter(i => i.kind === 'file')
      .map(i => i.webkitGetAsEntry())
      .filter(Boolean) as FileSystemEntry[]

    const allFiles: File[] = []
    for (const entry of entries) {
      const files = await readEntryFiles(entry)
      allFiles.push(...files)
    }

    const jsonFiles = allFiles.filter(f => f.name.endsWith('.json'))
    setLoaded(jsonFiles.length)
    setLoading(false)
    if (jsonFiles.length) onFiles(jsonFiles)
  }, [onFiles])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const files = Array.from(e.target.files).filter(f => f.name.endsWith('.json'))
    setLoaded(files.length)
    if (files.length) onFiles(files)
    e.target.value = '' // reset so same folder can be re-selected
  }, [onFiles])

  return (
    <div
      className={`upload-zone ${drag ? 'drag-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
    >
      <div className="up-icon">{loading ? '⏳' : loaded > 0 ? '✓' : '⬆'}</div>
      <div className="up-text">
        {loading
          ? <strong>Reading folder…</strong>
          : loaded > 0
            ? <strong style={{ color: 'var(--green)' }}>{loaded} files loaded</strong>
            : <strong>Drop folder or files here</strong>
        }
        <span>matches.json + February_10…14 folders</span>
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
    </div>
  )
}
