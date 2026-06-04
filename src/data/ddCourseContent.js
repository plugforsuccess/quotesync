// src/data/ddCourseContent.js
// Content adapter for the Georgia 6-Hour Defensive Driving course.
// Keyed by dd_modules.content_ref. Each module is a list of sections
// (heading + paragraphs). This is the swap point for richer content later
// (MDX, video, narration) — the player only depends on this shape.

export const ddModuleContent = {
  'm1-foundations': {
    intro:
      'Defensive driving means driving to save lives, time, and money — in spite of the conditions around you and the actions of others. This module sets the mindset and the core hazard-management process you will use for the rest of the course.',
    sections: [
      {
        heading: 'The cost of collisions',
        body: [
          'Crashes carry enormous human and financial cost: injury, lost time, property damage, higher premiums, and personal liability. Most are preventable.',
          'The chain this course builds is simple: better knowledge leads to a better attitude, which leads to better behavior — fewer crashes, and lower insurance costs over time.',
        ],
      },
      {
        heading: 'Responsibility and attitude',
        body: [
          'Driving is a privilege governed by law, not an absolute right. You cannot control other drivers — only your own preparation and response.',
          'Your “share of responsibility” is to manage risk rather than simply accept it. Complacency and overconfidence are hidden hazards: the experienced driver who stops scanning is exposed just like the novice.',
        ],
      },
      {
        heading: 'The collision-prevention model (SIPDE)',
        body: [
          'Use one repeatable process every time you drive:',
          'Search the road aggressively — scan 12–15 seconds ahead and check mirrors every 5–8 seconds; eliminate fixed stares.',
          'Identify hazards — fixed, moving, and potential (what could happen).',
          'Predict the conflict — anticipate where paths could cross.',
          'Decide an action — adjust speed, position, or communication (signals, horn, lights).',
          'Execute smoothly and early, and always leave yourself an “out.” Ask: What can happen? What is my plan? What is my escape route?',
        ],
      },
      {
        heading: 'Georgia’s points system',
        body: [
          'Georgia’s Department of Driver Services (DDS) assigns points on conviction of moving violations. Accumulating 15 points within 24 months results in license suspension.',
          'Sample point values (verify against the current DDS schedule): reckless driving 4; aggressive driving 6; speeding 15–18 over 2, 19–23 over 3, 24–33 over 4, 34+ over 6; failure to obey a traffic-control device 3.',
          'Completing a defensive driving course can remove up to 7 points, once every 5 years — this is a separate use from the insurance discount. Drivers under 21 and under 18 face stricter thresholds and added requirements.',
        ],
      },
    ],
  },

  'm2-human-factors': {
    intro:
      'Most crashes trace back to the driver. This module covers how vision, attention, fatigue, and emotion affect driving — and the countermeasures that work.',
    sections: [
      {
        heading: 'Vision — your primary driving sense',
        body: [
          'About 90% of driving decisions rely on vision. Central vision sees detail; peripheral vision detects movement. At speed, tunnel vision narrows what you notice.',
          'Scan far ahead, use your mirrors, clear blind spots with head checks, and look where you want to go. Good visual lead buys time to plan.',
        ],
      },
      {
        heading: 'Distracted driving and the Hands-Free law',
        body: [
          'Distraction comes in three forms: visual (eyes off road), manual (hands off wheel), and cognitive (mind off task). Texting involves all three.',
          'At 55 mph a vehicle covers roughly the length of a football field in about five seconds — the time it takes to glance at a phone.',
          'Georgia’s Hands-Free Act prohibits holding or supporting a phone with any part of the body while driving; no writing, reading, or sending texts/emails; no watching or recording video. Voice or single-touch, hands-free use only — with stricter rules in work and school zones.',
        ],
      },
      {
        heading: 'Fatigue and drowsy driving',
        body: [
          'Warning signs include yawning, drifting, missed exits, heavy eyelids, and micro-sleeps. Drowsiness impairs reaction and judgment much like alcohol.',
          'What works: adequate sleep, planned stops, and shared driving. What does not: loud radio, an open window, or caffeine as a substitute for sleep.',
        ],
      },
      {
        heading: 'Emotion and aggressive driving',
        body: [
          'Anger, stress, and time pressure degrade judgment and push drivers toward risk-taking — tailgating, weaving, and “punishing” others. Georgia carries elevated penalties for aggressive driving.',
          'De-escalate: create space, do not engage or make eye contact, and never respond to provocation. Manage yourself — leave early, build margin, breathe, and depersonalize others’ mistakes.',
        ],
      },
    ],
  },

  'm3-impairment': {
    intro:
      'Impairing substances — alcohol, drugs, even some medications — degrade the skills driving depends on. This module covers the effects, Georgia’s DUI law, and prevention.',
    sections: [
      {
        heading: 'How alcohol affects driving',
        body: [
          'Alcohol is a depressant. It slows reaction time and impairs judgment, vision, coordination, and divided attention. Judgment is impaired before a driver feels “drunk.”',
          'BAC depends on amount, time, body weight, food, and other factors — and only time lowers it. Coffee, cold showers, and fresh air do not sober a person.',
        ],
      },
      {
        heading: 'Georgia DUI law and implied consent',
        body: [
          'Per se BAC limits: 0.08% for drivers 21 and older; 0.04% for commercial drivers; 0.02% for drivers under 21.',
          'By driving in Georgia you give implied consent to chemical testing; refusal carries its own license suspension.',
          'Consequences can include fines, jail exposure, license suspension, a state-approved Risk Reduction Program, ignition interlock, and steep multi-year insurance costs. A DUI generally disqualifies a driver from the clean-record insurance discount.',
        ],
      },
      {
        heading: 'Drugs and driving',
        body: [
          'Illegal drugs, cannabis, and prescription or over-the-counter medications can all impair. “Legal” does not mean “safe to drive.”',
          'Read warning labels; combining substances multiplies impairment. Georgia’s DUI law covers drugs and any combination that renders a driver “less safe.”',
        ],
      },
      {
        heading: 'Prevention and planning',
        body: [
          'Plan ahead: a designated driver, rideshare, transit, or staying over. Intervene to stop an impaired friend from driving.',
          'Weigh the real cost: a single DUI vastly outweighs the price of a ride.',
        ],
      },
    ],
  },

  'm4-space-speed': {
    intro:
      'Space and speed management give you time to see, decide, and act. This module covers following distance, stopping distance, Georgia speed law, and high-conflict maneuvers.',
    sections: [
      {
        heading: 'Space management and following distance',
        body: [
          'Use the 3-second rule under ideal conditions: pick a fixed point and count “one-one-thousand…”. Increase to 4+ seconds in rain, fog, at night, in heavy traffic, or when followed too closely.',
          'Manage space on all sides — front, rear, and to the sides. If you are tailgated, increase your front gap and let the other driver pass. Never brake-check.',
        ],
      },
      {
        heading: 'Speed, stopping distance, and energy',
        body: [
          'Total stopping distance = perception distance + reaction distance + braking distance. Average reaction time of about three-quarters of a second already covers many feet before braking begins.',
          'Speed has a nonlinear effect: braking distance grows with the square of speed — double your speed and braking distance roughly quadruples. Crash energy rises sharply with speed.',
        ],
      },
      {
        heading: 'Georgia speed law and Super Speeder',
        body: [
          'The basic speed rule: never drive faster than is reasonable and prudent for conditions, regardless of the posted limit. School and work zones carry reduced limits and enhanced penalties.',
          'The Super Speeder law adds a $200 state fee (on top of local fines) for driving 75+ mph on a two-lane road or 85+ mph anywhere in Georgia. Failure to pay leads to suspension and a reinstatement fee.',
        ],
      },
      {
        heading: 'Intersections, passing, and lane changes',
        body: [
          'Intersections are the highest-conflict zones: cover the brake, scan left-right-left, and watch for red-light runners and left-turn gap errors.',
          'Pass only where legal and with clear sight distance: signal, check your blind spot, and return only when you can see the passed vehicle in your mirror. Change lanes with mirror–signal–head-check–smooth move, and respect large-vehicle blind spots (“No-Zones”).',
        ],
      },
    ],
  },

  'm5-sharing-road': {
    intro:
      'Driving predictably around all road users prevents conflict. This module covers right-of-way, occupant protection, vulnerable users, and Georgia’s special-vehicle laws.',
    sections: [
      {
        heading: 'Right-of-way',
        body: [
          'Right-of-way is something you give, not take. At a four-way stop, the first to stop goes first; when two arrive together, yield to the vehicle on the right.',
          'Yield when turning left across oncoming traffic, to traffic already in a roundabout, and to pedestrians in crosswalks.',
        ],
      },
      {
        heading: 'Occupant protection',
        body: [
          'Georgia requires seat belts. Worn correctly, the lap belt sits low across the hips and the shoulder belt crosses the chest. Belts plus airbags are the single most effective injury countermeasure — airbags supplement belts, they do not replace them.',
          'Children must be properly restrained for their age and size, generally using a booster until an adult belt fits. Children under 13 are safest in the back seat.',
        ],
      },
      {
        heading: 'Vulnerable road users',
        body: [
          'Yield to pedestrians in crosswalks; use extra caution near schools, transit stops, and at night.',
          'Treat bicyclists as vehicles and pass with a safe lateral buffer. Motorcyclists are harder to see and their speed is hard to judge — allow a full lane and double-check before turning or changing lanes.',
          'Give large trucks and buses room: long stopping distances, wide turns, and large blind spots (“No-Zones”). Don’t cut in front or linger alongside.',
        ],
      },
      {
        heading: 'Move Over law and special vehicles',
        body: [
          'Georgia’s Move Over law requires moving over one lane for stationary emergency, law-enforcement, utility, and recovery vehicles displaying flashing lights — or, if you cannot move over safely, slowing below the speed limit and being prepared to stop.',
          'Yield and pull to the right for emergency vehicles in motion. Stop for a school bus loading or unloading with red flashing lights and an extended stop arm, and respect work-zone flaggers and funeral processions.',
        ],
      },
    ],
  },

  'm6-emergencies': {
    intro:
      'Conditions change and equipment fails. This module covers adverse conditions, vehicle readiness, emergency maneuvers, and Georgia crash procedure.',
    sections: [
      {
        heading: 'Adverse conditions',
        body: [
          'Rain: slow down, increase following distance, and beware hydroplaning — worst in the first minutes of rain. If you hydroplane, ease off the accelerator and steer straight rather than braking hard.',
          'Fog: slow down and use low beams (high beams reflect back); use the right edge line as a guide. Night: outdrive your headlights — keep your stopping distance within the illuminated range. Ice forms on bridges first; use gentle inputs and far more space.',
        ],
      },
      {
        heading: 'Vehicle readiness',
        body: [
          'Pre-drive checks prevent crashes: tires (tread and pressure), brakes, lights and signals, wipers, mirrors, and fluid levels.',
          'Tire condition ties directly to traction, hydroplaning, and blowouts — maintenance is crash prevention.',
        ],
      },
      {
        heading: 'Emergency maneuvers',
        body: [
          'Skid: ease off the accelerator and steer where you want to go; avoid abrupt braking. With ABS, apply steady firm pressure and steer — do not pump.',
          'Blowout: grip the wheel firmly, do not slam the brakes, ease off the gas, hold straight, and slow gradually before pulling off.',
          'Brake failure: pump the brakes, downshift, apply the parking brake gradually, and steer to a safe runoff. Sometimes steering around a hazard is safer than braking — keep an “out.”',
        ],
      },
      {
        heading: 'If a crash occurs — Georgia procedure',
        body: [
          'Stop — leaving the scene of an injury crash is a serious offense. Secure the scene, render aid, and call 911 for injuries.',
          'Report as Georgia law requires for injury, death, or property damage at or above the statutory threshold; exchange information and cooperate with law enforcement.',
          'Document with photos and witness information, notify your insurer promptly, and move vehicles out of travel lanes when safe to prevent secondary crashes.',
        ],
      },
      {
        heading: 'Course wrap-up',
        body: [
          'The highest-payoff habits: scan far ahead, keep space, manage speed, drive unimpaired and undistracted, and always buckle up.',
          'After you pass the final exam, your certificate is generated and forwarded to the agency for your records.',
        ],
      },
    ],
  },
};

export function getModuleContent(contentRef) {
  return ddModuleContent[contentRef] || null;
}
