import { createContext, useContext, useMemo, useState } from 'react'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { parseDesignListDate } from '@/lib/design-list-date'
import { apiClient } from '@/lib/api-client'

const DesignListContext = createContext(null)

function dedupeDesignRecords(items) {
  const merged = Array.isArray(items) ? items : []
  return Array.from(
    new Map(
      merged.map((item) => [
        `${item?.id ?? 'unknown'}-${item?.orderNo ?? item?.opNo ?? 'na'}-${item?.createdAt ?? item?.created ?? 'date'}`,
        item,
      ]),
    ).values(),
  )
}

const STATUS_ORDER = [
  'DESIGN_NEW', 'DESIGN_PLANNED', 'IN_PROGRESS', 'DESIGN_COMPLETED',
  'HOD_REVIEW', 'SALES_REVIEW', 'REWORK', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'ON_HOLD',
]

function parseRecordDate(value) {
  return parseDesignListDate(value)
}

function nextStatus(current) {
  const idx = STATUS_ORDER.indexOf(current)
  if (idx === -1) return STATUS_ORDER[0]
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]
}

function shouldLoadDesignList(pathname) {
  return (
    pathname?.startsWith('/design-list') ||
    pathname?.startsWith('/project-design') ||
    pathname?.startsWith('/sales/design-list') ||
    pathname?.startsWith('/sales/project-design')
  )
}

function normalizeDesignListResponse(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  return []
}

export function DesignListProvider({ children }) {
  const pathname = usePathname()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [typeFilters, setTypeFilters] = useState([])
  const [salesPerson, setSalesPerson] = useState('')
  const [createdDateRange, setCreatedDateRange] = useState({
    startDate: '',
    endDate: '',
  })

  useEffect(() => {
    if (!shouldLoadDesignList(pathname)) return
    let mounted = true
    setLoading(true)
    setError(null)
    apiClient
      .get('/design-list')
      .then((data) => {
        if (!mounted) return
        const rows = normalizeDesignListResponse(data)
        setRecords(dedupeDesignRecords(rows))
        setLoading(false)
      })
      .catch((err) => {
        if (!mounted) return
        console.error('[DesignList] Failed to load design list records:', err)
        setRecords([])
        setError(err?.message || 'Could not load project design records.')
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [pathname])

  const statusOptions = useMemo(() => {
    const uniq = Array.from(new Set(records.map((r) => r.status)))
    return ['All', ...uniq]
  }, [records])

  const typeOptions = useMemo(() => {
    return Array.from(new Set(records.map((r) => r.designType))).sort()
  }, [records])

  const salesPersonOptions = useMemo(() => {
    return Array.from(new Set(records.map((r) => r.salesPerson))).sort()
  }, [records])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const normalizedSalesPerson = salesPerson.trim().toLowerCase()
    const startDate = createdDateRange.startDate
      ? new Date(`${createdDateRange.startDate}T00:00:00`)
      : null
    const endDate = createdDateRange.endDate
      ? new Date(`${createdDateRange.endDate}T23:59:59`)
      : null

    return records.filter((r) => {
      const statusOk = status === 'All' ? true : r.status === status
      if (!statusOk) return false

      const typeOk = typeFilters.length ? typeFilters.includes(r.designType) : true
      if (!typeOk) return false

      const salesPersonOk = normalizedSalesPerson
        ? r.salesPerson.toLowerCase() === normalizedSalesPerson
        : true
      if (!salesPersonOk) return false

      const createdDate = parseRecordDate(r.created)
      const createdAfterStart = startDate ? createdDate && createdDate >= startDate : true
      const createdBeforeEnd = endDate ? createdDate && createdDate <= endDate : true
      if (!createdAfterStart || !createdBeforeEnd) return false

      if (!q) return true

      const hay = [
        r.opNo,
        r.projectNo,
        r.projectCode,
        r.clientName,
        r.projectName,
        r.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return hay.includes(q)
    })
  }, [createdDateRange.endDate, createdDateRange.startDate, query, records, salesPerson, status, typeFilters])

  const updateRecord = (id, patch) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    )
  }

  const cycleStatus = (id) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: nextStatus(r.status) } : r,
      ),
    )
  }

  const resetFilters = () => {
    setQuery('')
    setStatus('All')
    setTypeFilters([])
    setSalesPerson('')
    setCreatedDateRange({
      startDate: '',
      endDate: '',
    })
  }

  const value = useMemo(
    () => ({
      records,
      setRecords,
      loading,
      error,
      query,
      setQuery,
      status,
      setStatus,
      typeFilters,
      setTypeFilters,
      salesPerson,
      setSalesPerson,
      createdDateRange,
      setCreatedDateRange,
      statusOptions,
      typeOptions,
      salesPersonOptions,
      filtered,
      updateRecord,
      cycleStatus,
      resetFilters,
    }),
    [
      createdDateRange,
      error,
      filtered,
      loading,
      query,
      records,
      salesPerson,
      salesPersonOptions,
      status,
      statusOptions,
      typeFilters,
      typeOptions,
    ],
  )

  return (
    <DesignListContext.Provider value={value}>
      {children}
    </DesignListContext.Provider>
  )
}

export function useDesignListStore() {
  const ctx = useContext(DesignListContext)
  if (!ctx) {
    throw new Error('useDesignListStore must be used within DesignListProvider')
  }
  return ctx
}

