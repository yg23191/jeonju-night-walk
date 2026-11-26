import { useEffect, useMemo, useState } from 'react'
import { defaultFieldRules, mergeFieldReadings, summarizeFieldReadings } from './fieldMeasurements.ts'
import type { FieldReading, FieldRules } from './fieldMeasurements.ts'

const readingKey = 'wansan-field-readings-v1'
const ruleKey = 'wansan-field-rules-v1'

function savedReadings(): FieldReading[] {
  try { return mergeFieldReadings([], JSON.parse(localStorage.getItem(readingKey) ?? '[]')) }
  catch { throw new Error('이 브라우저의 실측 기록을 읽을 수 없어 기존 기록을 보호했습니다.') }
}

function loadReadings() {
  try { return { readings: savedReadings(), storageIssue: '' } }
  catch (error) { return { readings: [], storageIssue: (error as Error).message } }
}

function savedRules(): FieldRules {
  try {
    const p = JSON.parse(localStorage.getItem(ruleKey) ?? 'null')
    if (p && Number.isFinite(p.threshold) && p.threshold >= 1 && p.threshold <= 15 && [1, 2, 3].includes(p.minReadings)) return p
  } catch {}
  return defaultFieldRules
}

export function useFieldMeasurements() {
  const [{ readings, storageIssue }, setStored] = useState(loadReadings)
  const [rules, setRules] = useState(savedRules)
  const sites = useMemo(() => summarizeFieldReadings(readings, rules), [readings, rules])

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.storageArea !== localStorage) return
      if (event.key === readingKey || event.key === null) setStored(loadReadings())
      if (event.key === ruleKey || event.key === null) setRules(savedRules())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  function store(incoming: FieldReading[]) {
    const merged = mergeFieldReadings(savedReadings(), incoming)
    localStorage.setItem(readingKey, JSON.stringify(merged))
    setStored({ readings: merged, storageIssue: '' })
  }

  function changeRules(next: FieldRules) {
    setRules(next)
    try { localStorage.setItem(ruleKey, JSON.stringify(next)) } catch {}
  }

  function removeSite(id: string) {
    const remaining = savedReadings().filter(reading => reading.id !== id)
    localStorage.setItem(readingKey, JSON.stringify(remaining))
    setStored({ readings: remaining, storageIssue: '' })
  }

  return { readings, rules, sites, storageIssue, store, changeRules, removeSite }
}
