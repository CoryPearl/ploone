# Aircraft model references

These are original, code-built low-poly interpretations, with approximate full-size proportions. No downloaded models or photo textures are used. Fuselage cross sections, airfoil stations, intake mouths, and fins are separate editable geometry. Handling prioritizes arcade responsiveness with low-speed stalls and speed loss in steep climbs.

| Aircraft represented | Length × span, approximately | Recognition features |
| --- | --- | --- |
| F-16C | 14.8 × 9.8 m | Single chin intake, bubble canopy, cropped swept wing, one upright fin, ventral fins, one round nozzle |
| F/A-18E Super Hornet | 18.5 × 13.68 m | Long forebody and root extensions, rectangular side intakes, twin engines, canted twin fins, wingtip rails |
| F-22A | 18.9 × 13.6 m | Wide faceted body, diamond wings, two-tone upper panels, canted twin fins, two flat nozzles |
| F-35A | 15.7 × 10.7 m | Fuller single-engine body, shoulder intakes, smaller swept wings, canted twin fins, one round nozzle |
| A-10C | 16.26 × 17.53 m | Broad straight wings, high aft turbofan pods with fan faces, outboard twin fins, blunt nose and muzzle |
| P-51D Mustang | 9.83 × 11.28 m | Long inline-engine cowling, rear bubble canopy, belly radiator scoop, tapered wings, four-blade propeller |
| F4U-1D Corsair | 10.16 × 12.5 m | Round radial-engine cowling, aft cockpit, continuous inverted-gull wing, three-blade propeller |
| Cessna 172S | 8.28 × 11 m | High wing, lift struts, glazed four-seat cabin, two-blade propeller, fixed tricycle landing gear |

Dimensions are rounded modeling targets, rather than engineering tolerances. The A-10 dimensions use the conversion of the published imperial measurements; some official pages have inconsistent metric conversions. Paint is simplified, with restrained military grays, a blue Corsair, silver Mustang, and white/red Skyhawk. Small national markings are made from geometry.

## Primary references

- [USAF F-16 fact sheet](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104505/f-16-fighting-falcon/)
- [NAVAIR F/A-18E/F Super Hornet](https://www.navair.navy.mil/product/FA-18EF-Super-Hornet)
- [USAF F-22 fact sheet](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/)
- [USAF F-35A fact sheet](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/478441/f-35a-lightning-ii-conventional-takeoff-and-landing-variant/)
- [USAF Museum A-10A](https://www.nationalmuseum.af.mil/Visit/MuseumExhibits/FactSheets/Display/tabid/509/Article/195855/fairchild-republic-a-10a-thunderbolt-ii.aspx)
- [USAF Museum P-51D](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/196263/north-american-p-51d-mustang/)
- [Smithsonian F4U-1D Corsair](https://airandspace.si.edu/collection-objects/vought-f4u-1d-corsair/nasm_A19610124000)
- [Naval History and Heritage Command Corsair specification](https://www.history.navy.mil/content/dam/nhhc/research/histories/naval-aviation/dictionary-of-american-naval-aviation-squadrons-volume-1/pdfs/app1-2.pdf)
- [Textron Skyhawk dimensions](https://cessna.txtav.com/-/media/cessna/files/product-cards/piston/skyhawk_product_card.ashx)

## Modeling constraints

Airframes use low-sided lofts and joined airfoils, with flat-shaded materials. No dense subdivision, imported texture maps, or external asset requests are needed. The hangar frames the actual airframe bounds rather than a common placeholder size. Afterburner plumes attach to each model's nozzle positions; the F-22 plumes match its flattened exits. Ghosts use the same geometry with a translucent cyan material.

## Moving surfaces

Main wings have separate inboard flaps and outboard ailerons cut from their trailing edges, with individual hinges following sweep, dihedral, and the Corsair gull bends. The four afterburning fighters use all-moving stabilators with differential roll; the A-10 and props have trailing-edge elevators. Each fin has a separate rudder hinged along its swept trailing section. The controls drive the surfaces with a short smoothing response; Space deploys the flaps, and low airspeed gives partial flap extension. These are visual mechanisms following the arcade flight model, rather than a separate aerodynamic simulation. Static hangar previews stay neutral, and personal ghosts replay the same control animation.
