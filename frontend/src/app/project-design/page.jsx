'use client'

import { useRoleGuard } from '@/lib/use-role-guard'
import { ProjectDesignHub } from '@/features/projects/components/ProjectDesignHub'

export default function ProjectDesignRoutePage() {
  const authorized = useRoleGuard(['HOD'])
  if (!authorized) return null
  return <ProjectDesignHub />
}
