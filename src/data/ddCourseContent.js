// src/data/ddCourseContent.js
// Rich lesson content for the Georgia 6-Hour Defensive Driving course, keyed by
// dd_modules.content_ref.
//
// Shape:
//   { summary, sections: [ { heading, blocks: [...], quiz: [...] } ], takeaways }
// Block types: 'p' (paragraph), 'ul'/'ol' (lists), 'callout' (law|key|warn|tip).
// Each section ends with a short formative quiz (answer correctly to continue);
// the graded, server-scored knowledge check runs at the end of each module.
// quiz item: { q, choices: [{ t, correct }], explain }

export const ddModuleContent = {
  // ===================================================================== M1
  'm1-foundations': {
    summary:
      'Defensive driving is a system for saving lives, time, and money — driving to protect yourself in spite of the weather, the road, and the mistakes of everyone around you. This module builds the mindset and the repeatable hazard-management process you will use every time you drive.',
    sections: [
      {
        heading: 'Why defensive driving matters',
        blocks: [
          { type: 'p', text: 'A motor-vehicle crash is one of the most likely ways an average person will be seriously injured or killed. Crashes also carry staggering cost: medical bills, lost wages, vehicle repair, higher premiums, and personal liability that can follow you for years.' },
          { type: 'p', text: 'The most important fact in this course is that the large majority of crashes are preventable. They are not bad luck — they are the predictable result of a few high-risk behaviors: speeding, following too closely, distraction, impairment, and failure to yield. Remove those behaviors and you remove most of your risk.' },
          { type: 'callout', variant: 'key', title: 'The defensive-driving chain', text: 'Better knowledge → a better attitude behind the wheel → better behavior → fewer crashes → lower insurance costs. Everything in this course is a link in that chain.' },
        ],
        quiz: [
          { q: 'Which statement about crashes is most accurate?', choices: [
            { t: 'Most crashes are unavoidable accidents.', correct: false },
            { t: 'Most crashes are preventable and caused by a few high-risk behaviors.', correct: true },
            { t: 'Crashes are mostly caused by vehicle defects.', correct: false },
          ], explain: 'The large majority of crashes trace back to preventable behaviors — speeding, following too closely, distraction, impairment, and failure to yield.' },
        ],
      },
      {
        heading: 'Responsibility: a privilege, not a right',
        blocks: [
          { type: 'p', text: 'Driving is a privilege granted by the state and governed by law — not an absolute right. With it comes a duty of care to everyone else: other drivers, passengers, pedestrians, cyclists, and motorcyclists.' },
          { type: 'p', text: 'You cannot control what other drivers do. You can only control your own preparation, attention, and response. A defensive driver plans for other people’s mistakes in advance instead of reacting with surprise and anger.' },
          { type: 'callout', variant: 'warn', title: 'The hidden hazard: complacency', text: 'Experience can make you safer — or more dangerous. The veteran who stops actively scanning and drifts into "autopilot" is exposed to the same crash as the nervous newcomer. Treat every drive as if something could go wrong.' },
        ],
        quiz: [
          { q: 'What can you actually control while driving?', choices: [
            { t: 'The behavior of the drivers around you.', correct: false },
            { t: 'Only your own preparation, attention, and response.', correct: true },
            { t: 'The road and weather conditions.', correct: false },
          ], explain: 'You can’t control other drivers, the road, or the weather — only your own readiness and reactions. Plan for everyone else’s mistakes.' },
        ],
      },
      {
        heading: 'The collision-prevention process: SIPDE',
        blocks: [
          { type: 'p', text: 'Defensive driving is a process you run continuously. The classic model is SIPDE — practice it until it is automatic:' },
          { type: 'ol', items: [
            'Search — scan 12 to 15 seconds ahead and check mirrors every 5 to 8 seconds; keep your eyes moving.',
            'Identify — pick out fixed, moving, and potential hazards (a ball in the road means a child may follow).',
            'Predict — ask what could happen if a hazard crosses your path; assume the worst reasonable case.',
            'Decide — adjust speed, change position, or communicate (signal, brake lights, horn, headlights).',
            'Execute — act early and smoothly, and always keep an "out" — an escape path if your plan fails.',
          ] },
          { type: 'callout', variant: 'tip', title: 'Three questions, every few seconds', text: 'What can happen here? What is my plan if it does? Where is my escape route?' },
        ],
        quiz: [
          { q: 'A ball bounces into the road from between parked cars ahead. The defensive response is to:', choices: [
            { t: 'Maintain speed — the ball is no longer in your path.', correct: false },
            { t: 'Cover the brake, ease off the gas, and prepare to stop — a child may follow.', correct: true },
            { t: 'Swerve into the oncoming lane.', correct: false },
          ], explain: 'A ball is a potential hazard; the real danger is a child chasing it. Predict the worst case, slow immediately, and keep an escape path — don’t swerve blindly.' },
          { q: 'What does the "E" in SIPDE stand for?', choices: [
            { t: 'Execute — act early and smoothly, keeping an out.', correct: true },
            { t: 'Evaluate the other driver.', correct: false },
            { t: 'Exit the highway.', correct: false },
          ], explain: 'SIPDE: Search, Identify, Predict, Decide, Execute. Execute means acting early and smoothly while keeping an escape route.' },
        ],
      },
      {
        heading: "Georgia's points system and your license",
        blocks: [
          { type: 'p', text: "Georgia's Department of Driver Services (DDS) assigns points to your record when you are convicted of a moving violation. Accumulating 15 points within any 24-month period results in a license suspension." },
          { type: 'ul', items: [
            'Aggressive driving — 6 points',
            'Reckless driving — 4 points',
            'Speeding 19–23 mph over — 3 points (more the faster you go)',
            'Failure to obey a traffic-control device — 3 points',
          ] },
          { type: 'callout', variant: 'law', title: 'Georgia law: point reduction', text: 'A certified defensive driving course can reduce your record by up to 7 points, but only once every 5 years — separate from the insurance discount. Drivers under 18 and 21 face stricter thresholds.' },
        ],
        quiz: [
          { q: 'How many points within 24 months trigger a license suspension in Georgia?', choices: [
            { t: '10 points', correct: false },
            { t: '15 points', correct: true },
            { t: '20 points', correct: false },
          ], explain: 'Accumulating 15 points within any 24-month period results in suspension. A course can remove up to 7 points once every 5 years.' },
        ],
      },
    ],
    takeaways: [
      'Most crashes are preventable — they come from a few high-risk behaviors, not bad luck.',
      'You control only your own preparation and response; plan for everyone else’s mistakes.',
      'Run SIPDE continuously and always keep an "out."',
      '15 points in 24 months suspends your Georgia license; a course removes up to 7 points once every 5 years.',
    ],
  },

  // ===================================================================== M2
  'm2-human-factors': {
    summary:
      'The vehicle rarely causes the crash — the driver does. This module covers the human factors behind most collisions: how you see, where your attention goes, how fatigue and emotion degrade judgment, and the Georgia laws and countermeasures that keep those factors from killing you.',
    sections: [
      {
        heading: 'Vision: your primary driving sense',
        blocks: [
          { type: 'p', text: 'Roughly 90% of driving decisions are based on what you see. Central vision sees sharp detail; peripheral vision detects movement. At higher speeds your field of view narrows ("tunnel vision"), so you must work harder to keep scanning.' },
          { type: 'ul', items: [
            'Aim high and scan far ahead so hazards are problems you plan for, not emergencies.',
            'Check mirrors every 5–8 seconds for a live picture behind and beside you.',
            'Clear blind spots with a head check before every lane change — mirrors alone aren’t enough.',
            'Look where you want to go; your hands steer toward your eyes.',
          ] },
        ],
        quiz: [
          { q: 'Before changing lanes you should:', choices: [
            { t: 'Rely on your mirrors alone.', correct: false },
            { t: 'Do a quick head check to clear your blind spot.', correct: true },
            { t: 'Speed up so you spend less time beside other cars.', correct: false },
          ], explain: 'Mirrors leave blind spots. A quick head check before every lane change is essential.' },
        ],
      },
      {
        heading: 'Distracted driving',
        blocks: [
          { type: 'p', text: 'Distraction comes in three forms, and the most dangerous activities combine all three:' },
          { type: 'ul', items: [
            'Visual — eyes off the road.',
            'Manual — hands off the wheel.',
            'Cognitive — mind off the task.',
          ] },
          { type: 'callout', variant: 'key', title: 'Five seconds is a long way', text: 'At 55 mph a vehicle travels about 400 feet — a football field — in five seconds, roughly the length of a single glance at a phone.' },
          { type: 'callout', variant: 'law', title: "Georgia's Hands-Free Act", text: 'You may not hold or support a phone with any part of your body while driving, and may not write, send, or read texts/emails or watch/record video. Voice or single-touch hands-free use only, with stricter rules in work and school zones.' },
        ],
        quiz: [
          { q: 'You are stopped at a red light. Is it legal under Georgia’s Hands-Free law to hold your phone and send a quick text?', choices: [
            { t: 'Yes — the car is stopped.', correct: false },
            { t: 'No — you are still operating in traffic; holding the phone to text is prohibited.', correct: true },
            { t: 'Only if you finish before the light turns green.', correct: false },
          ], explain: 'The law applies whenever you are operating in traffic, including stopped at a light. Wait until you are safely parked.' },
        ],
      },
      {
        heading: 'Fatigue and drowsy driving',
        blocks: [
          { type: 'p', text: 'Drowsiness impairs reaction time, attention, and judgment much like alcohol — and a "micro-sleep" of a few seconds at highway speed can be fatal.' },
          { type: 'ul', items: [
            'Warning signs: repeated yawning, heavy eyelids, drifting, missing exits, not remembering the last few miles.',
            'What works: adequate sleep, real breaks, sharing the driving, pulling over to nap.',
            'What does NOT work: loud music, an open window, or caffeine as a substitute for sleep.',
          ] },
        ],
        quiz: [
          { q: 'The only reliable cure for drowsy driving is:', choices: [
            { t: 'Caffeine and an open window.', correct: false },
            { t: 'Loud music.', correct: false },
            { t: 'Actual sleep / rest.', correct: true },
          ], explain: 'Caffeine and fresh air only mask drowsiness briefly. Sleep is the only real fix — pull over and rest.' },
        ],
      },
      {
        heading: 'Emotions and aggressive driving',
        blocks: [
          { type: 'p', text: 'Anger, stress, and time pressure push drivers toward deliberate risk-taking: tailgating, weaving, racing lights, and "punishing" others. Georgia carries elevated penalties for aggressive driving.' },
          { type: 'callout', variant: 'warn', title: 'Do not engage road rage', text: 'If another driver is aggressive, don’t make eye contact, don’t respond, and don’t try to "win." Create space, let them go, and if threatened, drive to a populated place or call 911.' },
          { type: 'p', text: 'Manage yourself first: leave a few minutes early, build in extra following distance, breathe, and depersonalize other drivers’ mistakes.' },
        ],
        quiz: [
          { q: 'Another driver is tailgating and gesturing angrily. The safest response is to:', choices: [
            { t: 'Brake-check them to back them off.', correct: false },
            { t: 'Create space, avoid engaging, and let them pass.', correct: true },
            { t: 'Speed up to get away no matter what.', correct: false },
          ], explain: 'Never engage an aggressive driver. Make space and let them go; call 911 if you feel threatened.' },
        ],
      },
    ],
    takeaways: [
      'About 90% of driving decisions rely on vision — aim high, scan, and clear blind spots.',
      'Distraction is visual, manual, and cognitive; texting is all three. 5 seconds at 55 mph ≈ a football field.',
      "Georgia's Hands-Free Act bans holding a phone while driving — including at a red light.",
      'Only sleep fixes drowsiness; manage emotions and never engage aggressive drivers.',
    ],
  },

  // ===================================================================== M3
  'm3-impairment': {
    summary:
      'Alcohol, drugs, and even everyday medications attack the exact skills driving depends on: judgment, reaction time, coordination, and attention. This module covers how impairment works, Georgia’s DUI law, and how to plan so you never have to choose between driving and getting home.',
    sections: [
      {
        heading: 'How alcohol impairs driving',
        blocks: [
          { type: 'p', text: 'Alcohol is a central-nervous-system depressant. It slows reaction time, blurs and narrows vision, hurts coordination, and impairs judgment — so the impaired driver feels more capable exactly as they become less capable.' },
          { type: 'p', text: 'Judgment and divided attention go first, well before a person feels "drunk." That is why a driver can be genuinely impaired and still believe they are fine.' },
          { type: 'callout', variant: 'key', title: 'Only time lowers BAC', text: 'Coffee, a cold shower, fresh air, and exercise do not sober you up. The only thing that lowers blood alcohol concentration is time.' },
        ],
        quiz: [
          { q: 'What actually lowers a person’s blood alcohol concentration?', choices: [
            { t: 'Coffee and a cold shower.', correct: false },
            { t: 'Only time.', correct: true },
            { t: 'Fresh air and exercise.', correct: false },
          ], explain: 'Nothing speeds up sobering. Only time lowers BAC — and judgment is impaired before you feel drunk.' },
        ],
      },
      {
        heading: "Georgia's DUI law",
        blocks: [
          { type: 'callout', variant: 'law', title: 'Per se BAC limits in Georgia', items: [
            '0.08% — drivers age 21 and older',
            '0.04% — commercial drivers',
            '0.02% — drivers under 21 (near zero tolerance)',
          ] },
          { type: 'p', text: 'By driving in Georgia you give "implied consent" to chemical testing if lawfully arrested for DUI. Refusing the test carries its own automatic license suspension.' },
          { type: 'ul', items: [
            'Penalties can include fines, possible jail, suspension, and a state-approved Risk Reduction (DUI) Program.',
            'A DUI typically disqualifies you from the safe-driver discount and raises premiums for years.',
          ] },
        ],
        quiz: [
          { q: 'What is the per se BAC limit for a driver under 21 in Georgia?', choices: [
            { t: '0.08%', correct: false },
            { t: '0.04%', correct: false },
            { t: '0.02%', correct: true },
          ], explain: 'Georgia uses near-zero tolerance for under-21 drivers: 0.02%. It’s 0.08% for 21+ and 0.04% for commercial drivers.' },
        ],
      },
      {
        heading: 'Drugs and medications',
        blocks: [
          { type: 'p', text: '"Legal" does not mean "safe to drive." Cannabis, prescription medications, and even over-the-counter antihistamines can slow reactions and cause drowsiness. Combining any of them — or combining them with alcohol — multiplies impairment.' },
          { type: 'callout', variant: 'warn', title: 'Read the label', text: 'If a medication warns "may cause drowsiness" or "do not operate heavy machinery," that includes your car. Georgia’s DUI law covers driving while "less safe" due to any drug or combination.' },
        ],
        quiz: [
          { q: 'You took a drowsy-warning allergy medicine and had one beer. You feel fine. The safe call is to:', choices: [
            { t: 'Drive — one beer is under the limit.', correct: false },
            { t: 'Not drive — the combination can impair you and you may be "less safe" under the law.', correct: true },
            { t: 'Drink coffee, then drive.', correct: false },
          ], explain: 'Alcohol plus a sedating medication multiplies impairment, and judgment goes first. Georgia’s DUI law covers any combination that makes you less safe.' },
        ],
      },
      {
        heading: 'Prevention is a plan, not willpower',
        blocks: [
          { type: 'ul', items: [
            'Decide before you go out: a sober driver, a rideshare or transit, or staying over.',
            'Intervene — take the keys or call a ride rather than let a friend drive impaired.',
            'Do the math: a single DUI costs many thousands of dollars; a ride costs a few.',
          ] },
        ],
        quiz: [
          { q: 'The most reliable way to avoid impaired driving is to:', choices: [
            { t: 'Decide you’ll "be careful" if you drink.', correct: false },
            { t: 'Make a plan in advance — designated driver, rideshare, or staying over.', correct: true },
            { t: 'Wait an hour after your last drink.', correct: false },
          ], explain: 'Prevention is a plan made before you go out, not willpower in the moment. A ride is always cheaper than a DUI.' },
        ],
      },
    ],
    takeaways: [
      'Alcohol impairs judgment first — you feel capable as you become dangerous. Only time lowers BAC.',
      'Georgia per se limits: 0.08% (21+), 0.04% (commercial), 0.02% (under 21); refusal = suspension.',
      '"Legal" drugs and OTC meds can impair too; combining substances multiplies the effect.',
      'Prevent impaired driving with a plan made in advance.',
    ],
  },

  // ===================================================================== M4
  'm4-space-speed': {
    summary:
      'Space and speed are the two things you control that buy time to see, decide, and act. This module covers following distance, how stopping distance really works, Georgia speed law, and the high-conflict maneuvers where most crashes happen.',
    sections: [
      {
        heading: 'Managing the space around you',
        blocks: [
          { type: 'p', text: 'A defensive driver keeps a cushion on all four sides and protects the space ahead. The simplest tool is the three-second rule.' },
          { type: 'callout', variant: 'key', title: 'The 3-second following rule', text: 'Watch the vehicle ahead pass a fixed point, then count "one-one-thousand, two-one-thousand, three-one-thousand." If you reach the point first, you are too close. Three seconds is the ideal-condition minimum.' },
          { type: 'ul', items: [
            'Increase to 4+ seconds in rain, fog, darkness, heavy traffic, when towing, or when tailgated.',
            'If someone tailgates you, don’t brake-check — increase your own gap and let them pass.',
            'Keep room to the sides and an escape path; don’t sit in blind spots.',
          ] },
        ],
        quiz: [
          { q: 'In good conditions, the minimum following distance is:', choices: [
            { t: '1 second', correct: false },
            { t: '3 seconds', correct: true },
            { t: 'One car length', correct: false },
          ], explain: 'Three seconds is the ideal-condition minimum — increase to four or more in rain, dark, or heavy traffic.' },
        ],
      },
      {
        heading: 'Speed and stopping distance',
        blocks: [
          { type: 'p', text: 'Total stopping distance is more than braking. It is the sum of three parts:' },
          { type: 'ol', items: [
            'Perception distance — traveled while your brain notices the hazard.',
            'Reaction distance — traveled during the ~3/4 second it takes to hit the brake.',
            'Braking distance — traveled after the brakes engage.',
          ] },
          { type: 'callout', variant: 'warn', title: 'Speed multiplies, it does not add', text: 'Braking distance grows with the square of speed: roughly double your speed and you roughly quadruple the distance needed to stop. Crash energy rises the same way.' },
        ],
        quiz: [
          { q: 'If you roughly double your speed, braking distance:', choices: [
            { t: 'Roughly doubles.', correct: false },
            { t: 'Roughly quadruples.', correct: true },
            { t: 'Stays about the same.', correct: false },
          ], explain: 'Braking distance grows with the square of speed, so doubling speed roughly quadruples stopping distance — and crash energy.' },
        ],
      },
      {
        heading: "Georgia speed law",
        blocks: [
          { type: 'callout', variant: 'law', title: 'Basic speed rule + Super Speeder', text: 'Never drive faster than is reasonable for conditions, regardless of the posted limit. The Super Speeder law adds a $200 state fee — on top of local fines — for 75+ mph on a two-lane road or 85+ mph anywhere in Georgia.' },
          { type: 'p', text: 'School and work zones carry reduced limits and enhanced penalties. Slow down and expect children, stopped buses, and workers near traffic.' },
        ],
        quiz: [
          { q: 'Georgia’s Super Speeder fee applies at:', choices: [
            { t: '85+ mph anywhere, or 75+ on a two-lane road.', correct: true },
            { t: 'Any speed over the limit.', correct: false },
            { t: 'Only in school zones.', correct: false },
          ], explain: 'The Super Speeder law adds a $200 state fee for 85+ mph anywhere, or 75+ mph on a two-lane road — on top of local fines.' },
        ],
      },
      {
        heading: 'Intersections, passing, and lane changes',
        blocks: [
          { type: 'p', text: 'Intersections are the single highest-conflict location on the road — a large share of crashes happen there.' },
          { type: 'ul', items: [
            'Approaching, cover the brake and scan left–right–left. A green light is permission, not a guarantee — watch for red-light runners.',
            'Pass only where legal with clear sight distance; return only when you can see the passed vehicle in your mirror.',
            'Change lanes with mirror → signal → head-check → smooth move; never linger in large-vehicle "No-Zones."',
          ] },
        ],
        quiz: [
          { q: 'A light turns green as you reach an intersection. You should:', choices: [
            { t: 'Proceed immediately — you have the right of way.', correct: false },
            { t: 'Cover the brake and scan left-right-left for red-light runners before proceeding.', correct: true },
            { t: 'Accelerate hard to clear it quickly.', correct: false },
          ], explain: 'A green light is permission, not a guarantee. Cover the brake and scan for red-light runners and turning vehicles.' },
        ],
      },
    ],
    takeaways: [
      'Keep a 3-second gap — 4+ in rain, dark, heavy traffic, or when tailgated.',
      'Stopping distance = perception + reaction + braking; braking distance grows with the square of speed.',
      'Georgia: drive reasonably for conditions; Super Speeder adds $200 for 75+ (two-lane) or 85+ mph.',
      'Treat intersections as the highest-risk zones: cover the brake and never trust a green blindly.',
    ],
  },

  // ===================================================================== M5
  'm5-sharing-road': {
    summary:
      'Roads are shared by people in very different vehicles and on foot. Driving predictably and yielding correctly prevents conflict. This module covers right-of-way, occupant protection, vulnerable road users, and Georgia’s special-vehicle laws.',
    sections: [
      {
        heading: 'Right-of-way: give it, don’t take it',
        blocks: [
          { type: 'p', text: 'Right-of-way is what the law tells you about when to yield — it is never something you "have" the right to seize. When in doubt, give way; being right is no comfort after a crash.' },
          { type: 'ul', items: [
            'Four-way stop: first to stop goes first; if two stop together, the one on the right goes first.',
            'Turning left across oncoming traffic: yield to oncoming vehicles and to pedestrians.',
            'Roundabouts: yield to traffic already in the circle, then enter on a gap.',
          ] },
        ],
        quiz: [
          { q: 'At a four-way stop, two cars arrive at the same time. Who goes first?', choices: [
            { t: 'The faster car.', correct: false },
            { t: 'The car on the right.', correct: true },
            { t: 'The larger vehicle.', correct: false },
          ], explain: 'When two vehicles stop together at a four-way stop, the one on the right has the right-of-way.' },
        ],
      },
      {
        heading: 'Occupant protection',
        blocks: [
          { type: 'p', text: 'Seat belts are the single most effective way to survive a crash, and Georgia law requires them. The lap belt rides low across the hips and the shoulder belt crosses the chest.' },
          { type: 'callout', variant: 'key', title: 'Belts and airbags work together', text: 'Airbags supplement seat belts — they do not replace them. An unbelted occupant can be injured by the airbag or thrown from the vehicle.' },
          { type: 'callout', variant: 'law', title: 'Children in Georgia', text: 'Children must be restrained for age and size — car seat, then booster until an adult belt fits. Children under 13 are safest in the back seat.' },
        ],
        quiz: [
          { q: 'How do airbags and seat belts relate?', choices: [
            { t: 'Airbags replace the need for seat belts.', correct: false },
            { t: 'Airbags supplement seat belts; you still must buckle up.', correct: true },
            { t: 'You should not wear a belt in a car with airbags.', correct: false },
          ], explain: 'Airbags supplement belts. Unbelted, you can be hurt by the airbag itself or ejected. Always buckle up.' },
        ],
      },
      {
        heading: 'Vulnerable road users',
        blocks: [
          { type: 'p', text: 'Pedestrians, cyclists, and motorcyclists have little protection, are harder to see, and their speed is harder to judge — give them extra margin.' },
          { type: 'ul', items: [
            'Pedestrians: yield in crosswalks; slow near schools, transit stops, and at night.',
            'Cyclists: treat as vehicles; pass with a safe buffer; check before turning right.',
            'Motorcyclists: allow a full lane, double-check blind spots, and don’t tailgate.',
            'Trucks and buses: huge blind spots ("No-Zones"), wide turns, long stopping distances.',
          ] },
        ],
        quiz: [
          { q: 'When following or passing a motorcycle you should:', choices: [
            { t: 'Share the lane to save space.', correct: false },
            { t: 'Allow a full lane and double-check blind spots.', correct: true },
            { t: 'Follow closely since bikes stop slowly.', correct: false },
          ], explain: 'Motorcycles are entitled to a full lane, are hard to see, and can stop quickly — give them room and check blind spots.' },
        ],
      },
      {
        heading: 'Georgia’s special-vehicle laws',
        blocks: [
          { type: 'callout', variant: 'law', title: 'Move Over law', text: 'When passing a stationary emergency, law-enforcement, utility, or recovery vehicle with flashing lights, move over one lane if you safely can. If you can’t, slow below the speed limit and be ready to stop.' },
          { type: 'ul', items: [
            'Emergency vehicles in motion with lights/siren: yield and pull to the right, then stop.',
            'School bus with red flashing lights and stop arm: stop and stay stopped until it withdraws.',
            'Work zones and funeral processions: obey flaggers, slow down, give room.',
          ] },
        ],
        quiz: [
          { q: 'On a two-lane road a school bus stops with red lights flashing and stop arm out. You must:', choices: [
            { t: 'Slow and pass carefully on the left.', correct: false },
            { t: 'Stop and remain stopped until the lights stop and the arm withdraws.', correct: true },
            { t: 'Proceed if no children are visible.', correct: false },
          ], explain: 'On a two-lane road, traffic both directions must stop for a loading/unloading school bus and stay stopped until the stop arm is withdrawn.' },
        ],
      },
    ],
    takeaways: [
      'Yield generously — right-of-way is given, not taken.',
      'Always buckle up; airbags supplement belts. Children under 13 ride in back, properly restrained.',
      'Give pedestrians, cyclists, and motorcyclists extra space; respect large-vehicle No-Zones.',
      'Georgia: Move Over for stationary responders, stop for school buses, yield to emergency vehicles.',
    ],
  },

  // ===================================================================== M6
  'm6-emergencies': {
    summary:
      'Conditions change, equipment fails, and sometimes a crash is unavoidable. This module covers driving in adverse conditions, keeping your vehicle road-ready, handling emergencies, and exactly what Georgia law requires if a crash occurs.',
    sections: [
      {
        heading: 'Adverse conditions',
        blocks: [
          { type: 'p', text: 'Most bad-weather crashes come from driving the same way you would on a clear, dry day. Slow down and increase your following distance before you need it.' },
          { type: 'ul', items: [
            'Rain: the first few minutes are most dangerous as oil lifts off the pavement; beware hydroplaning.',
            'Fog: slow down and use low beams — high beams reflect back. Use the right edge line as a guide.',
            'Night: "outdrive your headlights" — keep speed low enough to stop within what you can see.',
            'Ice: bridges freeze first; use gentle inputs and far more space.',
          ] },
          { type: 'callout', variant: 'tip', title: 'If you hydroplane', text: 'Don’t brake hard or jerk the wheel. Ease off the accelerator, keep the wheel straight, and let the tires regain grip.' },
        ],
        quiz: [
          { q: 'Your car begins to hydroplane in the rain. You should:', choices: [
            { t: 'Brake hard immediately.', correct: false },
            { t: 'Ease off the gas, keep the wheel straight, and let the tires regain grip.', correct: true },
            { t: 'Jerk the wheel to find traction.', correct: false },
          ], explain: 'Hard braking or sudden steering can cause a skid. Ease off the accelerator and hold straight until the tires regain contact.' },
        ],
      },
      {
        heading: 'Keep your vehicle road-ready',
        blocks: [
          { type: 'p', text: 'Maintenance is crash prevention. A quick habit of checks prevents the failures that cause emergencies.' },
          { type: 'ul', items: [
            'Tires: correct pressure and adequate tread — they drive traction and blowout risk.',
            'Brakes: address new noise, pulling, or a soft pedal immediately.',
            'Lights and signals: so you can see, be seen, and communicate.',
            'Wipers, mirrors, and fluids: small items that fail at the worst moment.',
          ] },
        ],
        quiz: [
          { q: 'Which best describes vehicle maintenance?', choices: [
            { t: 'A cost unrelated to safety.', correct: false },
            { t: 'A form of crash prevention.', correct: true },
            { t: 'Only necessary before long trips.', correct: false },
          ], explain: 'Tires, brakes, lights, and wipers directly affect traction, stopping, and visibility — maintenance prevents crashes.' },
        ],
      },
      {
        heading: 'Handling emergencies',
        blocks: [
          { type: 'ul', items: [
            'Skid: ease off the accelerator and steer where you want to go; don’t slam the brakes. With ABS, apply firm steady pressure and steer — don’t pump.',
            'Tire blowout: grip the wheel, do NOT brake hard, ease off the gas, hold straight, then slow gradually and pull off.',
            'Brake failure: pump the pedal, downshift, apply the parking brake gradually, and steer toward a safe runoff.',
          ] },
          { type: 'callout', variant: 'key', title: 'Sometimes steering beats braking', text: 'At higher speeds you can often steer around a hazard in less distance than you could stop — which is why keeping an "out" matters.' },
        ],
        quiz: [
          { q: 'A front tire blows out at highway speed and the car pulls hard. First you should:', choices: [
            { t: 'Brake hard to stop as fast as possible.', correct: false },
            { t: 'Hold the wheel firmly, ease off the gas, keep straight, and slow gradually.', correct: true },
            { t: 'Steer sharply onto the shoulder right away.', correct: false },
          ], explain: 'Hard braking or a sharp steer during a blowout can cause a spin or rollover. Grip the wheel, ease off, hold straight, slow gradually.' },
        ],
      },
      {
        heading: 'If a crash occurs — Georgia procedure',
        blocks: [
          { type: 'ol', items: [
            'Stop. Leaving the scene of an injury crash is a serious crime. Pull over safely and turn on hazards.',
            'Protect and aid. Secure the scene, check for injuries, and call 911 for any injury.',
            'Report and exchange. Georgia requires reporting injury, death, or property damage at or above the statutory threshold; exchange info and cooperate with police.',
            'Document and notify. Photograph the scene, collect witness info, notify your insurer, and clear travel lanes when safe.',
          ] },
          { type: 'p', text: 'The habits that prevent the most crashes are simple: scan far ahead, keep space, manage speed for conditions, drive unimpaired and undistracted, share the road, and always buckle up.' },
        ],
        quiz: [
          { q: 'What is your first legal obligation after a crash involving injury?', choices: [
            { t: 'Leave to avoid blocking traffic.', correct: false },
            { t: 'Stop, secure the scene, render aid, and call 911.', correct: true },
            { t: 'Post about it before anything else.', correct: false },
          ], explain: 'Leaving the scene of an injury crash is a serious crime. Stop, secure the scene, aid the injured, and call 911.' },
        ],
      },
    ],
    takeaways: [
      'Slow down and add space in rain, fog, dark, and ice; ease off — don’t brake — if you hydroplane.',
      'Maintain tires, brakes, lights, and wipers — maintenance is crash prevention.',
      'Skid/blowout: don’t brake hard — steer where you want to go and slow gradually; keep an "out."',
      'After a crash in Georgia: stop, aid, report/exchange, document, and notify your insurer.',
    ],
  },
};

export function getModuleContent(contentRef) {
  return ddModuleContent[contentRef] || null;
}
