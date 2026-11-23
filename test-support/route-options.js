// Independent test-only exploration. The game never imports this search or its
// output. Candidate routes are evidence of choice, not marked racing lines.
export function exploreRoutes(world,course,{count=10,step=240}={}) {
 const r=world.region,columns=Math.ceil(r.length/step),halfRows=Math.ceil(r.halfWidth/step),width=halfRows*2+1,cells=(columns+1)*width;
 const levels=[r.base+210,r.base+420,r.base+640,course.ceiling-75].filter((h,i,a)=>!i||h>a[i-1]+40),size=cells*levels.length;
 const points=[],ground=new Float64Array(cells),edgeCache=new Map(),heat=new Float64Array(size),routes=[];
 for(let c=0;c<=columns;c++)for(let row=0;row<width;row++){
  const along=r.length*c/columns,across=(row-halfRows)*step,p={x:r.start.x+r.direction.x*along+r.side.x*across,z:r.start.z+r.direction.z*along+r.side.z*across};points.push(p);ground[c*width+row]=Math.max(0,world.height(p.x,p.z));
 }
 const point=index=>({...points[index%cells],y:levels[Math.floor(index/cells)]});
 const clear=(a,b)=>{
  const ia=a%cells,ib=b%cells,key=ia<ib?`${ia}:${ib}`:`${ib}:${ia}`;
  if(!edgeCache.has(key)){
   const from=points[ia],to=points[ib];let peak=Math.max(ground[ia],ground[ib]);
   const samples=Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/10);
   for(let i=1;i<samples;i++){const t=i/samples;peak=Math.max(peak,world.height(from.x+(to.x-from.x)*t,from.z+(to.z-from.z)*t));}
   edgeCache.set(key,peak);
  }
  return edgeCache.get(key)+45<Math.min(levels[Math.floor(a/cells)],levels[Math.floor(b/cells)]);
 };
 const moves=[];for(let dc=-1;dc<=2;dc++)for(let dr=-1;dr<=1;dr++)if(dc||dr)moves.push([dc,dr]);
 const search=()=>{
  const costs=new Float64Array(size).fill(Infinity),parents=new Int32Array(size).fill(-1),closed=new Uint8Array(size),heap=[];
  const push=item=>{heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].priority<=item.priority)break;heap[i]=heap[p];i=p;}heap[i]=item;};
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].priority<heap[child].priority)child++;if(heap[child].priority>=last.priority)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;};
  const start=halfRows;costs[start]=0;push({index:start,priority:0});let finish=-1;
  while(heap.length){
   const {index}=pop();if(closed[index])continue;closed[index]=1;
   const cell=index%cells,column=Math.floor(cell/width),row=cell%width,level=Math.floor(index/cells),a=point(index);
   if(column===columns&&row===halfRows&&level===0){finish=index;break;}
   for(const [dc,dr]of moves)for(let dl=-1;dl<=1;dl++){
    const c=column+dc,p=row+dr,l=level+dl;if(c<0||c>columns||p<0||p>=width||l<0||l>=levels.length)continue;
    const next=l*cells+c*width+p;if(closed[next]||ground[c*width+p]+45>=levels[l])continue;
    const b=point(next),distance=Math.hypot(a.x-b.x,a.z-b.z),rise=b.y-a.y;
    if(Math.abs(rise)>distance*(rise>0?.6:.85)||!clear(index,next))continue;
    const cost=costs[index]+distance/160+Math.max(0,rise)/25+Math.max(0,-rise)/140+heat[next];
    if(cost>=costs[next])continue;costs[next]=cost;parents[next]=index;
    push({index:next,priority:cost+Math.hypot(b.x-course.finish.x,b.z-course.finish.z)/160});
   }
  }
  if(finish<0)return null;
  const indices=[];for(let i=finish;i>=0;i=parents[i])indices.push(i);indices.reverse();return indices;
 };
 const distanceTo=(p,path)=>{
  let best=Infinity;
  for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i],dx=b.x-a.x,dy=(b.y-a.y)*1.6,dz=b.z-a.z,den=dx*dx+dy*dy+dz*dz;
   const t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*1.6*dy+(p.z-a.z)*dz)/den)):0;
   best=Math.min(best,Math.hypot(p.x-a.x-dx*t,(p.y-a.y)*1.6-dy*t,p.z-a.z-dz*t));
  }
  return best;
 };
 let attempts=0;
 while(routes.length<count&&attempts++<count*3){
  const indices=search();if(!indices)break;const path=indices.map(point);
  let estimate=0,length=0,ascent=0;
  for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],d=Math.hypot(b.x-a.x,b.z-a.z),rise=b.y-a.y;length+=d;ascent+=Math.max(0,rise);estimate+=d/160+Math.max(0,rise)/25+Math.max(0,-rise)/140;}
  const middle=path.filter((_,i)=>i>path.length*.15&&i<path.length*.85);
  const distinct=routes.every(route=>middle.filter(p=>distanceTo(p,route.path)>220).length>=middle.length*.25);
  if(distinct&&(!routes.length||estimate<routes[0].estimate*1.55))routes.push({path,estimate,length,ascent,maxAltitude:Math.max(...path.map(p=>p.y))});
  // Penalize a neighborhood, not just the exact cells: a 5 m offset is not a
  // meaningful alternative. Heights are included so saddle/climb choices count.
  for(const index of indices){
   const cell=index%cells,column=Math.floor(cell/width),row=cell%width,level=Math.floor(index/cells);
   if(column<columns*.12||column>columns*.88)continue;
   for(let dc=-2;dc<=2;dc++)for(let dr=-2;dr<=2;dr++)for(let dl=-1;dl<=1;dl++){
    const c=column+dc,p=row+dr,l=level+dl;if(c<0||c>columns||p<0||p>=width||l<0||l>=levels.length)continue;
    heat[l*cells+c*width+p]+=1.1*Math.exp(-(dc*dc+dr*dr)*.45-dl*dl*.9);
   }
  }
 }
 return routes;
}
