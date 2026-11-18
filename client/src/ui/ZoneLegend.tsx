const ZONES = [
  { name: 'Work area', color: '#DCE6EF' },
  { name: 'Pantry', color: '#F6E3C8' },
  { name: 'Gym', color: '#D3E7DE' },
]

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-sans text-[9px] font-medium text-ink-100">
      {children}
    </kbd>
  )
}

export function ZoneLegend() {
  return (
    <div className="pointer-events-none absolute bottom-0 left-0 z-30 hidden p-4 md:block md:p-5">
      <div className="pointer-events-auto flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-ink-900/75 px-4 py-3 shadow-panel backdrop-blur-xl">
        <div className="flex items-center gap-4">
          {ZONES.map((zone) => (
            <div key={zone.name} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: zone.color }} />
              <span className="text-[11px] text-ink-100">{zone.name}</span>
            </div>
          ))}
        </div>

        <div className="h-px bg-white/5" />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-ink-300">
          <span className="flex items-center gap-1.5">
            <Kbd>Click</Kbd> inspect
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Drag</Kbd> pan
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Wheel</Kbd> zoom
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Shift</Kbd> + drag rotate
          </span>
        </div>
      </div>
    </div>
  )
}
