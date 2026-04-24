// @ts-nocheck
import { createContext, useContext, useMemo, useState } from 'react';
import { DESIGN_RECORDS } from '../data/designs.js';
const DesignListContext = createContext(null);
const STATUS_ORDER = ['WIP', 'Pending', 'Revision', 'Approved', 'Completed'];
function parseRecordDate(value) {
    if (!value)
        return null;
    const [month, day, year] = value.split('/').map(Number);
    if (!month || !day || !year)
        return null;
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function nextStatus(current) {
    const idx = STATUS_ORDER.indexOf(current);
    if (idx === -1)
        return STATUS_ORDER[0];
    return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
}
export function DesignListProvider({ children }) {
    const [records, setRecords] = useState(DESIGN_RECORDS);
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('All');
    const [typeFilters, setTypeFilters] = useState([]);
    const [salesPerson, setSalesPerson] = useState('');
    const [createdDateRange, setCreatedDateRange] = useState({
        startDate: '',
        endDate: '',
    });
    const statusOptions = useMemo(() => {
        const uniq = Array.from(new Set(records.map((r) => r.status)));
        return ['All', ...uniq];
    }, [records]);
    const typeOptions = useMemo(() => {
        return Array.from(new Set(records.map((r) => r.designType))).sort();
    }, [records]);
    const salesPersonOptions = useMemo(() => {
        return Array.from(new Set(records.map((r) => r.salesPerson))).sort();
    }, [records]);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const normalizedSalesPerson = salesPerson.trim().toLowerCase();
        const startDate = createdDateRange.startDate
            ? new Date(`${createdDateRange.startDate}T00:00:00`)
            : null;
        const endDate = createdDateRange.endDate
            ? new Date(`${createdDateRange.endDate}T23:59:59`)
            : null;
        return records.filter((r) => {
            const statusOk = status === 'All' ? true : r.status === status;
            if (!statusOk)
                return false;
            const typeOk = typeFilters.length ? typeFilters.includes(r.designType) : true;
            if (!typeOk)
                return false;
            const salesPersonOk = normalizedSalesPerson
                ? r.salesPerson.toLowerCase() === normalizedSalesPerson
                : true;
            if (!salesPersonOk)
                return false;
            const createdDate = parseRecordDate(r.created);
            const createdAfterStart = startDate ? createdDate && createdDate >= startDate : true;
            const createdBeforeEnd = endDate ? createdDate && createdDate <= endDate : true;
            if (!createdAfterStart || !createdBeforeEnd)
                return false;
            if (!q)
                return true;
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
                .toLowerCase();
            return hay.includes(q);
        });
    }, [createdDateRange.endDate, createdDateRange.startDate, query, records, salesPerson, status, typeFilters]);
    const updateRecord = (id, patch) => {
        setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    };
    const cycleStatus = (id) => {
        setRecords((prev) => prev.map((r) => r.id === id ? { ...r, status: nextStatus(r.status) } : r));
    };
    const resetFilters = () => {
        setQuery('');
        setStatus('All');
        setTypeFilters([]);
        setSalesPerson('');
        setCreatedDateRange({
            startDate: '',
            endDate: '',
        });
    };
    const value = useMemo(() => ({
        records,
        setRecords,
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
    }), [
        createdDateRange,
        filtered,
        query,
        records,
        salesPerson,
        salesPersonOptions,
        status,
        statusOptions,
        typeFilters,
        typeOptions,
    ]);
    return (<DesignListContext.Provider value={value}>
      {children}
    </DesignListContext.Provider>);
}
export function useDesignListStore() {
    const ctx = useContext(DesignListContext);
    if (!ctx) {
        throw new Error('useDesignListStore must be used within DesignListProvider');
    }
    return ctx;
}
