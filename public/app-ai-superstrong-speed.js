/* Super Strong execution cadence.
 *
 * Primary strength remains the learned technique-first planner installed before
 * this adapter: earliest HEXAGON/PYRAMID activation, then follow-up technique,
 * chain value, dual-colour setup, attack and board quality.  Execution speed is
 * important, but strictly secondary: it never changes which placement wins the
 * planner comparison.
 */
(function installSuperStrongExecutionCadence(){
    if(typeof window==="undefined"||window.__hexAiSuperStrongSpeedSecondary)return;
    if(typeof AI_PARAMS==="undefined"||!AI_PARAMS[5])return;

    // Restore the intended Level-5 response cadence after the learned planner
    // deliberately equalised it with Level 4.  These are the original precise
    // Level-5 timings from app-ai-technique.js.
    AI_PARAMS[5].think=.12;
    AI_PARAMS[5].act=.065;
    AI_PARAMS[5].dropMode="hard";
    AI_PARAMS[5].strengthBasis="technique-first-speed-second";

    window.__hexAiSuperStrongSpeedVersion="superstrong-speed-v1";
    window.__hexAiSuperStrongTechniqueFirst=true;
    window.__hexAiSuperStrongSpeedSecondary=true;
    window.__hexAiSuperStrongFastExecution=true;
})();
