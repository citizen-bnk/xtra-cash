'use client';
import { useParams } from 'next/navigation';
import { PersonalSettlementView } from '@xtra/ui';
export default function Application(){const {id}=useParams<{id:string}>();return <PersonalSettlementView applicationId={id}/>;}
