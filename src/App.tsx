import { useState, useEffect, useCallback, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Habit {
  id: string
  name: string
  description: string
  color: string
  createdAt: string
}

type CompletionsMap = Record<string, Record<string, boolean>>

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOR_PRESETS = [
  { name: 'Emerald', value: '#10b981', to: '#06b6d4' },
  { name: 'Violet', value: '#8b5cf6', to: '#ec4899' },
  { name: 'Orange', value: '#f97316', to: '#f43f5e' },
  { name: 'Blue', value: '#3b82f6', to: '#06b6d4' },
  { name: 'Gold', value: '#eab308', to: '#f97316' },
]

const MILESTONES = [7, 14, 30, 60, 100]

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const CONFETTI_COLORS = [
  '#10b981', '#8b5cf6', '#f97316', '#3b82f6',
  '#eab308', '#ec4899', '#06b6d4', '#f43f5e',
]

// ─── Utils ────────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36)
}

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getColorPreset(color: string) {
  return COLOR_PRESETS.find(p => p.value === color) ?? COLOR_PRESETS[0]
}

function getGradient(color: string): string {
  const p = getColorPreset(color)
  return `linear-gradient(135deg, ${p.value}, ${p.to})`
}

function calculateStreak(completions: Record<string, boolean>): number {
  const current = new Date()
  let streak = 0

  // If today isn't marked, check starting from yesterday
  if (!completions[formatDate(current)]) {
    current.setDate(current.getDate() - 1)
  }

  while (completions[formatDate(current)]) {
    streak++
    current.setDate(current.getDate() - 1)
  }

  return streak
}

function calculateLongestStreak(completions: Record<string, boolean>): number {
  const dates = Object.keys(completions).filter(k => completions[k]).sort()
  if (dates.length === 0) return 0

  let longest = 1
  let current = 1

  for (let i = 1; i < dates.length; i++) {
    const diff = Math.round(
      (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000
    )
    if (diff === 1) {
      current++
      if (current > longest) longest = current
    } else {
      current = 1
    }
  }

  return longest
}

function getMonthStats(
  completions: Record<string, boolean>,
  year: number,
  month: number
): { total: number; count: number } {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (completions[dateStr]) count++
  }
  return { total: daysInMonth, count }
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function loadHabits(): Habit[] {
  try {
    const data = localStorage.getItem('hsc_habits')
    return data ? (JSON.parse(data) as Habit[]) : []
  } catch (e) {
    console.error('Failed to load habits:', e)
    return []
  }
}

function loadCompletions(): CompletionsMap {
  try {
    const data = localStorage.getItem('hsc_completions')
    return data ? (JSON.parse(data) as CompletionsMap) : {}
  } catch (e) {
    console.error('Failed to load completions:', e)
    return {}
  }
}

function saveHabits(habits: Habit[]): void {
  try {
    localStorage.setItem('hsc_habits', JSON.stringify(habits))
  } catch (e) {
    console.error('Failed to save habits:', e)
  }
}

function saveCompletions(completions: CompletionsMap): void {
  try {
    localStorage.setItem('hsc_completions', JSON.stringify(completions))
  } catch (e) {
    console.error('Failed to save completions:', e)
  }
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

function ConfettiPiece({ index }: { index: number }) {
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length]
  const left = `${(index * 7.3 + 3) % 100}%`
  const dur = `${2 + (index % 5) * 0.4}s`
  const delay = `${(index * 0.13) % 1.8}s`
  const size = 6 + (index % 3) * 3
  const br = index % 4 === 0 ? '50%' : index % 4 === 1 ? '2px' : '0'
  const h = index % 3 === 1 ? size * 1.8 : size

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: '-20px',
        width: size,
        height: h,
        backgroundColor: color,
        borderRadius: br,
        animation: `hscConfettiFall ${dur} ease-in ${delay} infinite`,
        transform: `rotate(${index * 53}deg)`,
        pointerEvents: 'none',
      }}
    />
  )
}

function Confetti() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 998 }}>
      {Array.from({ length: 60 }, (_, i) => (
        <ConfettiPiece key={i} index={i} />
      ))}
    </div>
  )
}

// ─── Milestone Overlay ────────────────────────────────────────────────────────

interface MilestoneOverlayProps {
  streak: number
  habitName: string
  onDismiss: () => void
}

function MilestoneOverlay({ streak, habitName, onDismiss }: MilestoneOverlayProps) {
  const emoji =
    streak >= 100 ? '🏆' : streak >= 60 ? '💎' : streak >= 30 ? '⭐' : streak >= 14 ? '🔥' : '🎉'

  return (
    <div
      data-testid="milestone-overlay"
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.88)', zIndex: 1000 }}
      onClick={onDismiss}
    >
      <Confetti />
      <div
        className="relative text-center p-8 rounded-3xl"
        style={{
          backgroundColor: '#1a1a2e',
          border: '1px solid rgba(255,255,255,0.12)',
          animation: 'hscFadeInScale 0.4s cubic-bezier(0.175,0.885,0.32,1.275)',
          maxWidth: '380px',
          width: '90%',
          zIndex: 1001,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-7xl mb-4" role="img" aria-label="celebration">
          {emoji}
        </div>
        <h2 className="text-4xl font-bold text-white mb-2" data-testid="milestone-text">
          🔥 {streak}-Day Streak!
        </h2>
        <p className="text-base text-gray-300 mb-1 font-medium">{habitName}</p>
        <p className="text-sm text-gray-500 mb-6">Keep up the incredible work!</p>
        <button
          data-testid="milestone-dismiss-btn"
          onClick={onDismiss}
          className="px-8 py-3 rounded-xl font-semibold text-white text-base transition-all hover:opacity-90 hover:scale-105"
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
        >
          Continue 🚀
        </button>
      </div>
    </div>
  )
}

// ─── Habit Modal ──────────────────────────────────────────────────────────────

interface HabitModalProps {
  habit: Partial<Habit> | null
  onSave: (data: Omit<Habit, 'id' | 'createdAt'>) => void
  onCancel: () => void
}

function HabitModal({ habit, onSave, onCancel }: HabitModalProps) {
  const [name, setName] = useState(habit?.name ?? '')
  const [description, setDescription] = useState(habit?.description ?? '')
  const [color, setColor] = useState(habit?.color ?? COLOR_PRESETS[0].value)
  const [error, setError] = useState('')

  const handleSave = () => {
    if (!name.trim()) {
      setError('Please enter a habit name')
      return
    }
    onSave({ name: name.trim(), description: description.trim(), color })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div
      data-testid="habit-modal"
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 500, backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className="p-6 rounded-2xl w-full max-w-md mx-4"
        style={{
          backgroundColor: '#1a1a2e',
          border: '1px solid rgba(255,255,255,0.1)',
          animation: 'hscFadeInScale 0.25s ease-out',
        }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="text-xl font-bold text-white mb-6">
          {habit?.id ? '✏️ Edit Habit' : '✨ New Habit'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Habit Name *
            </label>
            <input
              data-testid="habit-name-input"
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="e.g. Exercise, Read, Meditate"
              className="w-full px-4 py-2.5 rounded-xl text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-violet-500 transition-all"
              style={{
                backgroundColor: '#0f0f1a',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              autoFocus
            />
            {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Description (optional)
            </label>
            <input
              data-testid="habit-description-input"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's your goal?"
              className="w-full px-4 py-2.5 rounded-xl text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-violet-500 transition-all"
              style={{
                backgroundColor: '#0f0f1a',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
              Accent Color
            </label>
            <div className="flex gap-3 flex-wrap">
              {COLOR_PRESETS.map(preset => (
                <button
                  key={preset.value}
                  data-testid={`color-swatch-${preset.name.toLowerCase()}`}
                  onClick={() => setColor(preset.value)}
                  className="transition-all duration-200 hover:scale-110"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${preset.value}, ${preset.to})`,
                    boxShadow:
                      color === preset.value
                        ? `0 0 0 2px #0f0f1a, 0 0 0 4px ${preset.value}`
                        : 'none',
                    transform: color === preset.value ? 'scale(1.15)' : undefined,
                  }}
                  title={preset.name}
                  aria-label={`Color: ${preset.name}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl font-medium text-gray-400 transition-all hover:text-white text-sm"
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            Cancel
          </button>
          <button
            data-testid="save-habit-btn"
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl font-semibold text-white transition-all hover:opacity-90 hover:scale-[1.02] text-sm"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
          >
            {habit?.id ? 'Save Changes' : 'Create Habit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────

interface CalendarGridProps {
  year: number
  month: number
  completions: Record<string, boolean>
  color: string
  todayStr: string
  onToggle: (dateStr: string) => void
}

function CalendarGrid({ year, month, completions, color, todayStr, onToggle }: CalendarGridProps) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const gradient = getGradient(color)
  const preset = getColorPreset(color)

  const cells: React.ReactNode[] = []

  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} />)
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const isCompleted = !!completions[dateStr]
    const isToday = dateStr === todayStr
    const isFuture = dateStr > todayStr

    cells.push(
      <button
        key={dateStr}
        data-testid={`day-cell-${dateStr}`}
        onClick={() => !isFuture && onToggle(dateStr)}
        disabled={isFuture}
        aria-label={`${dateStr}${isCompleted ? ' (completed)' : ''}`}
        aria-pressed={isCompleted}
        className="relative flex items-center justify-center text-sm font-semibold rounded-xl transition-all duration-200 select-none"
        style={{
          aspectRatio: '1',
          background: isCompleted ? gradient : 'rgba(255,255,255,0.04)',
          color: isCompleted ? 'white' : isToday ? 'white' : 'rgba(255,255,255,0.35)',
          boxShadow: isCompleted ? `0 4px 14px ${preset.value}50` : 'none',
          outline: isToday ? '2px solid white' : 'none',
          outlineOffset: '2px',
          opacity: isFuture ? 0.2 : 1,
          cursor: isFuture ? 'not-allowed' : 'pointer',
          transform: 'scale(1)',
        }}
        onMouseEnter={e => {
          if (!isFuture) {
            ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'
          }
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
        }}
      >
        {d}
        {isCompleted && (
          <div
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 70%)',
            }}
          />
        )}
      </button>,
    )
  }

  return (
    <div>
      <div className="grid grid-cols-7 mb-2.5">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="text-center text-xs font-semibold text-gray-600 py-1 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">{cells}</div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      data-testid="empty-state"
      className="flex flex-col items-center justify-center min-h-[65vh] text-center px-4"
    >
      <div
        className="text-8xl mb-6"
        style={{ animation: 'hscFloatBob 3s ease-in-out infinite' }}
      >
        🌱
      </div>
      <h2 className="text-3xl font-bold text-white mb-3">Start Your First Habit</h2>
      <p className="text-gray-400 max-w-sm mb-8 leading-relaxed text-base">
        Track daily habits, build winning streaks, and celebrate your consistency with beautiful
        color-coded calendars.
      </p>
      <button
        data-testid="add-habit-btn-empty"
        onClick={onAdd}
        className="px-8 py-4 rounded-2xl font-bold text-white text-lg transition-all hover:scale-105 hover:opacity-95 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
          boxShadow: '0 8px 32px rgba(139,92,246,0.4)',
        }}
      >
        ✨ Add Your First Habit
      </button>
    </div>
  )
}

// ─── Streak Card ──────────────────────────────────────────────────────────────

function StatCard({
  emoji,
  value,
  label,
  testId,
  color,
}: {
  emoji: string
  value: number | string
  label: string
  testId?: string
  color?: string
}) {
  return (
    <div
      className="p-4 rounded-2xl flex flex-col items-center gap-1"
      style={{
        backgroundColor: '#1a1a2e',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: color ? `0 0 20px ${color}20` : 'none',
      }}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-3xl font-bold text-white" data-testid={testId}>
        {value}
      </span>
      <span className="text-xs text-gray-500 text-center leading-tight">{label}</span>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const todayStr = useMemo(() => formatDate(new Date()), [])
  const todayYear = useMemo(() => new Date().getFullYear(), [])
  const todayMonth = useMemo(() => new Date().getMonth(), [])

  const [habits, setHabits] = useState<Habit[]>(() => loadHabits())
  const [completions, setCompletions] = useState<CompletionsMap>(() => loadCompletions())
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(() => {
    const h = loadHabits()
    return h.length > 0 ? h[0].id : null
  })
  const [viewYear, setViewYear] = useState(todayYear)
  const [viewMonth, setViewMonth] = useState(todayMonth)
  const [showModal, setShowModal] = useState(false)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)
  const [milestone, setMilestone] = useState<{ streak: number; habitName: string } | null>(null)
  const [celebratedMilestones, setCelebratedMilestones] = useState<
    Record<string, Set<number>>
  >({})

  // Sync selected habit when habits change (e.g. on delete)
  useEffect(() => {
    if (selectedHabitId && !habits.find(h => h.id === selectedHabitId)) {
      setSelectedHabitId(habits.length > 0 ? habits[0].id : null)
    }
  }, [habits, selectedHabitId])

  const selectedHabit = habits.find(h => h.id === selectedHabitId) ?? null
  const habitCompletions: Record<string, boolean> = selectedHabit
    ? (completions[selectedHabit.id] ?? {})
    : {}

  const currentStreak = useMemo(
    () => (selectedHabit ? calculateStreak(habitCompletions) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedHabit?.id, completions],
  )

  const longestStreak = useMemo(
    () => (selectedHabit ? calculateLongestStreak(habitCompletions) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedHabit?.id, completions],
  )

  const monthStats = useMemo(
    () =>
      selectedHabit
        ? getMonthStats(habitCompletions, viewYear, viewMonth)
        : { total: 0, count: 0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedHabit?.id, completions, viewYear, viewMonth],
  )

  // Month navigation
  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(y => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(y => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  // Toggle day completion
  const handleToggle = useCallback(
    (dateStr: string) => {
      if (!selectedHabit) return

      const currentHabitMap = completions[selectedHabit.id] ?? {}
      const newHabitMap = { ...currentHabitMap }

      if (newHabitMap[dateStr]) {
        delete newHabitMap[dateStr]
      } else {
        newHabitMap[dateStr] = true
      }

      const newCompletions = { ...completions, [selectedHabit.id]: newHabitMap }
      setCompletions(newCompletions)
      saveCompletions(newCompletions)

      // Check for milestone
      const newStreak = calculateStreak(newHabitMap)
      if (MILESTONES.includes(newStreak)) {
        const celebrated = celebratedMilestones[selectedHabit.id] ?? new Set<number>()
        if (!celebrated.has(newStreak)) {
          setMilestone({ streak: newStreak, habitName: selectedHabit.name })
          setCelebratedMilestones(cm => ({
            ...cm,
            [selectedHabit.id]: new Set([...(cm[selectedHabit.id] ?? []), newStreak]),
          }))
        }
      }
    },
    [selectedHabit, completions, celebratedMilestones],
  )

  // Add habit
  const handleAddHabit = (data: Omit<Habit, 'id' | 'createdAt'>) => {
    const newHabit: Habit = {
      id: generateId(),
      ...data,
      createdAt: new Date().toISOString(),
    }
    const updated = [...habits, newHabit]
    setHabits(updated)
    saveHabits(updated)
    setSelectedHabitId(newHabit.id)
    setShowModal(false)
  }

  // Edit habit
  const handleEditHabit = (data: Omit<Habit, 'id' | 'createdAt'>) => {
    if (!editingHabit) return
    const updated = habits.map(h => (h.id === editingHabit.id ? { ...h, ...data } : h))
    setHabits(updated)
    saveHabits(updated)
    setEditingHabit(null)
    setShowModal(false)
  }

  // Delete habit
  const handleDeleteHabit = (id: string) => {
    const updated = habits.filter(h => h.id !== id)
    setHabits(updated)
    saveHabits(updated)

    const updatedCompletions = { ...completions }
    delete updatedCompletions[id]
    setCompletions(updatedCompletions)
    saveCompletions(updatedCompletions)

    if (selectedHabitId === id) {
      setSelectedHabitId(updated.length > 0 ? updated[0].id : null)
    }
  }

  const pct = monthStats.total > 0
    ? Math.round((monthStats.count / monthStats.total) * 100)
    : 0

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: '#0f0f1a', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* Global animations */}
      <style>{`
        @keyframes hscConfettiFall {
          0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(110vh)  rotate(720deg); opacity: 0; }
        }
        @keyframes hscFadeInScale {
          from { opacity: 0; transform: scale(0.82); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes hscFloatBob {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-12px); }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 0; height: 0; }
      `}</style>

      {/* ── Header ── */}
      <header className="px-4 pt-6 pb-2 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              🔥 Habit Streaks
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">Build consistency, one day at a time</p>
          </div>
          <button
            data-testid="add-habit-btn"
            onClick={() => {
              setEditingHabit(null)
              setShowModal(true)
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              boxShadow: '0 4px 14px rgba(139,92,246,0.4)',
            }}
          >
            <span className="text-base">+</span> Add Habit
          </button>
        </div>

        {/* Habit tab strip */}
        {habits.length > 0 && (
          <div
            data-testid="habit-tabs"
            className="flex gap-2 overflow-x-auto pb-2"
            style={{ scrollbarWidth: 'none' }}
          >
            {habits.map(habit => {
              const p = getColorPreset(habit.color)
              const isSelected = habit.id === selectedHabitId
              return (
                <div key={habit.id} className="flex items-center gap-1 shrink-0">
                  <button
                    data-testid={`habit-tab-${habit.name}`}
                    onClick={() => setSelectedHabitId(habit.id)}
                    className="px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap"
                    style={{
                      background: isSelected
                        ? `linear-gradient(135deg, ${p.value}, ${p.to})`
                        : 'rgba(255,255,255,0.07)',
                      color: isSelected ? 'white' : 'rgba(255,255,255,0.45)',
                      boxShadow: isSelected ? `0 2px 12px ${p.value}50` : 'none',
                    }}
                  >
                    {habit.name}
                  </button>
                  {isSelected && (
                    <>
                      <button
                        data-testid={`edit-habit-${habit.name}`}
                        onClick={() => {
                          setEditingHabit(habit)
                          setShowModal(true)
                        }}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs text-gray-400 hover:text-white transition-colors"
                        style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
                        title="Edit habit"
                        aria-label={`Edit ${habit.name}`}
                      >
                        ✎
                      </button>
                      <button
                        data-testid={`delete-habit-${habit.name}`}
                        onClick={() => handleDeleteHabit(habit.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-sm text-gray-400 hover:text-red-400 transition-colors"
                        style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
                        title="Delete habit"
                        aria-label={`Delete ${habit.name}`}
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </header>

      {/* ── Main Content ── */}
      <main className="px-4 pb-10 max-w-2xl mx-auto">
        {habits.length === 0 ? (
          <EmptyState onAdd={() => setShowModal(true)} />
        ) : selectedHabit ? (
          <div className="space-y-4">
            {/* Progress summary */}
            <div
              className="p-4 rounded-2xl"
              style={{
                backgroundColor: '#1a1a2e',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
              data-testid="progress-summary"
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-gray-300">{selectedHabit.name}</h3>
                <span className="text-xs text-gray-500">{pct}% this month</span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: getGradient(selectedHabit.color),
                  }}
                />
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3" data-testid="streak-card">
              <StatCard
                emoji="🔥"
                value={currentStreak}
                label="Current streak"
                testId="current-streak"
                color={selectedHabit.color}
              />
              <StatCard
                emoji="🏆"
                value={longestStreak}
                label="Best streak"
                testId="longest-streak"
              />
              <StatCard
                emoji="📅"
                value={monthStats.count}
                label={`of ${monthStats.total} days`}
                testId="month-completions"
              />
            </div>

            {/* Calendar card */}
            <div
              className="p-5 rounded-2xl"
              style={{
                backgroundColor: '#1a1a2e',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-5">
                <button
                  data-testid="prev-month-btn"
                  onClick={goPrevMonth}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <h2
                  className="text-base font-bold text-white"
                  data-testid="month-year-header"
                >
                  {MONTHS[viewMonth]} {viewYear}
                </h2>
                <button
                  data-testid="next-month-btn"
                  onClick={goNextMonth}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>

              <CalendarGrid
                year={viewYear}
                month={viewMonth}
                completions={habitCompletions}
                color={selectedHabit.color}
                todayStr={todayStr}
                onToggle={handleToggle}
              />
            </div>
          </div>
        ) : null}
      </main>

      {/* ── Modals ── */}
      {showModal && (
        <HabitModal
          habit={editingHabit}
          onSave={editingHabit ? handleEditHabit : handleAddHabit}
          onCancel={() => {
            setShowModal(false)
            setEditingHabit(null)
          }}
        />
      )}

      {milestone && (
        <MilestoneOverlay
          streak={milestone.streak}
          habitName={milestone.habitName}
          onDismiss={() => setMilestone(null)}
        />
      )}
    </div>
  )
}
