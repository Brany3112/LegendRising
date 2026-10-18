/* ============ Training Mode: Ball Receiving and First Touch, the scenarios ============
   Owner: P6-A (Training Mode Phase 6: Ball Receiving and First Touch). Contract: BUILD-PLAN P6-A work item 1 and the
   runner's contract (runner.js registerScenario: build, step, judge, ui); TRAINING-SPEC 4 (Training Hub: each scenario
   with a name, a short description, configuration, Start, reset and back to the hub; the scenario lifecycle) and 5.

   Every drill of receive.js is a scenario of the Ball Receiving and First Touch category, of config type 'receive':
   the hub lists them in the spec's order, each opens the configuration sheet on its own starting values, and presets
   of type 'receive' load into any of them. A go is fed by feeder.js and judged by receive.js; when it is decided the
   runner shows the verdict and plays the same setup again. */
import {registerScenario, RUN} from "./runner.js";
import {DRILLS, TYPE, build, goStep, judge, uiOf, goState} from "./receive.js";

for (const d of DRILLS){
  registerScenario({id:d.id, category:"receiving", type:TYPE, name:d.name, desc:d.desc, config:JSON.parse(JSON.stringify(d.config)),
    build:(config, env) => build(config, env),
    step:(T, run) => { goStep(T.ms, run.config, T.spec); },
    judge:(T, run) => judge(T.ms, goState(T.ms, run.config, T.spec)),
    ui:(T, run) => uiOf(run && run.config)});
}

// tests (DESIGN 1.4.20 style): the go now (its feed: the plan solved and what really flew; the verdict)
if (typeof window !== "undefined") window.__trainReceive = {DRILLS, TYPE, go:() => { const T = RUN.T; return T && T.ms ? goState(T.ms, RUN.cur.config, T.spec) : null; }};
