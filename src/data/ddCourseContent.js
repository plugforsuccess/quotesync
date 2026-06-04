// src/data/ddCourseContent.js
// Rich lesson content for the Georgia 6-Hour Defensive Driving course, keyed by
// dd_modules.content_ref. Each module is a list of typed blocks rendered by the
// lesson reader, plus an interactive scenario check and key takeaways.
//
// Block types: 'h' (section heading), 'p' (paragraph), 'ul'/'ol' (lists),
// 'callout' (variant: law | key | warn | tip), 'scenario' (formative self-check).

export const ddModuleContent = {
  // ===================================================================== M1
  'm1-foundations': {
    minutes: 55,
    summary:
      'Defensive driving is a system for saving lives, time, and money — driving to protect yourself in spite of the weather, the road, and the mistakes of everyone around you. This module builds the mindset and the repeatable hazard-management process you will use for the rest of the course and every time you drive.',
    blocks: [
      { type: 'h', text: 'Why defensive driving matters' },
      { type: 'p', text: 'A motor-vehicle crash is one of the most likely ways an average person will be seriously injured or killed. Crashes also carry staggering financial cost: medical bills, lost wages, vehicle repair, higher insurance premiums, and personal liability that can follow you for years.' },
      { type: 'p', text: 'The most important fact in this entire course is that the large majority of crashes are preventable. They are not "accidents" in the sense of bad luck — they are the predictable result of a small number of high-risk behaviors: speeding, following too closely, distraction, impairment, and failure to yield. Remove those behaviors and you remove most of your risk.' },
      {
        type: 'callout', variant: 'key', title: 'The defensive-driving chain',
        text: 'Better knowledge → a better attitude behind the wheel → better behavior → fewer crashes → lower insurance costs. Everything in this course is a link in that chain.',
      },

      { type: 'h', text: 'Responsibility: a privilege, not a right' },
      { type: 'p', text: 'Driving is a privilege granted by the state and governed by law — not an absolute right. With that privilege comes a duty of care to everyone else on the road: other drivers, passengers, pedestrians, cyclists, and motorcyclists.' },
      { type: 'p', text: 'You cannot control what other drivers do. You can only control your own preparation, attention, and response. A defensive driver accepts that other people will make mistakes and plans for them in advance, rather than reacting with surprise and anger.' },
      {
        type: 'callout', variant: 'warn', title: 'The hidden hazard: complacency',
        text: 'Experience can make you safer — or more dangerous. The veteran driver who stops actively scanning, drifts into "autopilot," and assumes nothing will go wrong is exposed to exactly the same crash as the nervous newcomer. Treat every drive as if something could go wrong, because eventually it will.',
      },

      { type: 'h', text: 'The collision-prevention process: SIPDE' },
      { type: 'p', text: 'Defensive driving is not a feeling — it is a process you run continuously. The classic model is SIPDE. Practice it until it becomes automatic:' },
      {
        type: 'ol', items: [
          'Search — scan aggressively 12 to 15 seconds ahead (about a block in town, a quarter-mile on the highway) and check your mirrors every 5 to 8 seconds. Keep your eyes moving; never lock a fixed stare.',
          'Identify — pick out hazards: fixed (signs, curves, intersections), moving (vehicles, pedestrians), and potential (a ball rolling into the street means a child may follow).',
          'Predict — ask what could happen if a hazard and your path cross. Assume the worst reasonable case.',
          'Decide — choose an action: adjust speed, change position in your lane or lane choice, or communicate (signal, brake lights, horn, headlights).',
          'Execute — act early and smoothly, and always keep an "out" — an escape path you could take if your first plan fails.',
        ],
      },
      {
        type: 'callout', variant: 'tip', title: 'Three questions, every few seconds',
        text: 'What can happen here? What is my plan if it does? Where is my escape route? If you can always answer those three questions, you are driving defensively.',
      },

      {
        type: 'scenario',
        q: 'You are driving down a residential street at the speed limit. A ball bounces into the road from between two parked cars about 100 feet ahead. What is the defensive response?',
        choices: [
          { t: 'Maintain speed — the ball is not in your path anymore.', correct: false },
          { t: 'Cover the brake, ease off the gas, and prepare to stop — a child may run out after it.', correct: true },
          { t: 'Swerve into the oncoming lane to give the ball room.', correct: false },
        ],
        explain: 'A ball is a "potential hazard." The real danger is the child who may chase it. Predict the worst reasonable case, slow immediately, and keep an escape path — do not swerve blindly into oncoming traffic.',
      },

      { type: 'h', text: "Georgia's points system and your license" },
      { type: 'p', text: "Georgia's Department of Driver Services (DDS) assigns points to your driving record when you are convicted of a moving violation. Accumulating 15 points within any 24-month period results in a license suspension." },
      {
        type: 'ul', items: [
          'Aggressive driving — 6 points',
          'Reckless driving — 4 points',
          'Speeding 19–23 mph over the limit — 3 points (rising to 4–6 points the faster you go)',
          'Failure to obey a traffic-control device or officer — 3 points',
          'Too fast for conditions — 0 points but still a conviction and an insurer red flag',
        ],
      },
      {
        type: 'callout', variant: 'law', title: 'Georgia law: point reduction',
        text: 'Completing a certified defensive driving course can reduce your record by up to 7 points, but only once every 5 years. That is separate from the insurance premium discount this course is built to support. Drivers under 18 and under 21 face stricter point thresholds and added penalties.',
      },
    ],
    takeaways: [
      'Most crashes are preventable — they come from a few high-risk behaviors, not bad luck.',
      'You control only your own preparation and response; plan for everyone else’s mistakes.',
      'Run SIPDE continuously: Search, Identify, Predict, Decide, Execute — and always keep an out.',
      'In Georgia, 15 points in 24 months suspends your license; a course can remove up to 7 points once every 5 years.',
    ],
  },

  // ===================================================================== M2
  'm2-human-factors': {
    minutes: 60,
    summary:
      'The vehicle rarely causes the crash — the driver does. This module covers the human factors behind most collisions: how you see, where your attention goes, how fatigue and emotion degrade judgment, and the specific countermeasures (and Georgia laws) that keep those factors from killing you.',
    blocks: [
      { type: 'h', text: 'Vision: your primary driving sense' },
      { type: 'p', text: 'Roughly 90% of the decisions you make while driving are based on what you see. Your central vision sees sharp detail (signs, brake lights); your peripheral vision detects movement (a car drifting, a pedestrian stepping off a curb). At higher speeds your effective field of view narrows — "tunnel vision" — so you must work harder to keep scanning.' },
      {
        type: 'ul', items: [
          'Aim high and scan far ahead so hazards are problems you plan for, not emergencies you react to.',
          'Check mirrors every 5–8 seconds to keep a live picture of what is behind and beside you.',
          'Clear your blind spots with a quick head check before every lane change — mirrors alone are not enough.',
          'Look where you want to go: your hands tend to steer toward your eyes (target fixation).',
        ],
      },

      { type: 'h', text: 'Distracted driving' },
      { type: 'p', text: 'Distraction comes in three forms, and the most dangerous activities combine all three:' },
      {
        type: 'ul', items: [
          'Visual — eyes off the road (reading a text, looking at a screen or a crash).',
          'Manual — hands off the wheel (eating, reaching, holding a phone).',
          'Cognitive — mind off the task (a heavy conversation, daydreaming).',
        ],
      },
      {
        type: 'callout', variant: 'key', title: 'Five seconds is a long way',
        text: 'At 55 mph a vehicle travels about the length of a football field — roughly 400 feet — in five seconds. That is about how long a single glance at a phone takes. You would never drive the length of a field with your eyes closed; texting is the same thing.',
      },
      {
        type: 'callout', variant: 'law', title: "Georgia's Hands-Free Act",
        text: 'It is illegal to hold or support a phone with any part of your body while driving. You may not write, send, or read texts or emails; you may not watch or record video. Voice-to-text and a single touch to start/stop a call are allowed only hands-free, with stricter rules in work and school zones.',
      },
      {
        type: 'scenario',
        q: 'You are stopped at a red light and pick up your phone to send a quick text. Is this allowed under Georgia’s Hands-Free law?',
        choices: [
          { t: 'Yes — the car is stopped, so it is safe and legal.', correct: false },
          { t: 'No — you are still "driving" in traffic; holding the phone to text is prohibited.', correct: true },
          { t: 'Only if you finish before the light turns green.', correct: false },
        ],
        explain: 'The law applies whenever you are operating a vehicle on the road, including stopped at lights and in traffic. Being stationary at a signal does not make it legal to hold and text. Wait until you are safely parked.',
      },

      { type: 'h', text: 'Fatigue and drowsy driving' },
      { type: 'p', text: 'Drowsiness impairs reaction time, attention, and judgment in much the same way alcohol does. The danger is that you often cannot tell how impaired you are — and a "micro-sleep" of just a few seconds at highway speed can be fatal.' },
      {
        type: 'ul', items: [
          'Warning signs: repeated yawning, heavy eyelids, drifting from your lane, missing exits or signs, not remembering the last few miles.',
          'What works: get adequate sleep before a long trip, take real breaks, share the driving, and pull over to nap when needed.',
          'What does NOT work: loud music, opening a window, or caffeine as a substitute for sleep. They mask drowsiness for minutes, not hours.',
        ],
      },

      { type: 'h', text: 'Emotions and aggressive driving' },
      { type: 'p', text: 'Anger, stress, and time pressure are among the most common contributors to serious crashes because they push drivers toward deliberate risk-taking: tailgating, weaving, racing lights, and "punishing" other drivers.' },
      {
        type: 'callout', variant: 'warn', title: 'Do not engage road rage',
        text: 'If another driver is aggressive, do not make eye contact, do not respond, and do not try to "win." Create space, let them go, and if you feel threatened, drive to a populated place or call 911. No commute is worth a confrontation.',
      },
      { type: 'p', text: 'Manage yourself first: leave a few minutes early so you are not racing the clock, build in extra following distance, breathe, and depersonalize other drivers’ mistakes — they are almost never about you.' },
    ],
    takeaways: [
      'About 90% of driving decisions rely on vision — aim high, keep scanning, and check blind spots.',
      'Distraction is visual, manual, and cognitive; texting is all three. At 55 mph, 5 seconds ≈ a football field.',
      "Georgia's Hands-Free Act bans holding a phone while driving — including stopped at a light.",
      'Drowsiness impairs you like alcohol; only sleep fixes it. Manage emotions and never engage aggressive drivers.',
    ],
  },

  // ===================================================================== M3
  'm3-impairment': {
    minutes: 55,
    summary:
      'Alcohol, drugs, and even some everyday medications attack the exact skills driving depends on: judgment, reaction time, coordination, and attention. This module covers how impairment works, Georgia’s DUI law, and how to plan so you never have to choose between driving and getting home.',
    blocks: [
      { type: 'h', text: 'How alcohol impairs driving' },
      { type: 'p', text: 'Alcohol is a central-nervous-system depressant. It slows reaction time, blurs and narrows vision, hurts coordination and balance, and — most dangerously — impairs judgment, so the impaired driver feels more capable exactly as they become less capable.' },
      { type: 'p', text: 'Judgment and divided attention are the first things to go, well before a person feels "drunk." That is why a driver can be genuinely impaired and still believe they are fine to drive.' },
      {
        type: 'callout', variant: 'key', title: 'Only time lowers BAC',
        text: 'Blood alcohol concentration depends on how much you drank, over how long, your body weight, and whether you ate — but nothing speeds up sobering up. Coffee, a cold shower, fresh air, and exercise do not work. The only thing that lowers BAC is time.',
      },

      { type: 'h', text: "Georgia's DUI law" },
      {
        type: 'callout', variant: 'law', title: 'Per se BAC limits in Georgia',
        items: [
          '0.08% — drivers age 21 and older',
          '0.04% — commercial drivers',
          '0.02% — drivers under 21 (Georgia’s near-zero-tolerance limit)',
        ],
      },
      { type: 'p', text: 'By driving in Georgia you give "implied consent" to chemical testing if lawfully arrested for DUI. Refusing the test carries its own automatic license suspension, on top of any DUI penalties.' },
      {
        type: 'ul', items: [
          'Penalties can include fines, possible jail, license suspension, and a state-approved Risk Reduction (DUI) Program.',
          'Repeat offenses add ignition-interlock requirements and far harsher penalties.',
          'A DUI typically disqualifies you from the safe-driver insurance discount and raises premiums for years.',
        ],
      },

      { type: 'h', text: 'Drugs and medications' },
      { type: 'p', text: '"Legal" does not mean "safe to drive." Cannabis, prescription medications (opioids, sedatives, some anxiety and sleep aids), and even over-the-counter antihistamines can slow reactions and cause drowsiness. Combining any of them — or combining them with alcohol — multiplies the impairment.' },
      {
        type: 'callout', variant: 'warn', title: 'Read the label',
        text: 'If a medication warns "may cause drowsiness" or "do not operate heavy machinery," that includes your car. Georgia’s DUI law covers driving while "less safe" due to any drug or combination — not just illegal ones.',
      },
      {
        type: 'scenario',
        q: 'You took an allergy medication that says "may cause drowsiness" and had one beer two hours ago. You feel okay. What is the safe call?',
        choices: [
          { t: 'Drive — one beer is under the limit and you feel fine.', correct: false },
          { t: 'Do not drive — the medication and alcohol can combine to impair you, and you may be "less safe" under the law.', correct: true },
          { t: 'Drink a coffee first, then drive.', correct: false },
        ],
        explain: 'Alcohol plus a sedating medication multiplies impairment, and feeling "okay" is unreliable because judgment goes first. Georgia’s DUI law covers any combination that makes you a less-safe driver. Arrange another ride.',
      },

      { type: 'h', text: 'Prevention is a plan, not willpower' },
      {
        type: 'ul', items: [
          'Decide before you go out: designate a sober driver, plan a rideshare or transit, or arrange to stay over.',
          'Intervene — take the keys, call a ride, or let a friend sleep it off rather than let them drive impaired.',
          'Do the math: a single DUI (legal fees, fines, insurance increases, lost time) costs many thousands of dollars. A ride home costs a few.',
        ],
      },
    ],
    takeaways: [
      'Alcohol impairs judgment first — you feel capable as you become dangerous. Only time lowers BAC.',
      'Georgia per se limits: 0.08% (21+), 0.04% (commercial), 0.02% (under 21); implied consent means refusal = suspension.',
      '"Legal" drugs and OTC meds can impair too; combining substances multiplies the effect.',
      'Prevent impaired driving with a plan made in advance — a ride is always cheaper than a DUI.',
    ],
  },

  // ===================================================================== M4
  'm4-space-speed': {
    minutes: 65,
    summary:
      'Space and speed are the two things you control that buy you time to see, decide, and act. This module covers following distance, how stopping distance really works, Georgia speed law, and the high-conflict maneuvers — intersections, passing, lane changes — where most crashes happen.',
    blocks: [
      { type: 'h', text: 'Managing the space around you' },
      { type: 'p', text: 'A defensive driver manages a cushion of space on all four sides of the vehicle, and protects the one that matters most: the space ahead. The simplest tool is the three-second rule.' },
      {
        type: 'callout', variant: 'key', title: 'The 3-second following rule',
        text: 'Watch the vehicle ahead pass a fixed point (a sign, a shadow). Then count "one-one-thousand, two-one-thousand, three-one-thousand." If you reach the point before you finish, you are too close. Three seconds is the minimum in ideal conditions.',
      },
      {
        type: 'ul', items: [
          'Increase to 4+ seconds in rain, fog, or darkness, in heavy traffic, when towing, or when being tailgated.',
          'If someone tailgates you, do not brake-check them. Increase your own following distance and let them pass.',
          'Leave yourself room to the sides and an escape path — don’t drive in packs or sit in others’ blind spots.',
        ],
      },

      { type: 'h', text: 'Speed and stopping distance' },
      { type: 'p', text: 'Total stopping distance is more than just braking. It is the sum of three parts:' },
      {
        type: 'ol', items: [
          'Perception distance — how far you travel while your brain notices the hazard.',
          'Reaction distance — how far you travel during the ~3/4 second it takes to move your foot to the brake.',
          'Braking distance — how far the vehicle travels after the brakes engage.',
        ],
      },
      {
        type: 'callout', variant: 'warn', title: 'Speed multiplies, it does not add',
        text: 'Braking distance grows with the square of speed: roughly double your speed and you roughly quadruple the distance needed to stop. The energy in a crash rises the same way — which is why a small increase in speed produces a large increase in both stopping distance and crash severity.',
      },

      { type: 'h', text: 'Georgia speed law' },
      {
        type: 'callout', variant: 'law', title: 'Basic speed rule + Super Speeder',
        text: 'Georgia’s basic rule: never drive faster than is reasonable and prudent for conditions, regardless of the posted limit. Separately, the Super Speeder law adds a $200 state fee — on top of local fines — for driving 75+ mph on a two-lane road or 85+ mph anywhere in the state. Failing to pay it leads to suspension and a reinstatement fee.',
      },
      { type: 'p', text: 'School zones and work zones carry reduced limits and enhanced penalties. Slow down and expect the unexpected: children, stopped buses, and workers feet from traffic.' },

      {
        type: 'scenario',
        q: 'It is raining and traffic is heavy. The car ahead is the same one you have been following. What following distance should you keep?',
        choices: [
          { t: 'The usual 3 seconds — the rule does not change.', correct: false },
          { t: 'At least 4 or more seconds — rain and heavy traffic both call for extra space.', correct: true },
          { t: 'Less than 3 seconds so other cars do not cut in.', correct: false },
        ],
        explain: 'Three seconds is only the ideal-condition minimum. Rain reduces traction and visibility, and heavy traffic reduces your escape options, so you extend the cushion to four seconds or more.',
      },

      { type: 'h', text: 'Intersections, passing, and lane changes' },
      { type: 'p', text: 'Intersections are the single highest-conflict location on the road — a large share of crashes happen there.' },
      {
        type: 'ul', items: [
          'Approaching an intersection, cover the brake and scan left–right–left. A green light is permission, not a guarantee — watch for red-light runners and drivers misjudging left-turn gaps.',
          'Pass only where it is legal and you have clear sight distance: signal, check your blind spot, and return only when you can see the passed vehicle in your mirror.',
          'Change lanes with a sequence: mirror → signal → head-check → smooth move. Never linger in a large vehicle’s blind spots ("No-Zones").',
        ],
      },
    ],
    takeaways: [
      'Keep at least a 3-second following gap — 4+ seconds in rain, dark, heavy traffic, or when tailgated.',
      'Stopping distance = perception + reaction + braking; braking distance grows with the square of speed.',
      'Georgia: drive reasonably for conditions; Super Speeder adds $200 for 75+ (two-lane) or 85+ mph.',
      'Treat intersections as the highest-risk zones: cover the brake, scan left-right-left, and never trust a green blindly.',
    ],
  },

  // ===================================================================== M5
  'm5-sharing-road': {
    minutes: 55,
    summary:
      'Roads are shared by people in very different vehicles and on foot. Driving predictably and giving way correctly prevents conflict. This module covers right-of-way, occupant protection, vulnerable road users, and Georgia’s special-vehicle laws — Move Over, school buses, and emergency vehicles.',
    blocks: [
      { type: 'h', text: 'Right-of-way: give it, don’t take it' },
      { type: 'p', text: 'Right-of-way is something the law tells you when to yield — it is never something you "have" the right to seize. The defensive habit is to give way whenever there is doubt, because being right is no comfort after a crash.' },
      {
        type: 'ul', items: [
          'Four-way stop: the first vehicle to stop goes first; if two stop together, the one on the right goes first.',
          'Turning left across oncoming traffic: yield to oncoming vehicles and to pedestrians in the crosswalk.',
          'Roundabouts: yield to traffic already in the circle, then enter when there is a gap.',
        ],
      },

      { type: 'h', text: 'Occupant protection' },
      { type: 'p', text: 'Seat belts are the single most effective way to survive a crash, and Georgia law requires them. Worn correctly, the lap belt rides low across the hips (not the stomach) and the shoulder belt crosses the chest and collarbone.' },
      {
        type: 'callout', variant: 'key', title: 'Belts and airbags work together',
        text: 'Airbags supplement seat belts — they do not replace them. An unbelted occupant can be injured by the airbag itself or thrown from the vehicle. Always buckle up, every seat, every trip.',
      },
      {
        type: 'callout', variant: 'law', title: 'Children in Georgia',
        text: 'Children must be properly restrained for their age and size — generally in a car seat, then a booster until an adult belt fits correctly. Children under 13 are safest in the back seat, away from front airbags.',
      },

      { type: 'h', text: 'Vulnerable road users' },
      { type: 'p', text: 'Pedestrians, cyclists, and motorcyclists have little or no protection in a crash, are harder to see, and their speed is harder to judge. They deserve extra margin.' },
      {
        type: 'ul', items: [
          'Pedestrians: yield in crosswalks; slow near schools, transit stops, and at night. Make eye contact when you can.',
          'Cyclists: treat them as vehicles, pass with a safe lateral buffer, and check for them before turning right or opening a door.',
          'Motorcyclists: allow them a full lane, double-check blind spots, and never tailgate — they can stop very quickly.',
          'Large trucks and buses: they have huge blind spots ("No-Zones"), make wide turns, and need much longer to stop. Don’t cut in front or linger alongside.',
        ],
      },

      {
        type: 'scenario',
        q: 'You approach a stopped school bus on a two-lane road with its red lights flashing and stop arm extended. What must you do?',
        choices: [
          { t: 'Slow down and pass carefully on the left.', correct: false },
          { t: 'Stop and remain stopped until the lights stop flashing and the stop arm is withdrawn.', correct: true },
          { t: 'Proceed if no children are visible.', correct: false },
        ],
        explain: 'On a two-lane road, traffic in both directions must stop for a school bus loading or unloading with red flashing lights and an extended stop arm, and stay stopped until it is withdrawn. Children may cross unexpectedly.',
      },

      { type: 'h', text: 'Georgia’s special-vehicle laws' },
      {
        type: 'callout', variant: 'law', title: 'Move Over law',
        text: 'When passing a stationary emergency, law-enforcement, utility, or recovery vehicle displaying flashing lights, you must move over one lane away if you can do so safely. If you cannot move over, slow below the speed limit and be prepared to stop.',
      },
      {
        type: 'ul', items: [
          'Emergency vehicles in motion with lights/siren: yield and pull to the right edge, then stop until they pass.',
          'School buses: stop as described above; resume only when safe.',
          'Work zones and funeral processions: obey flaggers, slow down, and give room.',
        ],
      },
    ],
    takeaways: [
      'Yield generously — right-of-way is given, not taken; when in doubt, let the other party go.',
      'Always buckle up; airbags supplement belts. Children belong properly restrained, under 13 in the back.',
      'Give pedestrians, cyclists, and motorcyclists extra space; respect large-vehicle No-Zones.',
      'Georgia: Move Over for stationary responders, stop for school buses, and yield to emergency vehicles.',
    ],
  },

  // ===================================================================== M6
  'm6-emergencies': {
    minutes: 60,
    summary:
      'Conditions change, equipment fails, and sometimes a crash is unavoidable. This module covers driving in adverse conditions, keeping your vehicle road-ready, handling emergencies like skids and blowouts, and exactly what Georgia law requires you to do if a crash occurs.',
    blocks: [
      { type: 'h', text: 'Adverse conditions' },
      { type: 'p', text: 'Most bad-weather crashes come from driving the same way you would on a clear, dry day. Slow down, increase your following distance, and increase your following margin before you need it.' },
      {
        type: 'ul', items: [
          'Rain: the first few minutes are the most dangerous as oil lifts off the pavement. Beware hydroplaning, when tires ride on water and lose contact with the road.',
          'Fog: slow down and use low beams — high beams reflect back and reduce visibility. Use the right edge line as a guide.',
          'Night: "outdrive your headlights" means keeping your speed low enough to stop within the distance you can see.',
          'Ice: bridges and overpasses freeze first. Use gentle steering, gas, and brake inputs, and leave dramatically more space.',
        ],
      },
      {
        type: 'callout', variant: 'tip', title: 'If you hydroplane',
        text: 'Do not brake hard or jerk the wheel. Ease off the accelerator, keep the wheel steady and pointed straight, and let the tires slow until they regain grip.',
      },

      { type: 'h', text: 'Keep your vehicle road-ready' },
      { type: 'p', text: 'Maintenance is crash prevention. A quick habit of checks prevents the failures that cause emergencies in the first place.' },
      {
        type: 'ul', items: [
          'Tires: correct pressure and adequate tread — they drive traction, hydroplaning resistance, and blowout risk.',
          'Brakes: address any new noise, pulling, or a soft pedal immediately.',
          'Lights and signals: so you can see and be seen and communicate your intentions.',
          'Wipers, mirrors, and fluids: small items that fail at the worst possible moment.',
        ],
      },

      { type: 'h', text: 'Handling emergencies' },
      {
        type: 'ul', items: [
          'Skid: ease off the accelerator and steer where you want to go; avoid slamming the brakes. With anti-lock brakes (ABS), apply firm, steady pressure and steer — do not pump.',
          'Tire blowout: grip the wheel firmly, do NOT brake hard, ease off the gas, hold a straight path, then slow gradually and pull off the road.',
          'Brake failure: pump the pedal, downshift to slow the engine, apply the parking brake gradually, and steer toward a safe runoff.',
        ],
      },
      {
        type: 'callout', variant: 'key', title: 'Sometimes steering beats braking',
        text: 'At higher speeds you can often steer around a hazard in less distance than you could stop. This is why keeping an "out" — an open escape path — is a core defensive habit.',
      },

      {
        type: 'scenario',
        q: 'A front tire blows out at highway speed and the car pulls hard to one side. What should you do first?',
        choices: [
          { t: 'Brake hard immediately to stop as fast as possible.', correct: false },
          { t: 'Hold the wheel firmly, ease off the gas, keep straight, and slow gradually before pulling off.', correct: true },
          { t: 'Steer sharply toward the shoulder right away.', correct: false },
        ],
        explain: 'Hard braking or a sharp steer during a blowout can cause a spin or rollover. Grip the wheel, ease off the accelerator, keep the vehicle straight, and let it slow before easing onto the shoulder.',
      },

      { type: 'h', text: 'If a crash occurs — Georgia procedure' },
      {
        type: 'ol', items: [
          'Stop. Leaving the scene of a crash involving injury is a serious crime. Pull over safely and turn on hazards.',
          'Protect and aid. Secure the scene, check for injuries, and call 911 for any injury.',
          'Report and exchange. Georgia law requires reporting crashes involving injury, death, or property damage at or above the statutory threshold; exchange information and cooperate with law enforcement.',
          'Document and notify. Photograph the scene, collect witness info, notify your insurer promptly, and move vehicles out of travel lanes when safe to prevent a secondary crash.',
        ],
      },

      { type: 'h', text: 'Putting it all together' },
      { type: 'p', text: 'The habits that prevent the most crashes are simple and repeatable: scan far ahead, keep space, manage your speed for conditions, drive unimpaired and undistracted, share the road, and always buckle up. After you pass the final exam, your certificate is generated and forwarded to the agency for your records and discount review.' },
    ],
    takeaways: [
      'Slow down and add space in rain, fog, darkness, and ice; ease off — don’t brake — if you hydroplane.',
      'Maintain tires, brakes, lights, and wipers — maintenance is crash prevention.',
      'Skid/blowout: don’t brake hard — steer where you want to go and slow gradually; keep an escape "out."',
      'After a crash in Georgia: stop, aid, report/exchange, document, and notify your insurer.',
    ],
  },
};

export function getModuleContent(contentRef) {
  return ddModuleContent[contentRef] || null;
}
