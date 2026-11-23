const SYSTEMS = {
  imperial: { speedFactor: 2.2369362921, speed: 'mph', lengthFactor: 3.280839895, length: 'ft', climbFactor: 196.8503937, climb: 'ft/min', climbStep: 50, travelFactor: 1 / 1609.344, travel: 'mi' },
  metric: { speedFactor: 3.6, speed: 'km/h', lengthFactor: 1, length: 'm', climbFactor: 60, climb: 'm/min', climbStep: 10, travelFactor: 1 / 1000, travel: 'km' }
};
export const unitsFor = units => SYSTEMS[units] || SYSTEMS.imperial;
export const heightValue = (meters, units) => Math.round(meters * unitsFor(units).lengthFactor).toLocaleString('en-US');
export const formatDistance = (meters, units) => `${heightValue(meters, units)} ${unitsFor(units).length}`;
export const formatSpeed = (speed, units) => `${Math.round(speed * unitsFor(units).speedFactor)} ${unitsFor(units).speed}`;
export const climbValue = (speed, units) => {
  const system = unitsFor(units); return Math.round(speed * system.climbFactor / system.climbStep) * system.climbStep;
};
export const travelValue = (meters, units) => (meters * unitsFor(units).travelFactor).toFixed(2);
