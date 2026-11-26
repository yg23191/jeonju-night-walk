import { useMemo, useState } from 'react'
import { defaultFieldRules, mergeFieldReadings, summarizeFieldReadings } from './fieldMeasurements.ts'
import type { FieldReading, FieldRules } from './fieldMeasurements.ts'

const readingKey = 'wansan-field-readings-v1'
const ruleKey = 'wansan-field-rules-v1'

function savedReadings(): FieldReading[] {
  try { return mergeFieldReadings([], JSON.parse(localStorage.getItem(readingKey) ?? '[]')) }
  catch { return [] }
}

function savedRules(): FieldRules {
  try {
    const p = JSON.parse(localStorage.getItem(ruleKey) ?? 'null')
    if (p && Number.isFinite(p.threshold) && p.threshold >= 1 && p.threshold <= 15 && [1, 2, 3].includes(p.minReadings)) return p
  } catch {}
  return defaultFieldRules
}

export function useFieldMeasurements() {
  const [readings, setReadings] = useState(savedReadings)
  const [rules, setRules] = useState(savedRules)
  const sites = useMemo(() => summarizeFieldReadings(readings, rules), [readings, rules])

  function store(incoming: FieldReading[]) {
    const merged = mergeFieldReadings(savedReadings(), incoming)
    localStorage.setItem(readingKey, JSON.stringify(merged))
    setReadings(merged)
  }

  function changeRules(next: FieldRules) {
    setRules(next)
    try { localStorage.setItem(ruleKey, JSON.stringify(next)) } catch {}
  }

  function removeSite(id: string) {
    const remaining = savedReadings().filter(reading => reading.id !== id)
    localStorage.setItem(readingKey, JSON.stringify(remaining))
    setReadings(remaining)
  }

  return { readings, rules, sites, store, changeRules, removeSite }
}
