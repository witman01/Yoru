# Yoru web interface

A night tea house built entirely in three.js code (no models, no texture
files). Leave and collect real cheques on NEAR testnet; Collect needs the
relayer (`node agents/relayer.mjs`) running.

Live at https://yoru-cheque.up.railway.app.

Run it locally from the repository root (the website and the courier together):

    npm start

Then open http://localhost:8787

- `js/house.js`     the lane, facade, noren, roof and tatami room
- `js/objects.js`   the seven interactive objects and their animations
- `js/textures.js`  every surface, painted on canvases at runtime
- `js/fx.js`        renderer, rain, dust, bloom and the ink-bleed pass
- `js/main.js`      scroll camera, panels, index, close-up view, finale forms
- `js/content.js`   all the copy
- `js/chain.js`     wallet, claim codes, signing and the relayer call
