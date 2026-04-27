import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

function getSelectedLabel({ multiple, value, values, options, placeholder }) {
  if (multiple) {
    if (!values?.length) return placeholder
    if (values.length === 1) {
      const selected = options.find((item) => item.value === values[0])
      return selected?.label ?? placeholder
    }
    return `${values.length} selected`
  }

  if (!value) return placeholder
  const selected = options.find((item) => item.value === value)
  return selected?.label ?? placeholder
}

export function FilterDropdown({
  icon,
  placeholder,
  options,
  value = '',
  values = [],
  onChange,
  multiple = false,
  searchable = false,
  optionRenderer,
  className = '',
}) {
  const Icon = icon
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const filteredOptions = useMemo(() => {
    if (!searchable) return options
    const normalized = search.trim().toLowerCase()
    if (!normalized) return options
    return options.filter((item) => item.label.toLowerCase().includes(normalized))
  }, [options, search, searchable])

  const label = getSelectedLabel({
    multiple,
    value,
    values,
    options,
    placeholder,
  })

  const handleOptionClick = (optionValue) => {
    if (multiple) {
      const exists = values.includes(optionValue)
      if (exists) {
        onChange(values.filter((item) => item !== optionValue))
      } else {
        onChange([...values, optionValue])
      }
      return
    }

    onChange(optionValue)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className={`relative min-w-[180px] ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-10 w-full items-center gap-2 rounded-lg bg-white px-3 text-left text-sm text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
      >
        <Icon className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-full min-w-[220px] rounded-lg bg-white p-2 shadow-lg ring-1 ring-slate-200">
          {searchable ? (
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search..."
              className="mb-2 h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-blue-300"
            />
          ) : null}

          <div className="max-h-56 overflow-auto">
            {filteredOptions.length ? (
              filteredOptions.map((item) => {
                const selected = multiple
                  ? values.includes(item.value)
                  : value === item.value

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => handleOptionClick(item.value)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                      selected ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {multiple ? (
                      <span
                        className={`grid h-4 w-4 place-items-center rounded border ${
                          selected
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-slate-300 bg-white text-transparent'
                        }`}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                    {optionRenderer ? (
                      optionRenderer(item, selected)
                    ) : (
                      <span className="truncate">{item.label}</span>
                    )}
                  </button>
                )
              })
            ) : (
              <div className="px-2 py-2 text-xs text-slate-500">No options found</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

