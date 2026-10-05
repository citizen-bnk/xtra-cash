'use client';
import { Suspense } from 'react';
import { AuthPageShell } from '@/components/AuthPageShell';
import { QuickAccess } from '@/components/QuickAccess';
export default function LoginPage() { return <AuthPageShell currentPath="/login"><Suspense><QuickAccess /></Suspense></AuthPageShell>; }
