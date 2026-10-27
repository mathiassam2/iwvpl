import { useState, useEffect, useId, useRef, useMemo } from 'react'
import {
  previewFixtures,
  generateFixtures,
  type Division,
  type FixturePreviewResult,
  type PreviewDivision,
} from '../api'

interface GenerateRoundRobinWizardModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (summary: string) => void
  seasonId?: number
  divisions: Division[]
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Mon', full: 'Monday' },
  { value: 2, label: 'Tue', full: 'Tuesday' },
  { value: 3, label: 'Wed', full: 'Wednesday' },
  { value: 4, label: 'Thu', full: 'Thursday' },
  { value: 5, label: 'Fri', full: 'Friday' },
  { value: 6, label: 'Sat', full: 'Saturday' },
  { value: 0, label: 'Sun', full: 'Sunday' },
]

function getUpcomingFriday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = (5 - day + 7) % 7
  d.setDate(d.getDate() + (diff === 0 ? 0 : diff))
  const yr = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${yr}-${mo}-${da}`
}

function getTodayString(): string {
  const d = new Date()
  const yr = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${yr}-${mo}-${da}`
}

export function GenerateRoundRobinWizardModal({
  isOpen,
  onClose,
  onSuccess,
  seasonId,
  divisions,
}: GenerateRoundRobinWizardModalProps) {
  const autoScheduleToggleId = useId()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Step 1: Divisions & Format
  const activeDivs = useMemo(() => divisions.filter((d) => Boolean(d.is_active)), [divisions])
  const [selectedDivIds, setSelectedDivIds] = useState<Set<number>>(() => new Set())
  const [rounds, setRounds] = useState<1 | 2>(2)

  // Step 2: Scheduling & Match Days
  const [autoSchedule, setAutoSchedule] = useState(true)
  const [startDate, setStartDate] = useState(getUpcomingFriday)
  const [matchDays, setMatchDays] = useState<number[]>([5, 6]) // Default Friday & Saturday

  // Step 3: Kick-off Times & Concurrency
  const [timeMode, setTimeMode] = useState<'fixed' | 'slots' | 'interval'>('fixed')
  const [fixedTime, setFixedTime] = useState('21:00')
  const [timeSlots, setTimeSlots] = useState<string[]>(['20:00', '20:45', '21:30', '22:15'])
  const [newSlotInput, setNewSlotInput] = useState('23:00')
  const [startTime, setStartTime] = useState('20:00')
  const [intervalMinutes, setIntervalMinutes] = useState(45)
  const [concurrencyMode, setConcurrencyMode] = useState<'unlimited' | 'custom'>('unlimited')
  const [concurrentMatches, setConcurrentMatches] = useState(2)

  // Step 4: Preview & Generation State
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<FixturePreviewResult | null>(null)
  const [activePreviewDivId, setActivePreviewDivId] = useState<number | null>(null)
  const [commitLoading, setCommitLoading] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [roundFilter, setRoundFilter] = useState<string>('all')
  const [collapsedRounds, setCollapsedRounds] = useState<Set<number>>(() => new Set())

  const toggleRoundCollapse = (roundNum: number) => {
    setCollapsedRounds((prev) => {
      const next = new Set(prev)
      if (next.has(roundNum)) next.delete(roundNum)
      else next.add(roundNum)
      return next
    })
  }

  const expandAllRounds = () => setCollapsedRounds(new Set())
  const collapseAllRounds = () => {
    if (activeDivPreview) {
      setCollapsedRounds(new Set(activeDivPreview.rounds.map((r) => r.roundNumber)))
    }
  }

  // Initialize state only when modal transitions from closed to open
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setStep(1)
      setCommitError(null)
      setPreviewError(null)
      const currentActive = divisions.filter((d) => Boolean(d.is_active))
      setSelectedDivIds(new Set(currentActive.map((d) => d.id)))
    }
    prevOpenRef.current = isOpen
  }, [isOpen, divisions])

  // Automatically fetch preview when entering Step 4
  useEffect(() => {
    if (step === 4 && isOpen) {
      loadPreview()
    }
  }, [step, isOpen])

  if (!isOpen) return null

  const loadPreview = async () => {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const res = await previewFixtures({
        seasonId,
        divisionIds: [...selectedDivIds],
        rounds,
        schedule: {
          autoSchedule,
          startDate,
          matchDays,
          timeMode,
          fixedTime,
          timeSlots,
          startTime,
          intervalMinutes,
          concurrentMatches: concurrencyMode === 'unlimited' ? 0 : concurrentMatches,
        },
      })
      setPreviewData(res)
      if (res.divisions.length > 0 && activePreviewDivId === null) {
        setActivePreviewDivId(res.divisions[0].divisionId)
      } else if (res.divisions.every((d) => d.divisionId !== activePreviewDivId)) {
        setActivePreviewDivId(res.divisions[0]?.divisionId ?? null)
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to generate preview.')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleCommit = async () => {
    setCommitLoading(true)
    setCommitError(null)
    try {
      const res = await generateFixtures({
        seasonId,
        divisionIds: [...selectedDivIds],
        rounds,
        schedule: {
          autoSchedule,
          startDate,
          matchDays,
          timeMode,
          fixedTime,
          timeSlots,
          startTime,
          intervalMinutes,
          concurrentMatches: concurrencyMode === 'unlimited' ? 0 : concurrentMatches,
        },
      })
      const summaryMsg = `Successfully generated ${res.created} fixture(s)${
        res.scheduled ? ` (${res.scheduled} auto-scheduled with kickoff times)` : ''
      }${res.skipped ? `, ${res.skipped} existing fixture(s) skipped` : ''}.`
      onSuccess(summaryMsg)
      onClose()
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Failed to generate fixtures.')
    } finally {
      setCommitLoading(false)
    }
  }

  // Division toggles
  const toggleDivision = (id: number) => {
    setSelectedDivIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllDivisions = () => {
    setSelectedDivIds(new Set(activeDivs.map((d) => d.id)))
  }

  const clearAllDivisions = () => {
    setSelectedDivIds(new Set())
  }

  // Day pill toggles
  const toggleDay = (dayVal: number) => {
    setMatchDays((prev) => {
      if (prev.includes(dayVal)) {
        // Prevent unchecking all days
        if (prev.length === 1) return prev
        return prev.filter((d) => d !== dayVal)
      } else {
        return [...prev, dayVal].sort()
      }
    })
  }

  // Time slot manager
  const addTimeSlot = () => {
    if (!newSlotInput || !/^\d{2}:\d{2}$/.test(newSlotInput)) return
    if (!timeSlots.includes(newSlotInput)) {
      setTimeSlots([...timeSlots, newSlotInput].sort())
    }
    setNewSlotInput('')
  }

  const removeTimeSlot = (slot: string) => {
    if (timeSlots.length <= 1) return // keep at least one
    setTimeSlots(timeSlots.filter((s) => s !== slot))
  }

  const canProceedStep1 = selectedDivIds.size > 0
  const canProceedStep2 = !autoSchedule || (Boolean(startDate) && matchDays.length > 0)
  const canProceedStep3 =
    !autoSchedule ||
    (timeMode === 'fixed' && Boolean(fixedTime)) ||
    (timeMode === 'slots' && timeSlots.length > 0) ||
    (timeMode === 'interval' && Boolean(startTime) && intervalMinutes > 0)

  const activeDivPreview: PreviewDivision | undefined =
    previewData?.divisions.find((d) => d.divisionId === activePreviewDivId) ??
    previewData?.divisions[0]

  const displayedRounds =
    activeDivPreview?.rounds.filter((r) => {
      if (roundFilter === 'all') return true
      return String(r.roundNumber) === roundFilter
    }) ?? []

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div
        className="adm-modal adm-wizard-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Wizard Header */}
        <div className="adm-modal-head adm-wizard-head">
          <div className="adm-wizard-title-group">
            <span className="adm-wizard-badge">Wizard</span>
            <h3>⚡ Auto-Generate Round-Robin Fixtures</h3>
          </div>
          <button type="button" className="adm-close-btn" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="adm-stepper">
          <button
            type="button"
            className={`adm-step-item ${step === 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}
            onClick={() => setStep(1)}
          >
            <span className="adm-step-num">{step > 1 ? '✓' : '1'}</span>
            <span className="adm-step-text">Format & Divisions</span>
          </button>
          <div className={`adm-step-line ${step > 1 ? 'done' : ''}`} />
          <button
            type="button"
            className={`adm-step-item ${step === 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}
            onClick={() => canProceedStep1 && setStep(2)}
            disabled={!canProceedStep1}
          >
            <span className="adm-step-num">{step > 2 ? '✓' : '2'}</span>
            <span className="adm-step-text">Match Days & Start</span>
          </button>
          <div className={`adm-step-line ${step > 2 ? 'done' : ''}`} />
          <button
            type="button"
            className={`adm-step-item ${step === 3 ? 'active' : ''} ${step > 3 ? 'done' : ''}`}
            onClick={() => canProceedStep1 && canProceedStep2 && setStep(3)}
            disabled={!canProceedStep1 || !canProceedStep2}
          >
            <span className="adm-step-num">{step > 3 ? '✓' : '3'}</span>
            <span className="adm-step-text">Kickoff Times</span>
          </button>
          <div className={`adm-step-line ${step > 3 ? 'done' : ''}`} />
          <button
            type="button"
            className={`adm-step-item ${step === 4 ? 'active' : ''}`}
            onClick={() => canProceedStep1 && canProceedStep2 && canProceedStep3 && setStep(4)}
            disabled={!canProceedStep1 || !canProceedStep2 || !canProceedStep3}
          >
            <span className="adm-step-num">4</span>
            <span className="adm-step-text">Preview & Generate</span>
          </button>
        </div>

        {/* Wizard Body Container */}
        <div className="adm-wizard-body">
          {/* STEP 1: Divisions & Format */}
          {step === 1 && (
            <div className="adm-wizard-step-pane">
              <div className="adm-wizard-step-desc">
                <h4>Step 1: Choose Divisions & Tournament Format</h4>
                <p>
                  Select the active divisions to include in this round-robin schedule and pick single
                  or double leg pairings.
                </p>
              </div>

              {/* Division Selector */}
              <div className="adm-wizard-card-group">
                <div className="adm-wizard-group-head">
                  <span className="adm-wizard-group-title">Divisions to Schedule</span>
                  <div className="adm-wizard-quick-links">
                    <button type="button" onClick={selectAllDivisions} className="adm-text-link">
                      Select All
                    </button>
                    <span className="adm-sep">•</span>
                    <button type="button" onClick={clearAllDivisions} className="adm-text-link">
                      Clear
                    </button>
                  </div>
                </div>

                <div className="adm-check-grid">
                  {activeDivs.map((d) => (
                    <label
                      key={d.id}
                      className={`adm-check-card ${selectedDivIds.has(d.id) ? 'checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDivIds.has(d.id)}
                        onChange={() => toggleDivision(d.id)}
                      />
                      <div className="adm-check-card-info">
                        <strong>{d.name}</strong>
                        <span className="adm-text-faint">Tier {d.tier ?? 1}</span>
                      </div>
                    </label>
                  ))}
                  {activeDivs.length === 0 && (
                    <div className="adm-alert adm-alert-warning">
                      No active divisions found in the current season.
                    </div>
                  )}
                </div>
                {selectedDivIds.size === 0 && (
                  <p className="adm-field-hint adm-text-danger">
                    Please select at least one division to continue.
                  </p>
                )}
              </div>

              {/* Format Options */}
              <div className="adm-wizard-card-group">
                <span className="adm-wizard-group-title">Round-Robin Format</span>
                <div className="adm-radio-cards">
                  <label className={`adm-radio-card ${rounds === 2 ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="format"
                      checked={rounds === 2}
                      onChange={() => setRounds(2)}
                    />
                    <div className="adm-radio-card-content">
                      <div className="adm-radio-card-head">
                        <span className="adm-radio-icon">🔁</span>
                        <strong>Double Round-Robin (Home & Away)</strong>
                        <span className="adm-pill adm-pill-accent">Standard League</span>
                      </div>
                      <p>
                        Each club plays every other club twice: once at home and once away. Generates
                        2 legs of balanced matchdays.
                      </p>
                    </div>
                  </label>

                  <label className={`adm-radio-card ${rounds === 1 ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="format"
                      checked={rounds === 1}
                      onChange={() => setRounds(1)}
                    />
                    <div className="adm-radio-card-content">
                      <div className="adm-radio-card-head">
                        <span className="adm-radio-icon">⚡</span>
                        <strong>Single Round-Robin (1 Leg)</strong>
                      </div>
                      <p>
                        Each club meets every other club exactly once. Best for short seasons,
                        group stages, or preliminary rounds.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Match Days & Start Date */}
          {step === 2 && (
            <div className="adm-wizard-step-pane">
              <div className="adm-wizard-step-desc">
                <h4>Step 2: Scheduling & Match Days</h4>
                <p>
                  Configure the calendar pacing. Matchdays automatically advance across your chosen
                  days of the week.
                </p>
              </div>

              {/* Master Auto-Schedule Switch */}
              <div className="adm-toggle-box">
                <div className="adm-toggle-info">
                  <strong>Auto-Schedule Match Dates & Times</strong>
                  <span>
                    When enabled, fixtures are sequenced onto real calendar dates and assigned kickoff
                    times.
                  </span>
                </div>
                <label className="adm-switch" htmlFor={autoScheduleToggleId}>
                  <input
                    id={autoScheduleToggleId}
                    type="checkbox"
                    checked={autoSchedule}
                    onChange={(e) => setAutoSchedule(e.target.checked)}
                  />
                  <span className="adm-slider round" />
                </label>
              </div>

              {autoSchedule ? (
                <>
                  {/* Start Date Picker */}
                  <div className="adm-wizard-card-group">
                    <div className="adm-wizard-group-head">
                      <span className="adm-wizard-group-title">Season Start Date</span>
                      <div className="adm-wizard-quick-links">
                        <button
                          type="button"
                          onClick={() => setStartDate(getTodayString())}
                          className="adm-text-link"
                        >
                          Today
                        </button>
                        <span className="adm-sep">•</span>
                        <button
                          type="button"
                          onClick={() => setStartDate(getUpcomingFriday())}
                          className="adm-text-link"
                        >
                          Upcoming Friday
                        </button>
                      </div>
                    </div>

                    <div className="adm-field-row">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="adm-input"
                      />
                    </div>
                    <span className="adm-field-hint">
                      Fixtures will begin on or after this date based on your selected match days.
                    </span>
                  </div>

                  {/* Days of Week Selector */}
                  <div className="adm-wizard-card-group">
                    <div className="adm-wizard-group-head">
                      <span className="adm-wizard-group-title">Match Days of the Week</span>
                      <div className="adm-wizard-quick-links">
                        <button
                          type="button"
                          onClick={() => setMatchDays([5, 6])}
                          className="adm-text-link"
                        >
                          Fri & Sat
                        </button>
                        <span className="adm-sep">•</span>
                        <button
                          type="button"
                          onClick={() => setMatchDays([5, 6, 0])}
                          className="adm-text-link"
                        >
                          Full Weekend
                        </button>
                        <span className="adm-sep">•</span>
                        <button
                          type="button"
                          onClick={() => setMatchDays([5])}
                          className="adm-text-link"
                        >
                          Fridays Only
                        </button>
                      </div>
                    </div>

                    <div className="adm-day-pills">
                      {DAYS_OF_WEEK.map((d) => {
                        const isSelected = matchDays.includes(d.value)
                        return (
                          <button
                            key={d.value}
                            type="button"
                            className={`adm-day-pill ${isSelected ? 'active' : ''}`}
                            onClick={() => toggleDay(d.value)}
                          >
                            <span className="adm-day-short">{d.label}</span>
                            <span className="adm-day-status">{isSelected ? '✓' : '+'}</span>
                          </button>
                        )
                      })}
                    </div>

                    <div className="adm-wizard-info-card">
                      <span className="adm-info-icon">💡</span>
                      <div>
                        <strong>How Matchdays are Scheduled:</strong>
                        <p>
                          Round 1 plays on the first matching day on/after the start date, Round 2 on
                          the next chosen day, etc. For example, selecting <strong>Friday & Saturday</strong>{' '}
                          schedules Round 1 on Friday, Round 2 on Saturday, Round 3 next Friday.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="adm-alert adm-alert-info">
                  <span>ℹ️</span>
                  <div>
                    <strong>Unscheduled Mode Selected</strong>
                    <p>
                      Matches will be generated with status <em>unscheduled</em> and kickoff set to{' '}
                      <em>null</em>. You can manually assign dates and times individually later from the
                      Matches view.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Kick-off Times & Concurrency */}
          {step === 3 && (
            <div className="adm-wizard-step-pane">
              <div className="adm-wizard-step-desc">
                <h4>Step 3: Kick-off Times & Match Concurrency</h4>
                <p>
                  Customize how match kickoff times are assigned for each matchday round.
                </p>
              </div>

              {!autoSchedule ? (
                <div className="adm-alert adm-alert-info">
                  <span>ℹ️</span>
                  <div>
                    <strong>Auto-Scheduling is Disabled</strong>
                    <p>
                      Since you chose not to auto-schedule dates in Step 2, kick-off times do not
                      apply. Click <strong>Next</strong> to review your settings and preview.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Time Mode Selection */}
                  <div className="adm-wizard-card-group">
                    <span className="adm-wizard-group-title">Kick-off Time Mode</span>
                    <div className="adm-radio-cards">
                      {/* Fixed Time Mode */}
                      <label className={`adm-radio-card ${timeMode === 'fixed' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="timeMode"
                          checked={timeMode === 'fixed'}
                          onChange={() => setTimeMode('fixed')}
                        />
                        <div className="adm-radio-card-content">
                          <div className="adm-radio-card-head">
                            <span className="adm-radio-icon">🕐</span>
                            <strong>Fixed Time</strong>
                            <span className="adm-pill">Simultaneous</span>
                          </div>
                          <p>All matches in the round kick off at the exact same time.</p>

                          {timeMode === 'fixed' && (
                            <div className="adm-time-picker-block" onClick={(e) => e.stopPropagation()}>
                              <div className="adm-field-inline">
                                <span>Kickoff Time:</span>
                                <input
                                  type="time"
                                  value={fixedTime}
                                  onChange={(e) => setFixedTime(e.target.value)}
                                  className="adm-input adm-input-time"
                                />
                              </div>
                              <div className="adm-quick-times">
                                {['20:00', '20:30', '21:00', '21:30', '22:00'].map((t) => (
                                  <button
                                    key={t}
                                    type="button"
                                    className={`adm-pill-btn ${fixedTime === t ? 'active' : ''}`}
                                    onClick={() => setFixedTime(t)}
                                  >
                                    {t}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </label>

                      {/* Staggered Time Slots Mode */}
                      <label className={`adm-radio-card ${timeMode === 'slots' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="timeMode"
                          checked={timeMode === 'slots'}
                          onChange={() => setTimeMode('slots')}
                        />
                        <div className="adm-radio-card-content">
                          <div className="adm-radio-card-head">
                            <span className="adm-radio-icon">⏱️</span>
                            <strong>Custom Time Slots</strong>
                            <span className="adm-pill">Staggered</span>
                          </div>
                          <p>Assign matches to defined time slots (e.g. 20:00, 20:45, 21:30).</p>

                          {timeMode === 'slots' && (
                            <div className="adm-slots-builder" onClick={(e) => e.stopPropagation()}>
                              <div className="adm-slot-tags">
                                {timeSlots.map((slot) => (
                                  <span key={slot} className="adm-slot-tag">
                                    {slot}
                                    {timeSlots.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => removeTimeSlot(slot)}
                                        aria-label={`Remove slot ${slot}`}
                                      >
                                        ×
                                      </button>
                                    )}
                                  </span>
                                ))}
                              </div>

                              <div className="adm-add-slot-row">
                                <input
                                  type="time"
                                  value={newSlotInput}
                                  onChange={(e) => setNewSlotInput(e.target.value)}
                                  className="adm-input adm-input-sm"
                                  placeholder="HH:mm"
                                />
                                <button
                                  type="button"
                                  onClick={addTimeSlot}
                                  className="adm-btn adm-btn-secondary adm-btn-sm"
                                  disabled={!newSlotInput}
                                >
                                  + Add Slot
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTimeSlots(['20:00', '20:45', '21:30', '22:15'])}
                                  className="adm-text-link"
                                >
                                  Reset 45m Preset
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </label>

                      {/* Interval Stagger Mode */}
                      <label className={`adm-radio-card ${timeMode === 'interval' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="timeMode"
                          checked={timeMode === 'interval'}
                          onChange={() => setTimeMode('interval')}
                        />
                        <div className="adm-radio-card-content">
                          <div className="adm-radio-card-head">
                            <span className="adm-radio-icon">⏳</span>
                            <strong>Start Time + Duration Interval</strong>
                          </div>
                          <p>
                            Matches start at a specified time and automatically increment every X
                            minutes.
                          </p>

                          {timeMode === 'interval' && (
                            <div className="adm-interval-builder" onClick={(e) => e.stopPropagation()}>
                              <div className="adm-field-inline">
                                <span>First Match Kickoff:</span>
                                <input
                                  type="time"
                                  value={startTime}
                                  onChange={(e) => setStartTime(e.target.value)}
                                  className="adm-input adm-input-time"
                                />
                              </div>

                              <div className="adm-field-inline">
                                <span>Interval Duration:</span>
                                <div className="adm-quick-times">
                                  {[30, 40, 45, 60].map((mins) => (
                                    <button
                                      key={mins}
                                      type="button"
                                      className={`adm-pill-btn ${intervalMinutes === mins ? 'active' : ''}`}
                                      onClick={() => setIntervalMinutes(mins)}
                                    >
                                      {mins} mins
                                    </button>
                                  ))}
                                  <input
                                    type="number"
                                    min={5}
                                    max={240}
                                    value={intervalMinutes}
                                    onChange={(e) => setIntervalMinutes(Number(e.target.value) || 45)}
                                    className="adm-input adm-input-sm"
                                    style={{ width: '80px' }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Concurrency Settings (Only relevant when staggered / slots / interval) */}
                  {(timeMode === 'slots' || timeMode === 'interval') && (
                    <div className="adm-wizard-card-group">
                      <span className="adm-wizard-group-title">Match Concurrency (Simultaneous Games)</span>
                      <div className="adm-radio-cards">
                        <label className={`adm-radio-card ${concurrencyMode === 'unlimited' ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name="concurrencyMode"
                            checked={concurrencyMode === 'unlimited'}
                            onChange={() => setConcurrencyMode('unlimited')}
                          />
                          <div className="adm-radio-card-content">
                            <strong>Unlimited / Staggered Round Sequences</strong>
                            <p className="adm-text-faint">
                              Matches progress through each available slot sequentially.
                            </p>
                          </div>
                        </label>

                        <label className={`adm-radio-card ${concurrencyMode === 'custom' ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name="concurrencyMode"
                            checked={concurrencyMode === 'custom'}
                            onChange={() => setConcurrencyMode('custom')}
                          />
                          <div className="adm-radio-card-content">
                            <div className="adm-field-inline" onClick={(e) => e.stopPropagation()}>
                              <strong>Max Simultaneous Matches Per Slot:</strong>
                              <input
                                type="number"
                                min={1}
                                max={20}
                                value={concurrentMatches}
                                onChange={(e) => setConcurrentMatches(Math.max(1, Number(e.target.value)))}
                                className="adm-input adm-input-sm"
                                style={{ width: '70px' }}
                                disabled={concurrencyMode !== 'custom'}
                              />
                            </div>
                            <p className="adm-text-faint">
                              For example, set to 2 to have 2 matches kick off together at 20:00, then the next
                              2 at 20:45.
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* STEP 4: Live Preview & Confirmation */}
          {step === 4 && (
            <div className="adm-wizard-step-pane">
              <div className="adm-wizard-step-desc">
                <h4>Step 4: Live Preview & Confirmation</h4>
                <p>
                  Review the full schedule breakdown, dates, times, and pairings before writing to the
                  database.
                </p>
              </div>

              {previewLoading && (
                <div className="adm-wizard-loading">
                  <div className="adm-spinner" />
                  <p>Generating schedule preview…</p>
                </div>
              )}

              {previewError && (
                <div className="adm-alert adm-alert-danger">
                  <strong>Preview Error:</strong> {previewError}
                  <button type="button" onClick={loadPreview} className="adm-btn adm-btn-secondary adm-btn-sm" style={{ marginTop: '8px' }}>
                    Try Again
                  </button>
                </div>
              )}

              {commitError && (
                <div className="adm-alert adm-alert-danger">
                  <strong>Generation Error:</strong> {commitError}
                </div>
              )}

              {!previewLoading && previewData && (
                <>
                  {/* Summary Metric Stats */}
                  <div className="adm-wizard-stats">
                    <div className="adm-stat-box">
                      <span className="adm-stat-label">Total Matchdays</span>
                      <strong className="adm-stat-val">{previewData.totalRounds} Rounds</strong>
                    </div>
                    <div className="adm-stat-box">
                      <span className="adm-stat-label">Total Fixtures</span>
                      <strong className="adm-stat-val">{previewData.totalMatches} Matches</strong>
                    </div>
                    <div className="adm-stat-box">
                      <span className="adm-stat-label">New to Create</span>
                      <strong className="adm-stat-val adm-text-accent">
                        +{previewData.newMatches}
                      </strong>
                    </div>
                    <div className="adm-stat-box">
                      <span className="adm-stat-label">Existing Skipped</span>
                      <strong className="adm-stat-val adm-text-muted">
                        {previewData.skippedMatches}
                      </strong>
                    </div>
                  </div>

                  {/* Division Tabs if multiple divisions */}
                  {previewData.divisions.length > 1 && (
                    <div className="adm-division-tabs">
                      {previewData.divisions.map((div) => (
                        <button
                          key={div.divisionId}
                          type="button"
                          className={`adm-division-tab ${activePreviewDivId === div.divisionId ? 'active' : ''}`}
                          onClick={() => setActivePreviewDivId(div.divisionId)}
                        >
                          {div.divisionName}
                          <span className="adm-pill adm-pill-sm">{div.newMatches} matches</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Filter / Jump Bar */}
                  <div className="adm-preview-filter-bar">
                    <div className="adm-field-inline">
                      <span>Jump to Round:</span>
                      <select
                        value={roundFilter}
                        onChange={(e) => setRoundFilter(e.target.value)}
                        className="adm-select adm-select-sm"
                      >
                        <option value="all">All Rounds ({activeDivPreview?.rounds.length ?? 0})</option>
                        {activeDivPreview?.rounds.map((r) => (
                          <option key={r.roundNumber} value={String(r.roundNumber)}>
                            Round {r.roundNumber} {r.date ? `(${r.date})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="adm-preview-actions">
                      {roundFilter === 'all' && (
                        <>
                          <button
                            type="button"
                            onClick={expandAllRounds}
                            className="adm-btn adm-btn-ghost adm-btn-sm"
                          >
                            Expand All
                          </button>
                          <button
                            type="button"
                            onClick={collapseAllRounds}
                            className="adm-btn adm-btn-ghost adm-btn-sm"
                          >
                            Collapse All
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={loadPreview}
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        title="Re-compute preview"
                      >
                        ↻ Refresh
                      </button>
                    </div>
                  </div>

                  {/* Rounds Preview List */}
                  <div className="adm-preview-rounds-container">
                    {displayedRounds.map((rnd) => {
                      const isCollapsed = collapsedRounds.has(rnd.roundNumber) && roundFilter === 'all'
                      return (
                        <div key={rnd.roundNumber} className="adm-preview-round-card">
                          <div
                            className="adm-preview-round-header"
                            onClick={() => toggleRoundCollapse(rnd.roundNumber)}
                            style={{ cursor: roundFilter === 'all' ? 'pointer' : 'default' }}
                            title={roundFilter === 'all' ? (isCollapsed ? 'Click to expand' : 'Click to collapse') : undefined}
                          >
                            <div className="adm-round-title">
                              <span className="adm-round-badge">Round {rnd.roundNumber}</span>
                              {rnd.date ? (
                                <span className="adm-round-date">
                                  📅 {rnd.dayName}, {rnd.date}
                                </span>
                              ) : (
                                <span className="adm-round-date adm-text-muted">
                                  ⚪ Unscheduled Kickoff
                                </span>
                              )}
                            </div>
                            <div className="adm-round-header-right">
                              <span className="adm-round-count">{rnd.matches.length} fixtures</span>
                              {roundFilter === 'all' && (
                                <span className="adm-collapse-arrow">{isCollapsed ? '▼' : '▲'}</span>
                              )}
                            </div>
                          </div>

                          {!isCollapsed && (
                            <div className="adm-preview-matches-list">
                              {rnd.matches.map((m, idx) => (
                                <div
                                  key={`${m.homeClubId}-${m.awayClubId}-${idx}`}
                                  className={`adm-preview-match-row ${m.isDuplicate ? 'duplicate' : ''}`}
                                >
                                  <div className="adm-preview-time-badge">
                                    {m.time ? `🕐 ${m.time}` : '—'}
                                  </div>

                                  <div className="adm-preview-pairing">
                                    <div className="adm-team-cell home">
                                      <span className="adm-team-name">{m.homeClubName}</span>
                                      {m.homeClubLogo ? (
                                        <img
                                          src={m.homeClubLogo}
                                          alt=""
                                          className="adm-team-avatar"
                                        />
                                      ) : (
                                        <span className="adm-team-avatar-ph">
                                          {m.homeClubName.slice(0, 2).toUpperCase()}
                                        </span>
                                      )}
                                    </div>

                                    <span className="adm-vs-pill">VS</span>

                                    <div className="adm-team-cell away">
                                      {m.awayClubLogo ? (
                                        <img
                                          src={m.awayClubLogo}
                                          alt=""
                                          className="adm-team-avatar"
                                        />
                                      ) : (
                                        <span className="adm-team-avatar-ph">
                                          {m.awayClubName.slice(0, 2).toUpperCase()}
                                        </span>
                                      )}
                                      <span className="adm-team-name">{m.awayClubName}</span>
                                    </div>
                                  </div>

                                  <div className="adm-preview-status">
                                    {m.isDuplicate ? (
                                      <span className="adm-pill adm-pill-warning" title="Already exists in this season">
                                        Skipped (Exists)
                                      </span>
                                    ) : (
                                      <span className="adm-pill adm-pill-success">Ready</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {displayedRounds.length === 0 && (
                      <div className="adm-preview-empty">
                        <p>No rounds to display.</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div className="adm-modal-foot adm-wizard-foot">
          <div className="adm-wizard-foot-left">
            {step > 1 && (
              <button
                type="button"
                className="adm-btn adm-btn-secondary"
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                disabled={commitLoading}
              >
                ← Back
              </button>
            )}
          </div>

          <div className="adm-wizard-foot-right">
            <button
              type="button"
              className="adm-btn adm-btn-ghost"
              onClick={onClose}
              disabled={commitLoading}
            >
              Cancel
            </button>

            {step < 4 ? (
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                onClick={() => setStep((s) => (s + 1) as 2 | 3 | 4)}
                disabled={
                  (step === 1 && !canProceedStep1) ||
                  (step === 2 && !canProceedStep2) ||
                  (step === 3 && !canProceedStep3)
                }
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                onClick={handleCommit}
                disabled={commitLoading || previewLoading || !previewData || previewData.newMatches === 0}
              >
                {commitLoading ? 'Generating Fixtures…' : `Confirm & Generate ${previewData?.newMatches ?? ''} Fixtures`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
