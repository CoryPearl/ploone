import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { flightAttitude, headingDifference } from '../public/js/core/instruments.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
test('flight instruments distinguish pitch, roll, and compass heading', () => {
  const level = flightAttitude(new Quaternion());
  close(level.pitch, 0); close(level.bank, 0); close(level.heading, 0);
  const pitched = flightAttitude(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 6));
  close(pitched.pitch, Math.PI / 6); close(pitched.bank, 0);
  const banked = flightAttitude(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 4));
  close(banked.bank, -Math.PI / 4); close(banked.pitch, 0);
  const east = flightAttitude(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2));
  close(east.heading, 90);
});

test('compass tape crosses north without a 360 degree jump', () => {
  close(headingDifference(0, 359), 1);
  close(headingDifference(350, 2), -12);
  close(headingDifference(10, 350), 20);
});

test('attitude remains finite through vertical and inverted flight', () => {
  for (const axis of [new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(1, 1, 1).normalize()]) {
    for (let angle = -Math.PI; angle <= Math.PI; angle += Math.PI / 12) {
      const values = flightAttitude(new Quaternion().setFromAxisAngle(axis, angle));
      assert.ok(Object.values(values).every(Number.isFinite));
      assert.ok(values.heading >= 0 && values.heading < 360);
    }
  }
});
