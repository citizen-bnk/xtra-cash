'use client';
import { useParams } from 'next/navigation';
import { Alert, CompetitionOfferForm, Loading, PersonalSettlementView, useApi } from '@xtra/ui';
export default function Application(){const {id}=useParams<{id:string}>();const state=useApi(c=>c.request<{competition:null|{status:string;winnerLenderId:string|null}}>('GET',`/loan-operations/competitions/${id}/state`),[id]);if(state.loading)return <Loading/>;if(state.error)return <Alert tone="red">{state.error}</Alert>;return state.data?.competition?.status==='OPEN'?<CompetitionOfferForm applicationId={id} onComplete={state.reload}/>:<PersonalSettlementView applicationId={id} reviewer/>;}
