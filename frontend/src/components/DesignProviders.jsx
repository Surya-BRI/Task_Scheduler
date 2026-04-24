// @ts-nocheck
'use client';
import { DesignListProvider } from '@/state/DesignListContext';
export default function DesignProviders({ children }) {
    return <DesignListProvider>{children}</DesignListProvider>;
}
