# OCI Converge

**Stop arguing about who is right. Start seeing what is true.**

Open Civilization Intelligence (OCI) Converge is an open-source sociotechnical simulator. Explore energy, water, and pandemic systems — adjust assumptions, watch stocks and flows evolve, and see how cultural memes (narratives) amplify or dampen physical outcomes.

## Live

| | URL |
| :--- | :--- |
| **Frontend** | https://frontend-sooty-zeta-47.vercel.app |
| **Backend** | https://oci-backend.onrender.com |
| **API docs** | https://oci-backend.onrender.com/docs |
| **Source** | https://github.com/robertmoyzynberg/oci |

> First request after idle may take 30–60s while the free-tier Render backend wakes up.

## How to use

1. Open the live app (or click **🚀 Load Example Scenario**).
2. Read the onboarding tip: **circles = stocks**, **arrows = flows**, **gold dots = memes**.
3. Drag assumption sliders (e.g. Fossil Retirement Rate), then **Run Simulation**.
4. Scrub the time slider — watch capacity vs **Grid Demand**; if capacity falls below demand, the system enters a **blackout** state and Blackout Anxiety grows.
5. Hover a gold meme to see what it influences (`+` / `−`).
6. Click **📤 Share Challenge** to copy a classroom-ready assignment with your current link.

## Shareable URLs

Tweaking assumptions updates the browser URL hash with an encoded copy of the system map.

1. Move an assumption slider — the `#…` hash updates after ~500ms.
2. Click **Copy Link** or **Share Challenge**.
3. Anyone who opens that URL loads the same map and assumptions.

Invalid or missing hashes fall back to the Renewable Energy Transition demo.

## Scenarios

- **⚡ Energy Transition** — fossil vs renewable capacity, Grid Demand baseline, blackout risk
- **🌊 Water Crisis** — reservoir, agriculture, population under drought pressure
- **🦠 Pandemic Spread** — SIR + vaccine rollout dynamics

## Stack

- **Backend:** Python, FastAPI, safe Euler simulation engine (GST + memetics)
- **Frontend:** React, TypeScript, Vite, D3
- **Deploy:** Render (API), Vercel (UI)

## Local development

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. uvicorn app.main:app --reload --port 8000

# Frontend (Vite proxies /api → localhost:8000)
cd frontend
npm install
npm run dev
```

Set `VITE_API_URL` in production to the Render backend URL (`frontend/vercel.json` / Vercel env).

## Deploy

- Backend: Render Blueprint (`render.yaml` / `backend/render.yaml`)
- Frontend: `cd frontend && vercel --prod --yes`

## Feedback

Use the **✉️** button in the live app (preferred), or email **rizim13@gmail.com**.

## Contributing

Contributions are welcome — especially new scenarios, clearer pedagogy, and Construct Mode (node-edge editor).

1. Fork the repo and create a feature branch.
2. Keep changes focused; match existing TypeScript / FastAPI style.
3. Test locally (`npm run build` in `frontend/`; run a simulate request against the API).
4. Open a PR with a short summary of *why* and how to verify.

Ideas that fit the roadmap:

- Shock events / latency (P2)
- Custom challenge text editor for educators
- Full Construct Mode (drag-to-connect stocks, flows, memes)

## License

See repository license file (or add one before wide redistribution).
