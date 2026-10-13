import { steps,statusAt } from './types';
import type { ImplementationState } from './api';
import TimelineItem from './TimelineItem';
import WorkflowStep from './WorkflowStep';
export default function Timeline({state,busy,readOnly,onComplete}:{state:ImplementationState;busy:boolean;readOnly:boolean;onComplete:(step:number)=>void}){
 return <ol className="imp-timeline" aria-label="Etapas da implantação">{steps.map((step,index)=><TimelineItem key={step.id} step={step} type={step.type} status={statusAt(index,state.completed)} last={index===6}><WorkflowStep step={step} state={state} busy={busy} readOnly={readOnly} onComplete={()=>onComplete(step.id)}/></TimelineItem>)}</ol>;
}
