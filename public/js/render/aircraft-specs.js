// Approximate full-size airframe dimensions in metres; visuals only.
// Reference links and variant choices: docs/aircraft-models.md.
export const MODEL_SPECS = {
  f16: { variant: 'F-16C', length: 14.8, span: 9.8, engines: 1, fins: 1 },
  fa18: { variant: 'F/A-18E', length: 18.5, span: 13.68, engines: 2, fins: 2 },
  f22: { variant: 'F-22A', length: 18.9, span: 13.6, engines: 2, fins: 2 },
  f35: { variant: 'F-35A', length: 15.7, span: 10.7, engines: 1, fins: 2 },
  a10: { variant: 'A-10C', length: 16.26, span: 17.53, engines: 2, fins: 2 },
  p51: { variant: 'P-51D', length: 9.83, span: 11.28, engines: 1, fins: 1, blades: 4 },
  f4u: { variant: 'F4U-1D', length: 10.16, span: 12.5, engines: 1, fins: 1, blades: 3 },
  c172: { variant: 'Cessna 172S', length: 8.28, span: 11, engines: 1, fins: 1, blades: 2 }
};
