import test from 'node:test';import assert from 'node:assert/strict';
import { DataTexture, Vector3 } from 'three';
import { AIRCRAFT } from '../public/js/core/aircraft-data.js';
import { normalizeCustomization, normalizeCustomizations, customizationFor } from '../public/js/core/customization.js';
import { createAircraft, disposeAircraft } from '../public/js/render/aircraft.js';
import { applyAircraftCustomization } from '../public/js/render/aircraft-customization.js';
import { COCKPITS } from '../public/js/render/cockpit-panel.js';
const textureFactory=()=>new DataTexture(new Uint8Array([255,255,255,255]),1,1);
const decorated={stickers:{leftWing:'bolt',rightWing:'star',leftSide:'shark',rightSide:'club'},hanging:'dice',color:'coral',dashboard:'duck',nameplate:'ACE'};

test('customizations validate per-plane choices, keep defaults independent, and sanitize nameplates',()=>{
 const value=normalizeCustomization({stickers:{leftWing:'bolt',rightWing:'not-a-design',fake:'shark'},hanging:'script',color:'#ff0000',dashboard:'photo',nameplate:'ACE\u0000\n1234567890123456789'});
 assert.equal(value.stickers.leftWing,'bolt');assert.equal(value.stickers.rightWing,'none');assert.equal('fake' in value.stickers,false);
 assert.equal(value.hanging,'none');assert.equal(value.color,'cream');assert.equal(value.dashboard,'photo');assert.equal(value.nameplate.length,16);assert.equal(/[\u0000-\u001f]/.test(value.nameplate),false);
 const settings={customizations:normalizeCustomizations({f16:decorated,p51:{hanging:'freshener'},unknown:decorated})};
 assert.equal('unknown' in settings.customizations,false);assert.deepEqual(customizationFor(settings,'f16'),normalizeCustomization(decorated));
 assert.equal(customizationFor(settings,'p51').hanging,'freshener');assert.equal(customizationFor(settings,'f22').hanging,'none');
 const a=customizationFor(settings,'f22'),b=customizationFor(settings,'f22');a.stickers.leftWing='bolt';assert.equal(b.stickers.leftWing,'none');
 assert.deepEqual(normalizeCustomizations(null),{});assert.deepEqual(normalizeCustomization([]),normalizeCustomization());
});

test('every aircraft has a distinct cockpit layout and the appropriate control type',()=>{
 assert.equal(new Set(AIRCRAFT.map(plane=>COCKPITS[plane.id].layout)).size,8);
 assert.equal(COCKPITS.c172.controls,'yoke');assert.equal(COCKPITS.f16.controls,'side');assert.equal(COCKPITS.p51.controls,'stick');
 for(const plane of AIRCRAFT)assert.ok(COCKPITS[plane.id].name&&COCKPITS[plane.id].canopy);
});

test('stickers project onto all four airframe surfaces without moving or enlarging the aircraft',()=>{
 for(const data of AIRCRAFT){
  const model=createAircraft(data),bounds=model.userData.airframeBounds.clone().expandByScalar(.03);
  model.position.set(13000,800,-7200);model.rotation.set(.12,-.27,.08);const position=model.position.clone(),quaternion=model.quaternion.clone();
  applyAircraftCustomization(model,decorated,{textureFactory});assert.equal(model.userData.stickers.children.length,4,data.id);
  for(const sticker of model.userData.stickers.children){
   const p=sticker.geometry.attributes.position;assert.ok(p.count>0);
   for(let i=0;i<p.count;i++){const point=new Vector3().fromBufferAttribute(p,i);assert.ok([...point].every(Number.isFinite));assert.ok(bounds.containsPoint(point),data.id+' sticker stays on the airframe');}
  }
  assert.ok(model.position.equals(position));assert.ok(model.quaternion.equals(quaternion));disposeAircraft(model);
 }
});

test('unchanged stickers reuse geometry and changing or removing designs releases old GPU resources',()=>{
 const model=createAircraft(AIRCRAFT[0]);applyAircraftCustomization(model,decorated,{textureFactory});const first=model.userData.stickers;
 applyAircraftCustomization(model,{...decorated,nameplate:'NEW'},{textureFactory});assert.equal(model.userData.stickers,first);
 let geometries=0,textures=0;first.traverse(object=>{object.geometry?.addEventListener('dispose',()=>geometries++);object.material?.map?.addEventListener('dispose',()=>textures++);});
 applyAircraftCustomization(model,normalizeCustomization(),{textureFactory});assert.equal(model.userData.stickers.children.length,0);assert.equal(geometries,4);assert.equal(textures,4);
 disposeAircraft(model);
});
