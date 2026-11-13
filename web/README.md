# Yoru web interface

A night tea house built entirely in three.js code (no models, no texture
files). Leave and collect real cheques on NEAR testnet; Collect needs the
relayer (`node agents/relayer.mjs`) running.

Run it (ES modules need a local server, not file://):

    cd web
    python -m http.server 5180

Then open http://127.0.0.1:5180

- `js/house.js`     the lane, facade, noren, roof and tatami room
- `js/objects.js`   the seven interactive objects and their animations
- `js/textures.js`  every surface, painted on canvases at runtime
- `js/fx.js`        renderer, rain, dust, bloom and the ink-bleed pass
- `js/main.js`      scroll camera, panels, index, close-up view, finale forms
- `js/content.js`   all the copy
- `js/chain.js`     wallet, claim codes, signing and the relayer call
