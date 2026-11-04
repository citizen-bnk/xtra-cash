import {applyGroundedUpdates} from './lender-ai.service';
import {validateWorkValues} from './work-assistant';
describe('AI preparation controls',()=>{
 it('rejects fabricated assessment references even when a model claims a source',()=>{expect(()=>applyGroundedUpdates({},[{field:'assessmentReference',value:'INVENTED',sourceQuote:'All checks passed'}],['All checks passed'],[])).toThrow();});
 it('accepts only literal supplied legal wording and available products',()=>{const terms='Approved legal terms supplied verbatim by the lender.';expect(applyGroundedUpdates({},[{field:'agreementTerms',value:terms,sourceQuote:terms}], [terms],[]).draft.agreementTerms).toBe(terms);expect(()=>applyGroundedUpdates({},[{field:'offerId',value:'foreign-product',sourceQuote:''}],[],[{id:'owned'}])).toThrow();});
 it('does not interpret a question about today as a completed assessment',()=>{expect(()=>applyGroundedUpdates({},[{field:'assessedAt',value:'TODAY',sourceQuote:'Can we do it today?'}],['Can we do it today?'],[])).toThrow();});
 const field={key:'field-0',label:'Amount',type:'number' as const,options:[],maxLength:30,min:0,max:10000};
 it('enforces saved preparation limits and rejects protected/unknown fields',()=>{expect(()=>validateWorkValues([field],[{key:'field-0',value:'6000',sourceQuote:'6000'}],5000)).toThrow();expect(()=>validateWorkValues([{...field,label:'Security role'}],[{key:'field-0',value:'1',sourceQuote:'1'}],5000)).toThrow();expect(()=>validateWorkValues([field],[{key:'not-in-form',value:'1',sourceQuote:'1'}],5000)).toThrow();});
 it('rejects invented select choices',()=>{expect(()=>validateWorkValues([{...field,type:'select',label:'Product',options:[{value:'one',label:'One'}]}],[{key:'field-0',value:'two',sourceQuote:''}],5000)).toThrow();});
});
