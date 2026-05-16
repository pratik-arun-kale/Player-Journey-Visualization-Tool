import React from 'react'
import type { Layers } from '../types'

interface Props {
  layers: Layers
  onToggle: (layer: keyof Layers) => void
}

const LAYER_DEFS: { key: keyof Layers; label: string; cls: string }[] = [
  { key: 'paths',   label: 'PATHS',  cls: 'layer-paths'  },
  { key: 'kills',   label: 'KILLS',  cls: 'layer-kills'  },
  { key: 'loot',    label: 'LOOT',   cls: 'layer-loot'   },
  { key: 'storm',   label: 'STORM',  cls: 'layer-storm'  },
  { key: 'heatmap', label: 'HEAT',   cls: 'layer-heat'   },
  { key: 'bots',    label: 'BOTS',   cls: 'layer-bots'   },
]

export function LayerToggles({ layers, onToggle }: Props) {
  return (
    <div className="panel-section">
      <div className="panel-title">// Layers</div>
      <div className="toggle-row">
        {LAYER_DEFS.map(({ key, label, cls }) => (
          <button
            key={key}
            className={`toggle-btn ${cls} ${layers[key] ? 'on' : ''}`}
            onClick={() => onToggle(key)}
            title={`Toggle ${label}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
