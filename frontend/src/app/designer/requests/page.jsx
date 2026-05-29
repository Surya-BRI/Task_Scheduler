'use client';
import { Suspense } from 'react';
import RequestsClient from '../[designerId]/requests/RequestsClient';

export default function RequestsPage() {
  return (
    <Suspense>
      <RequestsClient />
    </Suspense>
  );
}
