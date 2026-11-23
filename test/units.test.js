import test from 'node:test';
import assert from 'node:assert/strict';
import { unitsFor, heightValue, formatDistance, formatSpeed, climbValue, travelValue } from '../public/js/core/units.js';
import { defaultSettings } from '../public/js/core/storage.js';

test('mph/feet are the default and metric converts all flight measurements consistently',()=>{
 assert.equal(defaultSettings.units,'imperial');assert.equal('missiles' in defaultSettings,false);
 assert.equal(formatSpeed(100,'imperial'),'224 mph');assert.equal(formatSpeed(100,'metric'),'360 km/h');
 assert.equal(formatDistance(1000,'imperial'),'3,281 ft');assert.equal(formatDistance(1000,'metric'),'1,000 m');
 assert.equal(heightValue(100,'imperial'),'328');assert.equal(climbValue(5,'imperial'),1000);assert.equal(climbValue(5,'metric'),300);
 assert.equal(travelValue(1609.344,'imperial'),'1.00');assert.equal(travelValue(1000,'metric'),'1.00');assert.equal(unitsFor('unknown').speed,'mph');
});
