'use client';
import { Suspense } from 'react';
import { AuthPageShell } from '@/components/AuthPageShell';
import { QuickAccess } from '@/components/QuickAccess';
export default function RegisterPage() { return <AuthPageShell currentPath="/register"><Suspense><QuickAccess initialRegister /></Suspense></AuthPageShell>; }
