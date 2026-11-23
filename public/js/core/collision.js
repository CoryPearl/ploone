const clamp = value => Math.max(0, Math.min(1, value));

// Closest distance between two finite segments, including point/parallel cases.
export function segmentDistanceSquared(a, b, c, d) {
  const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=d.x-c.x,vy=d.y-c.y,vz=d.z-c.z;
  const wx=a.x-c.x,wy=a.y-c.y,wz=a.z-c.z;
  const aa=ux*ux+uy*uy+uz*uz,bb=ux*vx+uy*vy+uz*vz,cc=vx*vx+vy*vy+vz*vz;
  const dd=ux*wx+uy*wy+uz*wz,ee=vx*wx+vy*wy+vz*wz;
  let s=0,t=0;
  if(aa<1e-12&&cc<1e-12)return wx*wx+wy*wy+wz*wz;
  if(aa<1e-12)t=clamp(ee/cc);
  else if(cc<1e-12)s=clamp(-dd/aa);
  else {
    const denominator=aa*cc-bb*bb;
    s=denominator>1e-12?clamp((bb*ee-cc*dd)/denominator):0;
    t=(bb*s+ee)/cc;
    if(t<0){t=0;s=clamp(-dd/aa);}else if(t>1){t=1;s=clamp((bb-dd)/aa);}
  }
  const x=wx+s*ux-t*vx,y=wy+s*uy-t*vy,z=wz+s*uz-t*vz;
  return x*x+y*y+z*z;
}
export const hitsCapsule=(from,to,a,b,radius)=>segmentDistanceSquared(from,to,a,b)<=radius*radius;
export const hitsSphere=(from,to,center,radius)=>hitsCapsule(from,to,center,center,radius);

export function hitsBox(from,to,min,max,padding=0) {
  let enter=0,exit=1;
  for(const key of ['x','y','z']) {
    const delta=to[key]-from[key],lo=min[key]-padding,hi=max[key]+padding;
    if(Math.abs(delta)<1e-12){if(from[key]<lo||from[key]>hi)return false;continue;}
    let a=(lo-from[key])/delta,b=(hi-from[key])/delta;if(a>b)[a,b]=[b,a];
    enter=Math.max(enter,a);exit=Math.min(exit,b);if(enter>exit)return false;
  }
  return true;
}
