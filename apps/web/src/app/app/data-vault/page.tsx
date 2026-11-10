'use client';
import { ApplicantDataVault } from '@/components/ApplicantDataVault';
import { PageHeader } from '@xtra/ui';

export default function DataVaultPage() {
  return <div className="space-y-4"><PageHeader title="My data vault" subtitle="Build a reusable verified profile before you need credit." /><ApplicantDataVault /></div>;
}
