/**
 * The Activity panel's layout, after Underspire's `.activity` sheet, in our tokens and primitives. The controls are
 * the host's `mu.ui.css` primitives (`.sh-toggle` segments, `.sh-field` inputs, `.sh-cmd` buttons, `.sh-row` events);
 * this sheet only lays them out. Tokens only, radius 0, 1px rules, 0.12 s colour transitions, 24px targets. Every rule
 * is under `.ext-panel[data-ext="activity"]`.
 */
const R = '.ext-panel[data-ext="activity"]';
export const CSS = `
${R} .act { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; background: var(--bg); color: var(--fg); font-family: var(--font-mono); font-size: .8rem; line-height: 1.35; }
${R} .act [hidden] { display: none !important; }
${R} .act button { font-family: inherit; cursor: pointer; border-radius: 0; }
${R} .act button:disabled { cursor: default; }
${R} .act :is(button, input):focus-visible { outline: 2px solid var(--accent-bright); outline-offset: -2px; }

/* Controls: two rows on the elevated bar, a bright rule below. */
${R} .controls { flex: 0 0 auto; padding: 5px 8px; background: var(--bg-elev); border-bottom: 1px solid var(--border-bright); display: flex; flex-direction: column; gap: 4px; }
${R} .crow { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; min-width: 0; }
${R} .seg { display: flex; flex-wrap: wrap; gap: 0 4px; }
${R} .seg.scope { margin-left: auto; }
${R} .filter { flex: 1; min-width: 80px; }
${R} .watch-toggle { flex: none; }

/* The watch manager: a search field, results as rows, the watch list as × commands. */
${R} .watch-manager { display: flex; flex-direction: column; gap: 4px; padding-top: 4px; border-top: 1px solid var(--border); }
${R} .watch-results, ${R} .watch-list { max-height: 140px; overflow: auto; }
${R} .watch-results .sh-row { flex-direction: row; justify-content: space-between; align-items: baseline; gap: 1ch; padding-top: 4px; padding-bottom: 4px; min-height: 24px; font-size: .78rem; }
${R} .watch-results .nm { min-width: 0; overflow-wrap: anywhere; }
${R} .watch-results .meta { display: block; color: var(--fg-dim); font-size: .66rem; letter-spacing: .04em; }
${R} .watch-results .op { flex: none; color: var(--accent-bright); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }
${R} .watch-list { display: flex; flex-wrap: wrap; gap: 2px 6px; }
${R} .watch-list .sh-cmd { max-width: 100%; overflow: hidden; text-overflow: ellipsis; color: var(--accent-bright); text-transform: none; letter-spacing: .04em; }
${R} .hint { margin: 0; color: var(--fg-faint); font-size: .66rem; letter-spacing: .14em; text-transform: uppercase; }

/* Notices: error (alert), gap, rolled out. */
${R} .notice { flex: 0 0 auto; display: flex; align-items: center; gap: 1ch; padding: 3px 8px; min-height: 24px; background: var(--bg-elev); border-bottom: 1px solid var(--border-bright); font-size: .74rem; color: var(--gold); }
${R} .notice.err { color: var(--alert); }
${R} .notice .sh-cmd { margin-left: auto; }

/* The feed. */
${R} .feed { flex: 1; min-height: 0; overflow-y: auto; overflow-anchor: none; display: flex; flex-direction: column; }
${R} .event { border-bottom: 1px solid var(--border); flex: none; }
${R} .event.selected { background: var(--bg-elev); }
${R} .event .sh-row { border-bottom: 0; padding-top: 5px; padding-bottom: 5px; min-height: 24px; }
${R} .event .sh-row::before { top: 5px; }
${R} .event.selected .sh-row::before { color: var(--accent-bright); }
${R} .etop { display: flex; gap: 1ch; align-items: baseline; min-width: 0; }
${R} .etop time { flex: none; color: var(--fg-dim); font-size: .68rem; font-variant-numeric: tabular-nums; }
${R} .etop .kind { flex: none; min-width: 4ch; color: var(--accent-bright); font-size: .64rem; letter-spacing: .12em; text-transform: uppercase; }
${R} .event[data-kind="looc"] .kind { color: var(--gold); }
${R} .etop .summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg-dim); }
${R} .etop .who { color: var(--fg); font-weight: 500; }
${R} .body { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; color: var(--fg); }
${R} .body.expanded { display: block; white-space: pre-wrap; }
${R} .location { display: block; color: var(--gold); font-size: .7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${R} .actions { display: flex; flex-wrap: wrap; gap: 2px 6px; padding: 0 8px 6px 2.4ch; }
${R} .actions .sh-cmd { max-width: 100%; white-space: normal; overflow-wrap: anywhere; text-align: left; }

/* Empty states: uppercase faint labels. */
${R} .empty { margin: 0; padding: 12px 10px; color: var(--fg-faint); font-size: .68rem; letter-spacing: .14em; text-transform: uppercase; line-height: 1.5; }

/* Footer: status, Latest (N), Pause. */
${R} .footer { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 2px 8px; min-height: 28px; background: var(--bg-elev); border-top: 1px solid var(--border-bright); color: var(--fg-dim); font-size: .68rem; letter-spacing: .08em; }
${R} .footer .st { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
${R} .footer .st.paused { color: var(--gold); }

${R} .act ::selection { background: var(--accent-bright); color: var(--bg); }

@media (max-width: 420px) {
  ${R} .act :is(.sh-cmd, .sh-toggle, .sh-row, .sh-field) { min-height: 32px; }
}
`;
