/** Fast, deterministic English writing checks. Not a grammar checker or AI rewrite engine.
 * Only call on text a user explicitly submits. No storage, watchers, or network access.
 */
export type ProofIssue = {
  kind: 'spacing'|'repetition'|'punctuation'|'length'|'trailing-space';
  start: number;
  end: number;
  before: string;
  replacement?: string;
  message: string;
};
const MAX_TEXT=12_000;
const MAX_ISSUES=50;

export function proofreadWriting(text:string): ProofIssue[] {
  if(typeof text!=='string'||text.length>MAX_TEXT)throw new RangeError('Writing check must contain at most 12,000 characters');
  if(!text.trim())return [];
  const results:ProofIssue[]=[];
  const add=(entry:ProofIssue)=>{if(results.length<MAX_ISSUES)results.push(entry);};
  for(const match of text.matchAll(/(?<=\S) {2,}(?=\S)/g)){
    add({kind:'spacing',start:match.index,end:match.index+match[0].length,before:match[0],replacement:' ',message:'Extra spaces between words. Review before replacing.'});
  }
  for(const match of text.matchAll(/\b([a-z][a-z'-]*)[ \t]+\1\b/gi)){
    const word=match[1]!;const before=match[0];
    add({kind:'repetition',start:match.index,end:match.index+before.length,before,replacement:word,message:`Possible repeated word “${word}”. This may be intentional.`});
  }
  for(const match of text.matchAll(/(?:!{3,}|\?{3,})/g)){
    add({kind:'punctuation',start:match.index,end:match.index+match[0].length,before:match[0],replacement:match[0][0]!,message:'Repeated punctuation can feel emphatic. Consider using one mark.'});
  }
  for(const match of text.matchAll(/[ \t]+(?=\r?\n|$)/gm)){
    add({kind:'trailing-space',start:match.index,end:match.index+match[0].length,before:match[0],replacement:'',message:'Trailing whitespace at the end of a line.'});
  }
  // Readability is advisory. Breaks on sentence-ending punctuation only, preserving exact UTF-16 offsets.
  for(const match of text.matchAll(/[^.!?\n]+(?:[.!?]+|$)/g)){
    const words=match[0].match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)??[];
    if(words.length>40)add({kind:'length',start:match.index,end:match.index+match[0].length,before:match[0].slice(0,180),
      message:`Long sentence (${words.length} words). Consider splitting it for readability.`});
  }
  // Prevent conflicting replacement ranges. A repeating word with double spaces gets one spacing issue first.
  return results.sort((a,b)=>a.start-b.start||a.end-b.end).filter((item,index,array)=>index===0||
    !(item.start<array[index-1]!.end && item.replacement!==undefined && array[index-1]!.replacement!==undefined));
}
